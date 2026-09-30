package relpath

import (
	"errors"
	"testing"
)

func TestParseNormalizes(t *testing.T) {
	cases := map[string]string{
		`Data\Textures\a.dds`: "Data/Textures/a.dds",
		"./meshes//b.nif":     "meshes/b.nif",
		"a/./b/":              "a/b",
	}
	for raw, want := range cases {
		p, err := Parse(raw)
		if err != nil {
			t.Fatalf("Parse(%q): %v", raw, err)
		}
		if p.String() != want {
			t.Fatalf("Parse(%q) = %q, want %q", raw, p, want)
		}
	}
}

func TestParseRejectsUnsafePaths(t *testing.T) {
	for _, raw := range []string{
		"", "  ", ".", "/etc/passwd", `\\server\share\x`, "C:/Windows", "a/../../b",
		"..", "file.txt:stream", "a\x00b", "dir./x", "name ", "CON", "data/nul.txt", "Com1.dds", "a/b?.txt", "x<y", "tab	name",
	} {
		if _, err := Parse(raw); !errors.Is(err, ErrInvalid) {
			t.Errorf("Parse(%q) = %v, want ErrInvalid", raw, err)
		}
	}
}

func TestIdentityIsCaseInsensitive(t *testing.T) {
	a, b := MustParse("Data/Meshes/X.nif"), MustParse(`data\meshes\x.NIF`)
	if !a.Equal(b) || a.Key() != b.Key() {
		t.Fatalf("%q and %q must address the same file", a, b)
	}
	if a.String() != "Data/Meshes/X.nif" {
		t.Fatalf("original casing must be kept, got %q", a)
	}
}

func TestReservedNamesOnlyMatchWholeBase(t *testing.T) {
	for _, raw := range []string{"console.txt", "nullable/x", "com10.dds", "lpt.esp", "auxiliary"} {
		if _, err := Parse(raw); err != nil {
			t.Errorf("Parse(%q) = %v, want ok", raw, err)
		}
	}
}
