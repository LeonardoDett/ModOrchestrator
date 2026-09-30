package mod

import (
	"fmt"
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
