package game

import (
	"fmt"
	"strings"
)

// Absolute Windows paths are compared textually: separators and letter case
// are ignored (D039). Resolving links, junctions or volumes is infrastructure
// work, so these helpers never touch the disk.

// CleanAbs normalizes an absolute path for comparison: forward slashes,
// lower case, no trailing slash.
func CleanAbs(p string) string {
	s := strings.ReplaceAll(p, `\`, "/")
	for strings.Contains(s, "//") && !strings.HasPrefix(s, "//") {
		s = strings.ReplaceAll(s, "//", "/")
	}
	return strings.TrimRight(strings.ToLower(s), "/")
}

// SamePath reports whether a and b name the same folder.
func SamePath(a, b string) bool { return CleanAbs(a) == CleanAbs(b) }

// Within reports whether child is strictly inside parent.
func Within(child, parent string) bool {
	c, p := CleanAbs(child), CleanAbs(parent)
	return p != "" && strings.HasPrefix(c, p+"/")
}

// Overlaps reports whether the folders are equal or one contains the other.
func Overlaps(a, b string) bool { return SamePath(a, b) || Within(a, b) || Within(b, a) }

// Volume returns the drive prefix of an absolute path ("C:"), or "" for
// paths without one (UNC paths return their "//server/share" prefix).
func Volume(p string) string {
	s := strings.ReplaceAll(p, `\`, "/")
	if len(s) >= 2 && s[1] == ':' {
		return strings.ToUpper(s[:2])
	}
	if strings.HasPrefix(s, "//") {
		parts := strings.SplitN(strings.TrimPrefix(s, "//"), "/", 3)
		if len(parts) >= 2 {
			return "//" + strings.ToLower(parts[0]) + "/" + strings.ToLower(parts[1])
		}
	}
	return ""
}

// JoinPath joins path elements with backslashes, the native separator of
// the supported platform (D039). Empty elements are skipped.
func JoinPath(elem ...string) string {
	prefix := ""
	if len(elem) > 0 && strings.HasPrefix(elem[0], `\\`) {
		prefix = `\\`
	}
	var parts []string
	for _, e := range elem {
		e = strings.Trim(strings.ReplaceAll(e, "/", `\`), `\`)
		if e != "" {
			parts = append(parts, e)
		}
	}
	if len(parts) == 0 {
		return ""
	}
	return prefix + strings.Join(parts, `\`)
}

// RelativeTo returns path relative to base with forward slashes. It fails
// when path is not inside base.
func RelativeTo(base, path string) (string, error) {
	if SamePath(base, path) {
		return "", nil
	}
	if !Within(path, base) {
		return "", fmt.Errorf("%w: %q is not inside %q", ErrInvalid, path, base)
	}
	b := strings.TrimRight(strings.ReplaceAll(base, `\`, "/"), "/")
	return strings.TrimLeft(strings.ReplaceAll(path, `\`, "/")[len(b):], "/"), nil
}
