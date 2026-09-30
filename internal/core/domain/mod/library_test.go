package mod

import (
	"errors"
	"slices"
	"testing"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/relpath"
)

func TestNewModDefaultsAndDisplayName(t *testing.T) {
	m := newMod(t)
	if m.Type != game.DefaultModType {
		t.Fatalf("new mod type = %q", m.Type)
	}
	if m.DisplayName() != "Mod" {
		t.Fatal("detected name is shown when no custom name")
	}
	tags := []string{"a"}
	_ = m.SetAttributes(Attributes{Name: "Custom", Tags: tags}, t0)
	tags[0] = "changed"
	if m.DisplayName() != "Custom" || m.Attributes.Tags[0] != "a" {
		t.Fatalf("custom name must win and tags must be copied: %+v", m.Attributes)
	}
	if err := m.SetType("", t0); !errors.Is(err, ErrInvalid) {
		t.Fatal("empty type must be rejected")
	}
	_ = m.Remove(t0)
	if err := m.SetAttributes(Attributes{}, t0); !errors.Is(err, ErrInvalidTransition) {
		t.Fatal("removed mod cannot be edited")
	}
}

func TestArchive(t *testing.T) {
	a, err := NewArchive("a1", "i1", "Mod-123-1-0.7z", Archive7z, 10, "h", relpath.MustParse("Mod-123-1-0.7z"), t0)
	if err != nil || !a.Retained() {
		t.Fatalf("retained archive expected: %v", err)
	}
	if a, _ := NewArchive("a2", "i1", "x.zip", ArchiveZip, 1, "h", relpath.Path{}, t0); a.Retained() {
		t.Fatal("archive without stored path is not retained")
	}
	if _, err := NewArchive("a3", "i1", "x.exe", "exe", 1, "h", relpath.Path{}, t0); !errors.Is(err, ErrInvalid) {
		t.Fatal("unknown kind must be rejected")
	}
	if _, err := NewArchive("a4", "i1", "x.zip", ArchiveZip, 1, "", relpath.Path{}, t0); !errors.Is(err, ErrInvalid) {
		t.Fatal("hash is required for duplicate detection")
	}
}

func TestCategoryTree(t *testing.T) {
	tree, err := NewCategoryTree([]Category{
		{ID: "armour", Name: "Armour"},
		{ID: "heavy", Name: "Heavy", Parent: "armour"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if p, ok := tree.Path("heavy"); !ok || !slices.Equal(p, []string{"Armour", "Heavy"}) {
		t.Fatalf("path = %v", p)
	}
	bad := map[string][]Category{
		"loop":           {{ID: "a", Name: "A", Parent: "b"}, {ID: "b", Name: "B", Parent: "a"}},
		"unknown parent": {{ID: "a", Name: "A", Parent: "x"}},
		"duplicate":      {{ID: "a", Name: "A"}, {ID: "a", Name: "B"}},
	}
	for name, cats := range bad {
		if _, err := NewCategoryTree(cats); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: expected ErrInvalid, got %v", name, err)
		}
	}
}
