package skyrimse

import (
	"bytes"
	"compress/zlib"
	"encoding/binary"
	"slices"
	"testing"
	"time"

	"modorchestrator/sdk"
	"modorchestrator/sdk/game"
	"modorchestrator/sdk/savegame"
)

// essOptions describe a synthetic save.
type essOptions struct {
	version     uint32
	compression uint16 // 0 none, 1 zlib, 2 lz4 (literals only)
	form        uint8
	plugins     []string
	light       []string
}

func wstr(b *bytes.Buffer, s string) {
	enc, _ := toCP1252(s)
	binary.Write(b, binary.LittleEndian, uint16(len(enc)))
	b.Write(enc)
}

// lz4Literals encodes data as one LZ4 block made only of literals.
func lz4Literals(data []byte) []byte {
	var b bytes.Buffer
	n := len(data)
	if n < 15 {
		b.WriteByte(byte(n << 4))
	} else {
		b.WriteByte(0xF0)
		rest := n - 15
		for rest >= 255 {
			b.WriteByte(255)
			rest -= 255
		}
		b.WriteByte(byte(rest))
	}
	b.Write(data)
	return b.Bytes()
}

// ess builds a save in the layout of the game (UESP "Skyrim Mod:Save File
// Format"): magic, header size, header, screenshot, then the body.
func ess(o essOptions, savedAt time.Time) []byte {
	var hdr bytes.Buffer
	le := func(v any) { binary.Write(&hdr, binary.LittleEndian, v) }
	le(o.version)
	le(uint32(142))
	wstr(&hdr, "Ysolda Pedra-Fria")
	le(uint32(34))
	wstr(&hdr, "Ruínas de Bleak Falls")
	wstr(&hdr, "041.14.20")
	wstr(&hdr, "NordRace")
	le(uint16(1))
	le(float32(10))
	le(float32(20))
	le(uint64(savedAt.UnixNano()/100) + 116444736000000000)
	le(uint32(2)) // width
	le(uint32(1)) // height
	if o.version >= 12 {
		le(o.compression)
	}
	var body bytes.Buffer
	body.WriteByte(o.form)
	binary.Write(&body, binary.LittleEndian, uint32(0))
	body.WriteByte(byte(len(o.plugins)))
	for _, p := range o.plugins {
		wstr(&body, p)
	}
	if o.form >= 78 {
		binary.Write(&body, binary.LittleEndian, uint16(len(o.light)))
		for _, p := range o.light {
			wstr(&body, p)
		}
	}
	body.Write(make([]byte, 64)) // rest of the body, not read

	var out bytes.Buffer
	out.WriteString(saveMagic)
	binary.Write(&out, binary.LittleEndian, uint32(hdr.Len()))
	out.Write(hdr.Bytes())
	if o.version >= 12 {
		out.Write([]byte{10, 20, 30, 0, 40, 50, 60, 0}) // RGBA
	} else {
		out.Write([]byte{10, 20, 30, 40, 50, 60}) // RGB
	}
	switch o.compression {
	case 0:
		out.Write(body.Bytes())
	case 1:
		var z bytes.Buffer
		w := zlib.NewWriter(&z)
		w.Write(body.Bytes())
		w.Close()
		binary.Write(&out, binary.LittleEndian, uint32(body.Len()))
		binary.Write(&out, binary.LittleEndian, uint32(z.Len()))
		out.Write(z.Bytes())
	case 2:
		packed := lz4Literals(body.Bytes())
		binary.Write(&out, binary.LittleEndian, uint32(body.Len()))
		binary.Write(&out, binary.LittleEndian, uint32(len(packed)))
		out.Write(packed)
	}
	return out.Bytes()
}

