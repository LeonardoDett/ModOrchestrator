package skyrimse

import (
	"bytes"
	"encoding/binary"
	"math"
	"testing"

	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/sdk"
)

// withVersion rewrites the HEDR version of a record built by tes4.
func withVersion(rec []byte, v float32) []byte {
	out := bytes.Clone(rec)
	i := bytes.Index(out, []byte("HEDR"))
	binary.LittleEndian.PutUint32(out[i+6:], math.Float32bits(v))
	return out
}

func TestPluginWrongGameVersion(t *testing.T) {
	a := Adapter{}
	read := func(name string, v float32) plugin.Header {
		t.Helper()
		h, err := a.ReadHeader(GameID, name, bytes.NewReader(withVersion(tes4(0), v)))
		if err != nil {
			t.Fatal(err)
		}
		return h
	}
	le := read("Old.esp", 0.94)
	if le.Version != HeaderVersionLE {
		t.Fatalf("LE header version %q, want %q", le.Version, HeaderVersionLE)
	}
	active := []sdk.PluginFile{
		{Name: "Old.esp", Header: le, Mod: "m1", ModName: "Old Mod"},
		{Name: "New.esp", Header: read("New.esp", 1.7)},
		{Name: "Newer.esp", Header: read("Newer.esp", 1.71)},
		{Name: "Base.esm", Header: read("Base.esm", 0.94)}, // not managed
	}
	specs := a.PluginChecks(GameID, active)
	if len(specs) != 2 {
		t.Fatalf("got %d diagnostics, want the two LE plugins: %+v", len(specs), specs)
	}
	s := specs[0]
	if s.Code != CodePluginWrongGameVersion || s.Severity != diagnostic.SeverityWarning || s.Params["plugin"] != "Old.esp" || s.Params["mod"] != "Old Mod" {
		t.Fatalf("spec %+v", s)
	}
	if s.Related[0].Kind != "mod" || s.Actions[0].ID != "mod.folder.open" || s.Actions[1].ID != "plugins.disable" {
		t.Fatalf("subject and actions %+v %+v", s.Related, s.Actions)
	}
	if b := specs[1]; b.Params["mod"] != "" || len(b.Actions) != 1 || b.Actions[0].Target.ID != "base.esm" {
		t.Fatalf("unmanaged plugin %+v", b)
	}
	for _, sp := range specs {
		if _, err := diagnostic.New(sp); err != nil {
			t.Fatal(err)
		}
	}
	c := a.Catalog()
	for _, lang := range []string{"en", "pt-BR"} {
		for _, k := range []string{"diag.code.plugin_wrong_game_version", "diag.impact.plugin_wrong_game_version", "diag.evidence.plugin_version"} {
			if c.Messages[lang][k] == "" {
				t.Errorf("%s: %s missing", lang, k)
			}
		}
	}
}
