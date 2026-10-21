package skyrimse

import (
	"bytes"
	"compress/zlib"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"path"
	"strconv"
	"strings"
	"time"

	"modorchestrator/sdk"
	"modorchestrator/sdk/game"
	"modorchestrator/sdk/savegame"
)

// Saves (core/12 §10, D142). The game reads SLocalSavePath from [General]
// of SkyrimCustom.ini, below "My Games\Skyrim Special Edition" in the
// Documents folder (" GOG" and " EPIC" variants as for plugins.txt), and
// saves to <that folder>\<value>; without the key it uses "Saves\".
const (
	saveExt       = ".ess"
	coSaveExt     = ".skse" // SKSE64 co-save, same base name
	customINI     = "SkyrimCustom.ini"
	saveKey       = "SLocalSavePath"
	saveSection   = "General"
	defaultSaves  = `Saves\`
	saveMagic     = "TESV_SAVEGAME"
	maxSaveHeader = 64 << 20 // a screenshot is a few MB; more is not a save
)

func myGames(inst game.Instance) string {
	folder := "My Games/Skyrim Special Edition"
	switch inst.Store {
	case "gog":
		folder += " GOG"
	case "epic":
		folder += " EPIC"
	}
	return folder
}

// SaveRedirect is SLocalSavePath in SkyrimCustom.ini (core/12 §10).
func (Adapter) SaveRedirect(inst game.Instance) savegame.Redirect {
	base := myGames(inst)
	return savegame.Redirect{
		Folder: sdk.FolderDocuments, Settings: base + "/" + customINI, Section: saveSection, Key: saveKey,
		Base: base, Default: defaultSaves, Separator: `\`,
	}
}

// IsSave reports whether a file is a save (".ess").
func (Adapter) IsSave(_ game.ID, name string) bool {
	return strings.EqualFold(path.Ext(name), saveExt)
}

// SaveCompanions is the SKSE co-save of a save.
func (Adapter) SaveCompanions(_ game.ID, name string) []string {
	return []string{strings.TrimSuffix(name, path.Ext(name)) + coSaveExt}
}

// ReadSave reads the header of a .ess (Skyrim SE format, version 12, and
// the original game format, version 9): character, level, location, game
// date, race, file time, screenshot, then the plugin list at the start of
// the body, which SE compresses with LZ4 or zlib.
func (Adapter) ReadSave(_ game.ID, name string, r io.Reader) (savegame.Header, error) {
	var h savegame.Header
	h.Kind = saveKind(name)
	br := &saveReader{r: io.LimitReader(r, maxSaveHeader)}
	magic := br.bytes(len(saveMagic))
	if br.err == nil && string(magic) != saveMagic {
		return h, errors.New("not a Skyrim save")
	}
	_ = br.u32() // header size
	version := br.u32()
	h.Number = int(br.u32())
	h.Character = br.wstring()
	h.Level = int(br.u32())
	h.Location = br.wstring()
	h.GameTime = br.wstring()
	h.GameDay, h.GameHour, h.GameMinute = gameClock(h.GameTime)
	// The race is its editor id ("NordRace"); the name is what precedes Race.
	h.Race = strings.TrimSuffix(br.wstring(), "Race")
	_ = br.u16()    // sex
	_ = br.bytes(8) // current and next level experience
	ft := br.u64()  // FILETIME
	w, hh := int(br.u32()), int(br.u32())
	compression := uint16(0)
	if version >= 12 {
		compression = br.u16()
	}
	if br.err != nil {
		return h, fmt.Errorf("save header: %w", br.err)
	}
	if ft != 0 {
		h.SavedAt = filetime(ft)
	}
	bpp := 3
	if version >= 12 {
		bpp = 4
	}
	if w <= 0 || hh <= 0 || w*hh > 4096*4096 {
		return h, errors.New("save screenshot size out of range")
	}
	pix := br.bytes(w * hh * bpp)
	if br.err != nil {
		return h, fmt.Errorf("save screenshot: %w", br.err)
	}
	h.Screenshot = &savegame.Screenshot{Width: w, Height: hh, RGBA: rgba(pix, bpp)}
	body := br.r
	switch compression {
	case 0:
	case 1, 2:
		raw := br.u32()
		packed := br.u32()
		if br.err != nil || raw > maxSaveHeader*4 || packed > maxSaveHeader {
			return h, errors.New("save body size out of range")
		}
		data := br.bytes(int(packed))
		if br.err != nil {
			return h, fmt.Errorf("save body: %w", br.err)
		}
		var out []byte
		var err error
		if compression == 1 {
			var zr io.ReadCloser
			if zr, err = zlib.NewReader(bytes.NewReader(data)); err == nil {
				out, err = io.ReadAll(io.LimitReader(zr, int64(raw)))
				zr.Close()
			}
		} else {
			out, err = lz4Block(data, int(raw))
		}
		if err != nil {
			return h, fmt.Errorf("save body: %w", err)
		}
		body = bytes.NewReader(out)
	default:
		return h, fmt.Errorf("save compression %d unknown", compression)
	}
	plugins, err := savePlugins(body)
	h.Plugins = plugins
	return h, err
}

// gameClock reads "days.hours.minutes" (as "041.14.20"); 0 when unknown.
func gameClock(s string) (day, hour, minute int) {
	parts := strings.Split(strings.TrimSpace(s), ".")
	if len(parts) != 3 {
		return 0, 0, 0
	}
	var v [3]int
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 {
			return 0, 0, 0
		}
		v[i] = n
	}
	return v[0], v[1], v[2]
}

func saveKind(name string) savegame.Kind {
	low := strings.ToLower(name)
	switch {
	case strings.HasPrefix(low, "quicksave"):
		return savegame.KindQuick
	case strings.HasPrefix(low, "autosave"):
		return savegame.KindAuto
	}
	return savegame.KindManual
}

// savePlugins reads the plugin list at the start of the body: form version,
// size, the full plugins and, from form version 78, the light ones.
func savePlugins(r io.Reader) ([]string, error) {
	br := &saveReader{r: r}
	form := br.u8()
	_ = br.u32() // plugin info size
	n := int(br.u8())
	var out []string
	for i := 0; i < n && br.err == nil; i++ {
		out = append(out, br.wstring())
	}
	if form >= 78 && br.err == nil {
		light := int(br.u16())
		for i := 0; i < light && br.err == nil; i++ {
			out = append(out, br.wstring())
		}
	}
	if br.err != nil {
		return out, fmt.Errorf("save plugins: %w", br.err)
	}
	return out, nil
}

// rgba turns the screenshot into opaque RGBA (SE stores RGBA with an alpha
// the game does not use; the original game stores RGB).
func rgba(pix []byte, bpp int) []byte {
	n := len(pix) / bpp
	out := make([]byte, n*4)
	for i := 0; i < n; i++ {
		copy(out[i*4:i*4+3], pix[i*bpp:i*bpp+3])
		out[i*4+3] = 0xFF
	}
	return out
}

// filetime converts a Windows FILETIME (100 ns since 1601) to time.
func filetime(ft uint64) time.Time {
	const epochDiff = 116444736000000000
	if ft < epochDiff {
		return time.Time{}
	}
	return time.Unix(0, int64(ft-epochDiff)*100).UTC()
}

type saveReader struct {
	r   io.Reader
	err error
}

func (b *saveReader) bytes(n int) []byte {
	if b.err != nil || n < 0 {
		return nil
	}
	buf := make([]byte, n)
	if _, err := io.ReadFull(b.r, buf); err != nil {
		b.err = err
		return nil
	}
	return buf
}

func (b *saveReader) u8() uint8 {
	v := b.bytes(1)
	if v == nil {
		return 0
	}
	return v[0]
}

func (b *saveReader) u16() uint16 {
	v := b.bytes(2)
	if v == nil {
		return 0
	}
	return binary.LittleEndian.Uint16(v)
}

func (b *saveReader) u32() uint32 {
	v := b.bytes(4)
	if v == nil {
		return 0
	}
	return binary.LittleEndian.Uint32(v)
}

func (b *saveReader) u64() uint64 {
	v := b.bytes(8)
	if v == nil {
		return 0
	}
	return binary.LittleEndian.Uint64(v)
}

// wstring is a length-prefixed (uint16) Windows-1252 string.
func (b *saveReader) wstring() string {
	n := int(b.u16())
	return fromCP1252(b.bytes(n))
}

var errLZ4 = errors.New("lz4: corrupt block")

// lz4Block decodes one LZ4 block (no frame), producing at most size bytes.
func lz4Block(src []byte, size int) ([]byte, error) {
	dst := make([]byte, 0, size)
	length := func(i, n int) (int, int, error) {
		if n != 15 {
			return i, n, nil
		}
		for {
			if i >= len(src) {
				return i, n, errLZ4
			}
			c := src[i]
			i++
			n += int(c)
			if c != 255 {
				return i, n, nil
			}
		}
	}
	var lit, ml int
	var err error
	for i := 0; i < len(src); {
		token := src[i]
		i++
		i, lit, err = length(i, int(token>>4))
		if err != nil {
			return nil, err
		}
		if i+lit > len(src) || len(dst)+lit > size {
			return nil, errLZ4
		}
		dst = append(dst, src[i:i+lit]...)
		i += lit
		if i == len(src) {
			break // the last sequence has only literals
		}
		if i+2 > len(src) {
			return nil, errLZ4
		}
		off := int(src[i]) | int(src[i+1])<<8
		i += 2
		if off == 0 || off > len(dst) {
			return nil, errLZ4
		}
		i, ml, err = length(i, int(token&15))
		if err != nil {
			return nil, err
		}
		ml += 4
		if len(dst)+ml > size {
			return nil, errLZ4
		}
		start := len(dst) - off
		for k := 0; k < ml; k++ { // overlapping copies repeat bytes
			dst = append(dst, dst[start+k])
		}
	}
	return dst, nil
}