func TestReadSaveSE(t *testing.T) {
	at := time.Date(2026, 10, 20, 21, 2, 0, 0, time.UTC)
	for _, c := range []uint16{0, 1, 2} {
		data := ess(essOptions{version: 12, compression: c, form: 78, plugins: []string{"Skyrim.esm", "LanternasCidades.esp"}, light: []string{"Café.esl"}}, at)
		h, err := Adapter{}.ReadSave(GameID, "Save142_Ysolda.ess", bytes.NewReader(data))
		if err != nil {
			t.Fatalf("compression %d: %v", c, err)
		}
		if h.Number != 142 || h.Character != "Ysolda Pedra-Fria" || h.Level != 34 || h.Location != "Ruínas de Bleak Falls" || h.Race != "Nord" || h.GameDay != 41 || h.GameHour != 14 || h.GameMinute != 20 || h.Kind != savegame.KindManual {
			t.Errorf("compression %d: header %+v", c, h)
		}
		if !h.SavedAt.Equal(at) {
			t.Errorf("saved at %v", h.SavedAt)
		}
		if !slices.Equal(h.Plugins, []string{"Skyrim.esm", "LanternasCidades.esp", "Café.esl"}) {
			t.Errorf("compression %d: plugins %v", c, h.Plugins)
		}
		if h.Screenshot == nil || h.Screenshot.Width != 2 || !bytes.Equal(h.Screenshot.RGBA, []byte{10, 20, 30, 255, 40, 50, 60, 255}) {
			t.Errorf("screenshot %+v", h.Screenshot)
		}
	}
}

func TestReadSaveOriginalGameFormat(t *testing.T) {
	data := ess(essOptions{version: 9, form: 74, plugins: []string{"Skyrim.esm"}}, time.Now())
	h, err := Adapter{}.ReadSave(GameID, "Quicksave0.ess", bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	if h.Kind != savegame.KindQuick || !slices.Equal(h.Plugins, []string{"Skyrim.esm"}) || !bytes.Equal(h.Screenshot.RGBA, []byte{10, 20, 30, 255, 40, 50, 60, 255}) {
		t.Fatalf("header %+v", h)
	}
}

func TestReadSaveRefusesOtherFiles(t *testing.T) {
	if _, err := (Adapter{}).ReadSave(GameID, "x.ess", bytes.NewReader([]byte("FO4_SAVEGAME...."))); err == nil {
		t.Fatal("a file that is not a save was read")
	}
	data := ess(essOptions{version: 12, compression: 2, form: 78, plugins: []string{"A.esp"}}, time.Now())
	if _, err := (Adapter{}).ReadSave(GameID, "x.ess", bytes.NewReader(data[:len(data)-30])); err == nil {
		t.Fatal("a truncated save was read")
	}
}

func TestLZ4BlockWithMatches(t *testing.T) {
	// "abcabcabcX": literals "abc", match offset 3 length 6, last literals "X".
	src := []byte{0x32, 'a', 'b', 'c', 3, 0, 0x10, 'X'}
	got, err := lz4Block(src, 64)
	if err != nil || string(got) != "abcabcabcX" {
		t.Fatalf("got %q %v", got, err)
	}
	if _, err := lz4Block([]byte{0x10, 'a', 9, 0}, 64); err == nil {
		t.Fatal("offset beyond the output was accepted")
	}
	if _, err := lz4Block(src, 5); err == nil {
		t.Fatal("output beyond the size was accepted")
	}
}

func TestSaveRedirectAndFiles(t *testing.T) {
	r := Adapter{}.SaveRedirect(game.Instance{Store: "gog"})
	if !r.Valid() || r.Folder != sdk.FolderDocuments || r.Settings != "My Games/Skyrim Special Edition GOG/SkyrimCustom.ini" || r.Key != "SLocalSavePath" || r.Section != "General" {
		t.Fatalf("redirect %+v", r)
	}
	if v := r.Value("p1"); v != `Saves\p1\` {
		t.Fatalf("value %q", v)
	}
	if f := r.FolderOf(`Saves\p1\`); f != "My Games/Skyrim Special Edition GOG/Saves/p1" {
		t.Fatalf("folder %q", f)
	}
	if f := r.FolderOf(""); f != "My Games/Skyrim Special Edition GOG/Saves" {
		t.Fatalf("default folder %q", f)
	}
	a := Adapter{}
	if !a.IsSave(GameID, "Save1.ESS") || a.IsSave(GameID, "Save1.skse") {
		t.Fatal("IsSave")
	}
	if c := a.SaveCompanions(GameID, "Save1.ess"); !slices.Equal(c, []string{"Save1.skse"}) {
		t.Fatalf("companions %v", c)
	}
}
