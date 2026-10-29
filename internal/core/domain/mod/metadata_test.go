package mod

import (
	"reflect"
	"strings"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/relpath"
)

func TestMetadataRoundTrip(t *testing.T) {
	now := time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)
	m, err := New("m1", "i1", "SkyUI", Source{Kind: SourceManualFile, Ref: "SkyUI-1.zip"}, now)
	if err != nil {
		t.Fatal(err)
	}
	m.Attributes = Attributes{Name: "My UI", Version: "5.2", Author: "a", Description: "d", Notes: "n",
		Highlight: Highlight{Color: "accent", Icon: "star"}, Tags: []string{"ui"}}
	m.Type = "default"
	m.VariantOf, m.VariantLabel = "m0", "lite"
	m.Package = Package{Name: "skyui", Requires: []PackageRef{{Name: "skse", Version: "2"}}}
	m.Content = []ContentFlag{"plugins"}
	m.InstalledAt = now.Add(time.Minute)
	a, err := NewArchive("a1", "i1", "SkyUI-1.zip", ArchiveZip, 10, "h", relpath.MustParse("a1/SkyUI-1.zip"), now)
	if err != nil {
		t.Fatal(err)
	}
	cat := &Category{ID: "c1", Name: "Heavy", Parent: "c0"}
	data, err := NewMetadata(m, cat, []string{"Armour", "Heavy"}, a).Encode()
	if err != nil {
		t.Fatal(err)
	}
	md, err := ParseMetadata(data, "M1")
	if err != nil {
		t.Fatal(err)
	}
	if md.Mod != "m1" || md.Instance != "i1" || md.Name != "SkyUI" || md.Type != "default" {
		t.Fatalf("identity: %+v", md)
	}
	if !reflect.DeepEqual(md.Attrs(), m.Attributes) {
		t.Fatalf("attributes: %+v", md.Attrs())
	}
	if md.Category == nil || md.Category.ID != "c1" || !reflect.DeepEqual(md.Category.Path, []string{"Armour", "Heavy"}) {
		t.Fatalf("category: %+v", md.Category)
	}
	if md.Variant == nil || md.Variant.Of != "m0" || md.Variant.Label != "lite" {
		t.Fatalf("variant: %+v", md.Variant)
	}
	if !reflect.DeepEqual(md.Package, m.Package) || !reflect.DeepEqual(md.Content, m.Content) {
		t.Fatalf("package/content: %+v %+v", md.Package, md.Content)
	}
	if !md.Created.Equal(now) || !md.Installed.Equal(m.InstalledAt) {
		t.Fatalf("dates: %+v", md)
	}
	back, ok := md.ArchiveFor("i2")
	if !ok || back.Instance != "i2" || back.ID != "a1" || back.Hash != "h" || back.Stored.String() != "a1/SkyUI-1.zip" {
		t.Fatalf("archive: %+v %v", back, ok)
	}
	for _, k := range []string{"order", "enabled", "rules"} {
		if strings.Contains(strings.ToLower(string(data)), `"`+k) {
			t.Fatalf("profile state %q must not be written:\n%s", k, data)
		}
	}
}

func TestParseMetadataRejects(t *testing.T) {
	good, _ := NewMetadata(&Mod{ID: "m1", Instance: "i1", Name: "x", Source: Source{Kind: SourceManualFile}}, nil, nil, nil).Encode()
	for name, c := range map[string]struct {
		data   string
		folder string
	}{
		"corrupt":      {`{"formatVersion": 1, "modId": "m1"`, "m1"},
		"not json":     {"garbage", "m1"},
		"newer format": {`{"formatVersion": 99, "modId": "m1"}`, "m1"},
		"no format":    {`{"modId": "m1"}`, "m1"},
		"other folder": {string(good), "m2"},
	} {
		if _, err := ParseMetadata([]byte(c.data), c.folder); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
	if !game.IsModMetadataFile(".ModOrchestrator-Mod.json") {
		t.Fatal("name check must ignore case")
	}
}
