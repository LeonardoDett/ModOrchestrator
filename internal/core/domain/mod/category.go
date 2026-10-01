package mod

import (
	"fmt"
	"slices"
	"strings"

	"modorchestrator/internal/core/domain/game"
)

// CategoryID identifies a category of an instance.
type CategoryID string

// Category is a node of the category tree. Categories are metadata only and
// never affect deployment (core/02 §10).
type Category struct {
	ID       CategoryID
	Instance game.InstanceID
	Name     string
	Parent   CategoryID
	Order    int
}

// CategoryTree is the validated category tree of an instance.
type CategoryTree struct {
	byID map[CategoryID]Category
}

// NewCategoryTree validates that ids are unique, parents exist and there is
// no loop.
func NewCategoryTree(cats []Category) (CategoryTree, error) {
	t := CategoryTree{byID: make(map[CategoryID]Category, len(cats))}
	for _, c := range cats {
		if c.ID == "" || strings.TrimSpace(c.Name) == "" {
			return CategoryTree{}, fmt.Errorf("%w: category needs id and name", ErrInvalid)
		}
		if _, dup := t.byID[c.ID]; dup {
			return CategoryTree{}, fmt.Errorf("%w: category %q listed twice", ErrInvalid, c.ID)
		}
		t.byID[c.ID] = c
	}
	for _, c := range cats {
		seen := map[CategoryID]bool{c.ID: true}
		for p := c.Parent; p != ""; p = t.byID[p].Parent {
			if _, ok := t.byID[p]; !ok {
				return CategoryTree{}, fmt.Errorf("%w: category %q has unknown parent %q", ErrInvalid, c.ID, p)
			}
			if seen[p] {
				return CategoryTree{}, fmt.Errorf("%w: category %q is its own ancestor", ErrInvalid, c.ID)
			}
			seen[p] = true
		}
	}
	return t, nil
}

// Path returns the names from the root to id ("Armour/Heavy").
func (t CategoryTree) Path(id CategoryID) ([]string, bool) {
	c, ok := t.byID[id]
	if !ok {
		return nil, false
	}
	var names []string
	for ; ; c = t.byID[c.Parent] {
		names = append([]string{c.Name}, names...)
		if c.Parent == "" {
			return names, true
		}
	}
}

// Has reports whether the category exists.
func (t CategoryTree) Has(id CategoryID) bool { _, ok := t.byID[id]; return ok }

// Categories returns the categories ordered by parent, then Order, then name,
// so a tree view can be built in one pass.
func (t CategoryTree) Categories() []Category {
	out := make([]Category, 0, len(t.byID))
	for _, c := range t.byID {
		out = append(out, c)
	}
	slices.SortFunc(out, func(a, b Category) int {
		if a.Parent != b.Parent {
			return strings.Compare(string(a.Parent), string(b.Parent))
		}
		if a.Order != b.Order {
			return a.Order - b.Order
		}
		return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})
	return out
}

// Get returns one category.
func (t CategoryTree) Get(id CategoryID) (Category, bool) {
	c, ok := t.byID[id]
	return c, ok
}

// With returns a tree with c added or replaced, validated as a whole (the
// parent must exist and no category may become its own ancestor).
func (t CategoryTree) With(c Category) (CategoryTree, error) {
	c.Name = strings.TrimSpace(c.Name)
	cats := make([]Category, 0, len(t.byID)+1)
	for _, o := range t.byID {
		if o.ID != c.ID {
			cats = append(cats, o)
		}
	}
	return NewCategoryTree(append(cats, c))
}

// Without returns a tree without id and its descendants, and the removed
// ids: mods in them become uncategorized (core/02 §10).
func (t CategoryTree) Without(id CategoryID) (CategoryTree, []CategoryID) {
	removed := map[CategoryID]bool{id: true}
	for changed := true; changed; {
		changed = false
		for _, c := range t.byID {
			if !removed[c.ID] && removed[c.Parent] {
				removed[c.ID], changed = true, true
			}
		}
	}
	var keep []Category
	var gone []CategoryID
	for _, c := range t.byID {
		if removed[c.ID] {
			gone = append(gone, c.ID)
			continue
		}
		keep = append(keep, c)
	}
	slices.Sort(gone)
	out, _ := NewCategoryTree(keep) // a subset of a valid tree closed under descendants is valid
	return out, gone
}
