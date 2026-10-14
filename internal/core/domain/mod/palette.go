package mod

import (
	"fmt"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"
)

// Colors are the ids of the category palette (D123): the same 16 ids the
// theme engine of the UI generates with guaranteed contrast. The backend
// stores the id, never a color value; status colors are not offered.
var Colors = []string{
	"blue", "green", "amber", "coral", "pink", "violet", "teal", "gray",
	"cyan", "lime", "orange", "red", "indigo", "graphite", "magenta", "olive",
}

// ValidColor reports whether c is a palette id or empty (no color).
func ValidColor(c string) bool { return c == "" || slices.Contains(Colors, c) }

var iconPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// ValidIcon reports whether name is an icon id (a lowercase slug the UI
// maps to a glyph, at most 32 characters) or empty. Which ids exist is the
// UI's catalog: an id it does not know is drawn without an icon.
func ValidIcon(name string) bool { return name == "" || (len(name) <= 32 && iconPattern.MatchString(name)) }

// MaxTagLength bounds a tag name (runes).
const MaxTagLength = 40

// Tag is a label the user defines for an instance and attaches to any
// number of mods (Attributes.Tags holds the names). Unlike a category, a
// mod may have several. Metadata only: never affects deployment.
type Tag struct {
	Name  string
	Color string
	Order int
}

// NormalizeTag trims a tag name and collapses inner whitespace; it
// refuses an empty or too long name.
func NormalizeTag(name string) (string, error) {
	n := strings.Join(strings.Fields(name), " ")
	if n == "" {
		return "", fmt.Errorf("%w: empty tag", ErrInvalid)
	}
	if utf8.RuneCountInString(n) > MaxTagLength {
		return "", fmt.Errorf("%w: tag longer than %d characters", ErrInvalid, MaxTagLength)
	}
	return n, nil
}

// SameTag compares tag names the way the user sees them (case-insensitive).
func SameTag(a, b string) bool { return strings.EqualFold(a, b) }

// Validate checks a tag definition.
func (t Tag) Validate() error {
	if _, err := NormalizeTag(t.Name); err != nil {
		return err
	}
	if !ValidColor(t.Color) {
		return fmt.Errorf("%w: tag color %q is not in the palette", ErrInvalid, t.Color)
	}
	return nil
}
