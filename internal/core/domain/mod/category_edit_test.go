package mod

import (
	"errors"
	"slices"
	"testing"
)

func TestCategoryTreeEditing(t *testing.T) {
	tree, _ := NewCategoryTree(nil)
	tree, err := tree.With(Category{ID: "armour", Instance: "i", Name: " Armour "})
	if err != nil {
		t.Fatal(err)
	}
	tree, _ = tree.With(Category{ID: "heavy", Instance: "i", Name: "Heavy", Parent: "armour"})
	tree, _ = tree.With(Category{ID: "plate", Instance: "i", Name: "Plate", Parent: "heavy"})
	if p, _ := tree.Path("plate"); !slices.Equal(p, []string{"Armour", "Heavy", "Plate"}) {
		t.Fatalf("path = %v", p)
	}
	if _, err := tree.With(Category{ID: "armour", Instance: "i", Name: "Armour", Parent: "plate"}); !errors.Is(err, ErrInvalid) {
		t.Fatal("moving a category below its descendant must be refused")
	}
	rest, gone := tree.Without("heavy")
	if !slices.Equal(gone, []CategoryID{"heavy", "plate"}) || !rest.Has("armour") || rest.Has("plate") {
		t.Fatalf("without = %v", gone)
	}
}
