package skyrimse

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
	"unicode/utf8"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/plugin"
)

var (
	_ ports.PluginSupport    = Adapter{}
	_ ports.LoadOrderSupport = Adapter{}
	_ ports.PluginArchives   = Adapter{}
)

// Header flags (core/12 §5), normalised for the core.
const (
	FlagMaster plugin.Flag = "master"
	FlagLight  plugin.Flag = "light"

	recordMaster = 0x1
	recordLight  = 0x200

	// Limits of Skyrim SE (core/12 §5).
	MaxFull  = 254
	MaxLight = 4096

	// Kinds of LimitUsage and of the adapter edges.
	LimitFull  = "full"
	LimitLight = "light"
	refMaster  = plugin.RefAdapterPrefix + "master"
	refFlag    = plugin.RefAdapterPrefix + "master_flag"

	// CCCFile lists the Creation Club plugins loaded as implicit.
	CCCFile = "Skyrim.ccc"
	// maxHeader bounds what is read of a TES4 record.
	maxHeader = 1 << 20
)

// implicitMasters always load first, in this order (core/12 §5).
var implicitMasters = []plugin.Name{"Skyrim.esm", "Update.esm", "Dawnguard.esm", "HearthFires.esm", "Dragonborn.esm"}

// Errors of the header reader.
var ErrNotPlugin = errors.New("skyrimse: not a TES4 plugin")

func (Adapter) PluginTarget(game.ID) game.TargetID { return TargetData }

