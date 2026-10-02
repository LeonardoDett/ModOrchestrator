package skyrimse

import (
	"bytes"
	"encoding/binary"
	"math"
	"slices"
	"testing"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/plugin"
)

// tes4 builds a TES4 record with the given flags and subrecords.
func tes4(flags uint32, subs ...[2]string) []byte {
	var data bytes.Buffer
	hedr := make([]byte, 12)
	binary.LittleEndian.PutUint32(hedr, math.Float32bits(1.71))
	sub := func(typ string, v []byte) {
		data.WriteString(typ)
		_ = binary.Write(&data, binary.LittleEndian, uint16(len(v)))
		data.Write(v)
	}
	sub("HEDR", hedr)
	for _, s := range subs {
		sub(s[0], append([]byte(s[1]), 0))
		if s[0] == "MAST" {
			sub("DATA", make([]byte, 8))
		}
	}
	var out bytes.Buffer
	out.WriteString("TES4")
	_ = binary.Write(&out, binary.LittleEndian, uint32(data.Len()))
	_ = binary.Write(&out, binary.LittleEndian, flags)
	out.Write(make([]byte, 12))
	out.Write(data.Bytes())
	out.WriteString("GRUP....") // the rest of the file is never read
	return out.Bytes()
}

func TestReadHeader(t *testing.T) {
	a := Adapter{}
	h, err := a.ReadHeader(GameID, "Tiny.esp", bytes.NewReader(tes4(recordLight, [2]string{"CNAM", "Author"}, [2]string{"SNAM", "Desc"}, [2]string{"MAST", "Skyrim.esm"}, [2]string{"MAST", "Lib.esm"})))
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(h.Masters, []plugin.Name{"Skyrim.esm", "Lib.esm"}) || h.Author != "Author" || h.Description != "Desc" || h.Version != "1.71" {
		t.Fatalf("header: %+v", h)
	}
	if !slices.Equal(h.Flags, []plugin.Flag{FlagLight}) {
		t.Fatalf("an .esp with the ESL flag is light, not master: %v", h.Flags)
	}
	h, _ = a.ReadHeader(GameID, "x.esl", bytes.NewReader(tes4(0)))
	if !slices.Equal(h.Flags, []plugin.Flag{FlagMaster, FlagLight}) {
		t.Fatalf(".esl means master + light: %v", h.Flags)
	}
	if _, err := a.ReadHeader(GameID, "bad.esp", bytes.NewReader([]byte("not a plugin at all, really"))); err == nil {
		t.Fatal("non-TES4 must fail")
	}
}

// core/12 §11: an .esp with the ESL flag gets an FE:xxx index.
func TestIndexesAndLimits(t *testing.T) {
	ps := []plugin.Plugin{
		{Name: "Skyrim.esm", Header: plugin.Header{Flags: []plugin.Flag{FlagMaster}}},
		{Name: "Tiny.esp", Header: plugin.Header{Flags: []plugin.Flag{FlagLight}}},
		{Name: "B.esp"},
	}
	idx, usage := Adapter{}.Indexes(GameID, ps)
	if idx["skyrim.esm"] != "00" || idx["tiny.esp"] != "FE:000" || idx["b.esp"] != "01" {
		t.Fatalf("indexes %v", idx)
	}
	if usage[0].Used != 2 || usage[1].Used != 1 || usage[0].Max != 254 {
		t.Fatalf("usage %v", usage)
	}
}

func TestConstraints(t *testing.T) {
	ps := []plugin.Plugin{
		{Name: "Lib.esm", Header: plugin.Header{Flags: []plugin.Flag{FlagMaster}}},
		{Name: "Patch.esp", Header: plugin.Header{Masters: []plugin.Name{"lib.ESM", "Missing.esm"}}},
	}
	edges := Adapter{}.Constraints(GameID, ps)
	if len(edges) != 2 || edges[0].Before != "lib.esm" || edges[0].After != "patch.esp" {
		t.Fatalf("edges %v", edges)
	}
}

// core/12 §11: plugins.txt written is read back identically.
func TestPluginsTxtRoundTrip(t *testing.T) {
	a := Adapter{}
	in := []plugin.Entry{
		{Name: "Skyrim.esm", Enabled: true, Implicit: true},
		{Name: "Café Mod.esp", Enabled: true},
		{Name: "Off.esp"},
		{Name: "Tiny.esl", Enabled: true},
	}
	data, err := a.Serialize(GameID, in)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(data, []byte("Skyrim.esm")) || !bytes.Contains(data, []byte("*Caf\xe9 Mod.esp\r\nOff.esp\r\n")) {
		t.Fatalf("format: %q", data)
	}
	back, err := a.Parse(GameID, data)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(back, in[1:]) {
		t.Fatalf("round trip: %+v", back)
	}
	again, _ := a.Serialize(GameID, back)
	if !bytes.Equal(again, data) {
		t.Fatal("serialize(parse(x)) must equal x")
	}
}

func TestLoadOrderFileByStore(t *testing.T) {
	a := Adapter{}
	if a.LoadOrderFile(game.Instance{Store: "steam"}).Path != "Skyrim Special Edition/plugins.txt" ||
		a.LoadOrderFile(game.Instance{Store: "gog"}).Path != "Skyrim Special Edition GOG/plugins.txt" {
		t.Fatal("plugins.txt location")
	}
}

func TestOrphanArchives(t *testing.T) {
	got := Adapter{}.OrphanArchives(GameID, []string{"Mod.bsa", "Mod - Textures.bsa", "Lonely.bsa", "Mod.esp"}, []plugin.Name{"mod.ESP"})
	if !slices.Equal(got, []string{"Lonely.bsa"}) {
		t.Fatalf("orphans %v", got)
	}
}
