package gamebryo

import (
	"bytes"
	"errors"
	"io"
	"slices"
	"testing"
)

func TestBSAIndexEveryVersion(t *testing.T) {
	paths := []string{`meshes\armor\iron.nif`, `textures\armor\iron.dds`, `textures\armor\iron_n.dds`, `scripts\a.pex`}
	for _, v := range []uint32{103, 104, 105} {
		idx, err := ArchiveIndex(bytes.NewReader(BuildBSA(v, paths)))
		if err != nil || idx.Format != "bsa" || idx.Version != v {
			t.Fatalf("version %d: %+v, %v", v, idx, err)
		}
		got := idx.Paths
		slices.Sort(got)
		want := slices.Clone(paths)
		slices.Sort(want)
		if !slices.Equal(got, want) {
			t.Fatalf("version %d: got %v, want %v", v, got, want)
		}
	}
}

func TestBA2IndexSeeksOrReadsPastTheData(t *testing.T) {
	paths := []string{`Meshes\a.nif`, `Textures\b.dds`}
	raw := BuildBA2(paths, 1000)
	for _, r := range []io.Reader{bytes.NewReader(raw), io.MultiReader(bytes.NewReader(raw))} {
		idx, err := ArchiveIndex(r)
		if err != nil || idx.Format != "ba2" || !slices.Equal(idx.Paths, paths) {
			t.Fatalf("got %+v, %v", idx, err)
		}
	}
}

func TestArchiveIndexRefusesOtherFormats(t *testing.T) {
	noNames := BuildBSA(105, []string{`a\b.nif`})
	noNames[12] = 0 // archive flags without names
	cases := map[string][]byte{
		"empty":    nil,
		"zip":      []byte("PK\x03\x04rest"),
		"version":  BuildBSA(106, []string{`a\b.nif`}),
		"no names": noNames,
		"short":    BuildBSA(105, []string{`a\b.nif`, `a\c.nif`})[:60],
	}
	for name, raw := range cases {
		if _, err := ArchiveIndex(bytes.NewReader(raw)); !errors.Is(err, ErrFormat) {
			t.Errorf("%s: err = %v, want ErrFormat", name, err)
		}
	}
}
