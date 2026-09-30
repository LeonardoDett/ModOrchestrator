package game

import (
	"slices"
	"strings"
)

// DetectRule is one way a footprint identifies a mod type (core/11 §2). A
// rule matches when every entry of All is present. An entry ending in "/"
// is a folder (any file below it); any other entry is a file. Entries are
// relative, compared without case, inside the resolved root of the default
// target layout (the paths the installer would deploy).
type DetectRule struct {
	All []string
}

// Matches reports whether the rule holds for the given relative paths.
func (r DetectRule) Matches(paths []string) bool {
	if len(r.All) == 0 {
		return false
	}
	for _, want := range r.All {
		want = strings.ToLower(want)
		folder := strings.HasSuffix(want, "/")
		found := slices.ContainsFunc(paths, func(p string) bool {
			p = strings.ToLower(strings.ReplaceAll(p, `\`, "/"))
			if folder {
				return strings.HasPrefix(p, want)
			}
			return p == want
		})
		if !found {
			return false
		}
	}
	return true
}

// Matches reports whether any detection rule of the type holds.
func (t ModType) Matches(paths []string) bool {
	return slices.ContainsFunc(t.Detect, func(r DetectRule) bool { return r.Matches(paths) })
}

// DetectModType returns the mod type the footprint indicates: the matching
// type with the highest priority (ties keep declaration order), or the
// default type when nothing matches. The user can always override it.
func (d Definition) DetectModType(paths []string) ModTypeID {
	best, bestPriority, found := DefaultModType, 0, false
	for _, t := range d.ModTypes {
		if !t.Matches(paths) {
			continue
		}
		if !found || t.Priority > bestPriority {
			best, bestPriority, found = t.ID, t.Priority, true
		}
	}
	return best
}
