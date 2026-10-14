package mod

import (
	"errors"
	"strings"
	"testing"
)

// D123: colors are palette ids, icons are slugs; nothing else is stored.
func TestPaletteAndIconValidation(t *testing.T) {
	if len(Colors) != 16 {
		t.Fatalf("palette has %d colors", len(Colors))
	}
	for _, c := range []string{"", "blue", "graphite"} {
		if !ValidColor(c) {
			t.Fatalf("%q should be valid", c)
		}
	}
	for _, c := range []string{"#ff0000", "danger", "Blue"} {
		if ValidColor(c) {
			t.Fatalf("%q should be refused", c)
		}
	}
	for _, i := range []string{"", "shield", "folder-open"} {
		if !ValidIcon(i) {
			t.Fatalf("icon %q should be valid", i)
		}
	}
	for _, i := range []string{"Shield", "a b", "-x", strings.Repeat("a", 33), "<svg>"} {
		if ValidIcon(i) {
			t.Fatalf("icon %q should be refused", i)
		}
	}
}

func TestTagNormalization(t *testing.T) {
	n, err := NormalizeTag("  fiel   ao  lore ")
	if err != nil || n != "fiel ao lore" {
		t.Fatalf("normalize = %q %v", n, err)
	}
	if _, err := NormalizeTag("   "); !errors.Is(err, ErrInvalid) {
		t.Fatalf("empty tag: %v", err)
	}
	if _, err := NormalizeTag(strings.Repeat("x", MaxTagLength+1)); !errors.Is(err, ErrInvalid) {
		t.Fatalf("long tag: %v", err)
	}
	if !SameTag("Essencial", "essencial") {
		t.Fatal("tags compare without case")
	}
	if err := (Tag{Name: "x", Color: "#fff"}).Validate(); !errors.Is(err, ErrInvalid) {
		t.Fatalf("raw color accepted: %v", err)
	}
}

func TestCategoryTreeRefusesInvalidLook(t *testing.T) {
	if _, err := NewCategoryTree([]Category{{ID: "a", Name: "A", Color: "violet", Icon: "brush"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := NewCategoryTree([]Category{{ID: "a", Name: "A", Color: "#123456"}}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("raw color accepted: %v", err)
	}
	if _, err := NewCategoryTree([]Category{{ID: "a", Name: "A", Icon: "Not An Icon"}}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("bad icon accepted: %v", err)
	}
}
