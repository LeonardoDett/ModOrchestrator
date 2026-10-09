package relpath

import (
	"errors"
	"strings"
	"testing"
)

// fuzzSeeds are the dangerous shapes F14 asks for: traversal, roots, drives,
// streams, device names, trailing dots and spaces, long and odd names.
var fuzzSeeds = []string{
	"Data/Textures/a.dds", `meshes\b.nif`, "./a//b/", "../x", "a/../../b", "/etc/passwd", `\\server\share\x`,
	`\\?\C:\x`, "C:x", "C:/Windows", "file.txt:stream", "a::$DATA", "a\x00b", "dir./x", "name ", " a", "a /b",
	"CON", "con.txt", "Com1.dds", "COM¹", "lpt².esp", "nul .txt", "CONIN$", "a/b?.txt", "x<y", "tab\tname",
	"…", "a/./b", strings.Repeat("a/", 200) + "z", strings.Repeat("x", 300), "Ä/ä", "İ/i", "ß", "\u202e.esp",
}

// INV-ID-02: every path Parse accepts is normalized, and normalizing it
// again changes nothing.
func FuzzParse(f *testing.F) {
	for _, s := range fuzzSeeds {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, raw string) {
		p, err := Parse(raw)
		if err != nil {
			if !errors.Is(err, ErrInvalid) {
				t.Fatalf("Parse(%q) = %v, not ErrInvalid", raw, err)
			}
			return
		}
		s := p.String()
		if s == "" || strings.ContainsAny(s, "\\:\x00") || strings.HasPrefix(s, "/") || strings.HasSuffix(s, "/") {
			t.Fatalf("Parse(%q) = %q is not normalized", raw, s)
		}
		for _, seg := range strings.Split(s, "/") {
			if seg == "" || seg == "." || seg == ".." || strings.TrimRight(seg, ". ") != seg {
				t.Fatalf("Parse(%q) = %q has segment %q", raw, s, seg)
			}
			if err := checkSegment(seg); err != nil {
				t.Fatalf("Parse(%q) accepted %q: %v", raw, seg, err)
			}
		}
		again, err := Parse(s)
		if err != nil || again != p {
			t.Fatalf("Parse is not idempotent: %q -> %q -> %q %v", raw, s, again, err)
		}
		if p.Key() != strings.ToLower(s) {
			t.Fatalf("identity of %q", s)
		}
	})
}