func (Adapter) IsPlugin(_ game.ID, name string) bool {
	if strings.ContainsAny(name, `/\`) {
		return false
	}
	switch strings.ToLower(name[strings.LastIndex(name, ".")+1:]) {
	case "esp", "esm", "esl":
		return true
	}
	return false
}

// ReadHeader reads the TES4 record (core/12 §5): flags 0x1 master and 0x200
// light; MAST = masters, SNAM = description, CNAM = author, HEDR version.
// Extension .esm implies master; .esl implies master + light.
func (Adapter) ReadHeader(_ game.ID, name string, r io.Reader) (plugin.Header, error) {
	var head [24]byte
	if _, err := io.ReadFull(r, head[:]); err != nil {
		return plugin.Header{}, fmt.Errorf("%w: %v", ErrNotPlugin, err)
	}
	if string(head[:4]) != "TES4" {
		return plugin.Header{}, ErrNotPlugin
	}
	size := binary.LittleEndian.Uint32(head[4:8])
	flags := binary.LittleEndian.Uint32(head[8:12])
	if size > maxHeader {
		return plugin.Header{}, fmt.Errorf("%w: header of %d bytes", ErrNotPlugin, size)
	}
	data := make([]byte, size)
	if _, err := io.ReadFull(r, data); err != nil {
		return plugin.Header{}, fmt.Errorf("%w: truncated header", ErrNotPlugin)
	}
	var h plugin.Header
	ext := strings.ToLower(name[strings.LastIndex(name, ".")+1:])
	if flags&recordMaster != 0 || ext == "esm" || ext == "esl" {
		h.Flags = append(h.Flags, FlagMaster)
	}
	if flags&recordLight != 0 || ext == "esl" {
		h.Flags = append(h.Flags, FlagLight)
	}
	var next uint32 // size given by an XXXX subrecord
	for p := 0; p+6 <= len(data); {
		typ := string(data[p : p+4])
		n := uint32(binary.LittleEndian.Uint16(data[p+4 : p+6]))
		p += 6
		if next > 0 {
			n, next = next, 0
		}
		if p+int(n) > len(data) {
			return plugin.Header{}, fmt.Errorf("%w: subrecord %s past the end", ErrNotPlugin, typ)
		}
		v := data[p : p+int(n)]
		p += int(n)
		switch typ {
		case "XXXX":
			if len(v) == 4 {
				next = binary.LittleEndian.Uint32(v)
			}
		case "HEDR":
			if len(v) >= 4 {
				f := math.Float32frombits(binary.LittleEndian.Uint32(v[:4]))
				h.Version = strconv.FormatFloat(float64(f), 'f', -1, 32)
			}
		case "MAST":
			h.Masters = append(h.Masters, plugin.Name(zstring(v)))
		case "SNAM":
			h.Description = zstring(v)
		case "CNAM":
			h.Author = zstring(v)
		}
	}
	return h, nil
}

// Implicit: the base masters, then the Creation Club plugins listed in
// <root>/Skyrim.ccc in file order, when they exist in Data (core/12 §5).
func (Adapter) Implicit(ctx context.Context, fs ports.FileReader, inst game.Instance, names []plugin.Name) ([]plugin.Name, error) {
	present := map[string]plugin.Name{}
	for _, n := range names {
		present[n.Key()] = n
	}
	var out []plugin.Name
	seen := map[string]bool{}
	add := func(n plugin.Name) {
		if p, ok := present[n.Key()]; ok && !seen[n.Key()] {
			seen[n.Key()] = true
			out = append(out, p)
		}
	}
	for _, n := range implicitMasters {
		add(n)
	}
	f, err := fs.Open(ctx, game.JoinPath(inst.Root, CCCFile))
	if err != nil {
		return out, nil // no Creation Club list: only the base masters
	}
	defer f.Close()
	sc := bufio.NewScanner(io.LimitReader(f, 1<<20))
	for sc.Scan() {
		if line := strings.TrimSpace(sc.Text()); line != "" && !strings.HasPrefix(line, "#") {
			add(plugin.Name(line))
		}
	}
	return out, nil
}

// Constraints: masters before dependents, and plugins with the master flag
// (.esm/.esl included) before the others (core/12 §5). The implicit
// plugins are fixed by the core from Implicit.
func (Adapter) Constraints(_ game.ID, plugins []plugin.Plugin) []ordering.Edge {
	present := map[string]bool{}
	for _, p := range plugins {
		present[p.Name.Key()] = true
	}
	var out []ordering.Edge
	var masters, others []string
	for _, p := range plugins {
		for _, m := range p.Header.Masters {
			if present[m.Key()] && m.Key() != p.Name.Key() {
				out = append(out, ordering.Edge{Before: ordering.Item(m.Key()), After: ordering.Item(p.Name.Key()), Ref: refMaster})
			}
		}
		if p.HasFlag(FlagMaster) {
			masters = append(masters, p.Name.Key())
		} else {
			others = append(others, p.Name.Key())
		}
	}
	for _, m := range masters {
		for _, o := range others {
			out = append(out, ordering.Edge{Before: ordering.Item(m), After: ordering.Item(o), Ref: refFlag})
		}
	}
	return out
}

// Indexes: full plugins get 00–FD, light ones FE:000–FE:FFF (core/12 §5).
func (Adapter) Indexes(_ game.ID, active []plugin.Plugin) (map[string]string, []plugin.LimitUsage) {
	out := make(map[string]string, len(active))
	full, light := 0, 0
	for _, p := range active {
		if p.HasFlag(FlagLight) {
			out[p.Name.Key()] = fmt.Sprintf("FE:%03X", light)
			light++
			continue
		}
		out[p.Name.Key()] = fmt.Sprintf("%02X", full)
		full++
	}
	return out, []plugin.LimitUsage{{Kind: LimitFull, Used: full, Max: MaxFull}, {Kind: LimitLight, Used: light, Max: MaxLight}}
}

// LoadOrderFile is plugins.txt below %LOCALAPPDATA% (core/12 §5): "Skyrim
// Special Edition", with the GOG variant confirmed; the Epic variant
// follows Vortex's convention and is still to be verified.
func (Adapter) LoadOrderFile(inst game.Instance) ports.FileLocation {
	folder := "Skyrim Special Edition"
	switch inst.Store {
	case "gog":
		folder += " GOG"
	case "epic":
		folder += " EPIC"
	}
	return ports.FileLocation{Folder: ports.FolderLocalAppData, Path: folder + "/plugins.txt"}
}

func (Adapter) ManualOrder(game.ID) bool { return true }

// Serialize writes one plugin per line in order, active ones with "*";
// implicit plugins are not written; Windows-1252 with CRLF (core/12 §5).
func (Adapter) Serialize(_ game.ID, entries []plugin.Entry) ([]byte, error) {
	var b bytes.Buffer
	b.WriteString("# This file is used by Skyrim to keep track of your downloaded content.\r\n")
	b.WriteString("# Please do not modify this file.\r\n")
	for _, e := range entries {
		if e.Implicit {
			continue
		}
		enc, err := toCP1252(string(e.Name))
		if err != nil {
			return nil, err
		}
		if e.Enabled {
			b.WriteByte('*')
		}
		b.Write(enc)
		b.WriteString("\r\n")
	}
	return b.Bytes(), nil
}

// Parse reads plugins.txt: comments and blank lines are skipped, "*"
// marks active plugins. Text is UTF-8 when valid, else Windows-1252.
func (Adapter) Parse(_ game.ID, data []byte) ([]plugin.Entry, error) {
	text := string(data)
	if !utf8.Valid(data) {
		text = fromCP1252(data)
	}
	text = strings.TrimPrefix(text, "\ufeff")
	var out []plugin.Entry
	seen := map[string]bool{}
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		e := plugin.Entry{}
		if rest, ok := strings.CutPrefix(line, "*"); ok {
			e.Enabled, line = true, strings.TrimSpace(rest)
		}
		e.Name = plugin.Name(line)
		if line == "" || seen[e.Name.Key()] {
			continue
		}
		seen[e.Name.Key()] = true
		out = append(out, e)
	}
	return out, nil
}

func zstring(b []byte) string {
	if i := bytes.IndexByte(b, 0); i >= 0 {
		b = b[:i]
	}
	if utf8.Valid(b) {
		return string(b)
	}
	return fromCP1252(b)
}

// cp1252 maps 0x80–0x9F of Windows-1252.
var cp1252 = [32]rune{
	'€', '\u0081', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '\u008d', 'Ž', '\u008f',
	'\u0090', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', '\u009d', 'ž', 'Ÿ',
}

func fromCP1252(b []byte) string {
	var sb strings.Builder
	for _, c := range b {
		switch {
		case c < 0x80:
			sb.WriteByte(c)
		case c < 0xA0:
			sb.WriteRune(cp1252[c-0x80])
		default:
			sb.WriteRune(rune(c))
		}
	}
	return sb.String()
}

func toCP1252(s string) ([]byte, error) {
	out := make([]byte, 0, len(s))
	for _, r := range s {
		switch {
		case r < 0x80, r >= 0xA0 && r <= 0xFF:
			out = append(out, byte(r))
		default:
			i := -1
			for k, c := range cp1252 {
				if c == r {
					i = k
					break
				}
			}
			if i < 0 {
				return nil, fmt.Errorf("skyrimse: %q cannot be written in Windows-1252", s)
			}
			out = append(out, byte(0x80+i))
		}
	}
	return out, nil
}

// OrphanArchives: a BSA loads when an active plugin has the same base name
// ("Mod.bsa", "Mod - Textures.bsa" for "Mod.esp", core/12 §5).
func (Adapter) OrphanArchives(_ game.ID, files []string, active []plugin.Name) []string {
	bases := map[string]bool{}
	for _, p := range active {
		n := strings.ToLower(string(p))
		bases[n[:max(strings.LastIndex(n, "."), 0)]] = true
	}
	var out []string
	for _, f := range files {
		lower := strings.ToLower(f)
		if !strings.HasSuffix(lower, ".bsa") {
			continue
		}
		base := strings.TrimSuffix(lower, ".bsa")
		if bases[base] {
			continue
		}
		if i := strings.LastIndex(base, " - "); i > 0 && bases[base[:i]] {
			continue
		}
		out = append(out, f)
	}
	return out
}
