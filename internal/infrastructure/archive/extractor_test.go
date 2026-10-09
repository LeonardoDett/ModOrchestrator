package archive

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"unicode/utf8"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/relpath"
)

type zipEntry struct {
	name string
	body string
	mode fs.FileMode
}

func writeZip(t *testing.T, entries ...zipEntry) string {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, e := range entries {
		h := &zip.FileHeader{Name: e.name, Method: zip.Deflate}
		if e.mode != 0 {
			h.SetMode(e.mode)
		}
		w, err := zw.CreateHeader(h)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = w.Write([]byte(e.body))
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(t.TempDir(), "mod.zip")
	if err := os.WriteFile(p, buf.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

// writeRar4 builds a stored (uncompressed) RAR 4 archive: enough to prove
// the RAR path of the extractor without a binary tool.
func writeRar4(t *testing.T, files map[string]string, order []string) string {
	t.Helper()
	var buf bytes.Buffer
	buf.Write([]byte("Rar!\x1A\x07\x00"))
	block := func(typ byte, flags uint16, body []byte, data []byte) {
		h := []byte{typ}
		h = binary.LittleEndian.AppendUint16(h, flags)
		h = binary.LittleEndian.AppendUint16(h, uint16(2+1+2+2+len(body)))
		h = append(h, body...)
		crc := uint16(crc32.ChecksumIEEE(h))
		buf.Write(binary.LittleEndian.AppendUint16(nil, crc))
		buf.Write(h)
		buf.Write(data)
	}
	block(0x73, 0, make([]byte, 6), nil)
	for _, name := range order {
		data := []byte(files[name])
		var b []byte
		b = binary.LittleEndian.AppendUint32(b, uint32(len(data))) // packed
		b = binary.LittleEndian.AppendUint32(b, uint32(len(data))) // unpacked
		b = append(b, 2)                                           // host: Windows
		b = binary.LittleEndian.AppendUint32(b, crc32.ChecksumIEEE(data))
		b = binary.LittleEndian.AppendUint32(b, 0x5A210000) // dos time
		b = append(b, 20, 0x30)                             // version, method store
		b = binary.LittleEndian.AppendUint16(b, uint16(len(name)))
		b = binary.LittleEndian.AppendUint32(b, 0x20) // archive attribute
		b = append(b, name...)
		block(0x74, 0x8000, b, data)
	}
	block(0x7B, 0x4000, nil, nil)
	p := filepath.Join(t.TempDir(), "mod.rar")
	if err := os.WriteFile(p, buf.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func names(es []ports.ArchiveEntry) []string {
	var out []string
	for _, e := range es {
		if !e.IsDir {
			out = append(out, e.Path)
		}
	}
	slices.Sort(out)
	return out
}

func read(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestZipListAndExtract(t *testing.T) {
	ctx := context.Background()
	p := writeZip(t, zipEntry{name: "Wrap/textures/a.dds", body: "aaaa"}, zipEntry{name: "Wrap/plugin.esp", body: "pp"})
	x := New()
	if f, err := x.Detect(ctx, p); err != nil || f != ports.FormatZip {
		t.Fatalf("detect = %s %v", f, err)
	}
	es, err := x.List(ctx, p)
	if err != nil || !slices.Equal(names(es), []string{"Wrap/plugin.esp", "Wrap/textures/a.dds"}) {
		t.Fatalf("list = %v %v", es, err)
	}
	dest := t.TempDir()
	var last int64
	if err := x.Extract(ctx, p, dest, ports.ExtractOptions{Progress: func(n int64) { last = n }}); err != nil {
		t.Fatal(err)
	}
	if read(t, filepath.Join(dest, "Wrap", "textures", "a.dds")) != "aaaa" || last != 6 {
		t.Fatalf("extracted content wrong, progress %d", last)
	}
	if err := x.Extract(ctx, p, t.TempDir(), ports.ExtractOptions{MaxBytes: 5}); !errors.Is(err, ports.ErrArchiveTooLarge) {
		t.Fatalf("size limit: %v", err)
	}
}

// INV-ID-04: nothing is written outside the destination, even if the
// domain check were bypassed.
func TestZipSlipIsRefused(t *testing.T) {
	ctx := context.Background()
	p := writeZip(t, zipEntry{name: "ok.txt", body: "x"}, zipEntry{name: "../evil.dll", body: "MZ"})
	parent := t.TempDir()
	dest := filepath.Join(parent, "tmp")
	if err := os.Mkdir(dest, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := New().Extract(ctx, p, dest, ports.ExtractOptions{}); !errors.Is(err, ports.ErrArchiveUnsafe) {
		t.Fatalf("err = %v", err)
	}
	if _, err := os.Stat(filepath.Join(parent, "evil.dll")); !os.IsNotExist(err) {
		t.Fatal("evil.dll escaped the destination")
	}
}

func TestZipLinksAreReportedAndRefused(t *testing.T) {
	ctx := context.Background()
	p := writeZip(t, zipEntry{name: "link", body: "C:/Windows", mode: fs.ModeSymlink | 0o777})
	es, err := New().List(ctx, p)
	if err != nil || len(es) != 1 || !es[0].IsLink {
		t.Fatalf("list = %+v %v", es, err)
	}
	if err := New().Extract(ctx, p, t.TempDir(), ports.ExtractOptions{}); !errors.Is(err, ports.ErrArchiveUnsafe) {
		t.Fatalf("extract = %v", err)
	}
}

func TestExecutableIsNotAnArchive(t *testing.T) {
	p := filepath.Join(t.TempDir(), "setup.zip")
	_ = os.WriteFile(p, []byte("MZ\x90\x00 not an archive"), 0o644)
	if _, err := New().Detect(context.Background(), p); !errors.Is(err, ports.ErrArchiveUnsupported) {
		t.Fatalf("detect = %v", err)
	}
}

func TestCorruptZip(t *testing.T) {
	p := filepath.Join(t.TempDir(), "bad.zip")
	_ = os.WriteFile(p, []byte("PK\x03\x04garbage"), 0o644)
	if _, err := New().List(context.Background(), p); !errors.Is(err, ports.ErrArchiveCorrupt) {
		t.Fatalf("list = %v", err)
	}
}

func TestSevenZip(t *testing.T) {
	ctx := context.Background()
	es, err := New().List(ctx, "testdata/lzma2.7z")
	if err != nil || len(names(es)) == 0 {
		t.Fatalf("list = %v %v", es, err)
	}
	dest := t.TempDir()
	if err := New().Extract(ctx, "testdata/lzma2.7z", dest, ports.ExtractOptions{}); err != nil {
		t.Fatal(err)
	}
	for _, n := range names(es) {
		if _, err := os.Stat(filepath.Join(dest, filepath.FromSlash(n))); err != nil {
			t.Fatalf("%s not extracted: %v", n, err)
		}
	}
	// A 7z with encrypted headers cannot be told apart from a damaged one
	// without the password: either code refuses it (D062).
	_, err = New().List(ctx, "testdata/aes7z.7z")
	if !errors.Is(err, ports.ErrArchiveEncrypted) && !errors.Is(err, ports.ErrArchiveCorrupt) {
		t.Fatalf("encrypted 7z: %v", err)
	}
}

func TestRar(t *testing.T) {
	ctx := context.Background()
	p := writeRar4(t, map[string]string{`Mod\textures\a.dds`: "rar!", "Mod\\b.esp": "bb"}, []string{`Mod\textures\a.dds`, "Mod\\b.esp"})
	if f, err := New().Detect(ctx, p); err != nil || f != ports.FormatRar {
		t.Fatalf("detect = %s %v", f, err)
	}
	es, err := New().List(ctx, p)
	if err != nil || !slices.Equal(names(es), []string{"Mod/b.esp", "Mod/textures/a.dds"}) {
		t.Fatalf("list = %v %v", names(es), err)
	}
	dest := t.TempDir()
	if err := New().Extract(ctx, p, dest, ports.ExtractOptions{}); err != nil {
		t.Fatal(err)
	}
	if read(t, filepath.Join(dest, "Mod", "textures", "a.dds")) != "rar!" {
		t.Fatal("rar content")
	}
	evil := writeRar4(t, map[string]string{`..\evil.dll`: "MZ"}, []string{`..\evil.dll`})
	if err := New().Extract(ctx, evil, t.TempDir(), ports.ExtractOptions{}); !errors.Is(err, ports.ErrArchiveUnsafe) {
		t.Fatalf("rar slip = %v", err)
	}
}

// ZIP method 14 (LZMA), as 7-Zip writes it, with and without the end
// marker (D097). Fixtures from testdata/gen.
func TestZipLZMA(t *testing.T) {
	ctx := context.Background()
	p := "testdata/lzma.zip"
	es, err := New().List(ctx, p)
	if err != nil || !slices.Equal(names(es), []string{"Wrap/plugin.esp", "Wrap/readme.txt", "Wrap/textures/a.dds"}) {
		t.Fatalf("list = %v %v", names(es), err)
	}
	dest := t.TempDir()
	if err := New().Extract(ctx, p, dest, ports.ExtractOptions{}); err != nil {
		t.Fatal(err)
	}
	for name, size := range map[string]int{"Wrap/textures/a.dds": 20000, "Wrap/plugin.esp": 3000} {
		if got := len(read(t, filepath.Join(dest, filepath.FromSlash(name)))); got != size {
			t.Fatalf("%s: %d bytes, want %d", name, got, size)
		}
	}
	if read(t, filepath.Join(dest, "Wrap", "readme.txt")) != "stored entry" {
		t.Fatal("stored entry next to LZMA ones")
	}
	if err := New().Extract(ctx, p, t.TempDir(), ports.ExtractOptions{MaxBytes: 1000}); !errors.Is(err, ports.ErrArchiveTooLarge) {
		t.Fatalf("size limit: %v", err)
	}

	// a damaged stream fails the decoder or the CRC check: corrupt either way
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	b[30+len("Wrap/textures/a.dds")+200] ^= 0x55
	bad := filepath.Join(t.TempDir(), "bad.zip")
	_ = os.WriteFile(bad, b, 0o644)
	if err := New().Extract(ctx, bad, t.TempDir(), ports.ExtractOptions{}); !errors.Is(err, ports.ErrArchiveCorrupt) {
		t.Fatalf("damaged LZMA = %v", err)
	}
}

// INV-ID-04 holds for LZMA entries too: the path is refused before the
// entry is decoded.
func TestZipLZMASlipIsRefused(t *testing.T) {
	parent := t.TempDir()
	dest := filepath.Join(parent, "tmp")
	if err := os.Mkdir(dest, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := New().Extract(context.Background(), "testdata/lzma-slip.zip", dest, ports.ExtractOptions{}); !errors.Is(err, ports.ErrArchiveUnsafe) {
		t.Fatalf("err = %v", err)
	}
	if _, err := os.Stat(filepath.Join(parent, "evil.esp")); !os.IsNotExist(err) {
		t.Fatal("evil.esp escaped the destination")
	}
}

// A RAR 5 entry larger than the decoder window, where one match and one
// filter block cross the end of the window and a second filter is read
// while the first is gathered. rardecode v2.4.1 drops the end of the match
// ("bad file checksum") and misplaces the second filter ("invalid filter");
// the patched copy in third_party/ must extract it intact (D098). The
// archive CRC is checked by rardecode.
func TestRar5WindowWrap(t *testing.T) {
	ctx := context.Background()
	p := "testdata/rar5-wrap.rar"
	if f, err := New().Detect(ctx, p); err != nil || f != ports.FormatRar {
		t.Fatalf("detect = %s %v", f, err)
	}
	dest := t.TempDir()
	if err := New().Extract(ctx, p, dest, ports.ExtractOptions{}); err != nil {
		t.Fatal(err)
	}
	if got := len(read(t, filepath.Join(dest, "Wrap", "textures", "wrap.dds"))); got != 300000 {
		t.Fatalf("extracted %d bytes, want 300000", got)
	}
}

func TestFolderSource(t *testing.T) {
	ctx := context.Background()
	src := t.TempDir()
	_ = os.MkdirAll(filepath.Join(src, "textures"), 0o755)
	_ = os.WriteFile(filepath.Join(src, "textures", "a.dds"), []byte("dds"), 0o644)
	_ = os.WriteFile(filepath.Join(src, "p.esp"), []byte("e"), 0o644)
	if f, _ := New().Detect(ctx, src); f != ports.FormatFolder {
		t.Fatalf("detect = %s", f)
	}
	es, err := New().List(ctx, src)
	if err != nil || !slices.Equal(names(es), []string{"p.esp", "textures/a.dds"}) {
		t.Fatalf("list = %v %v", names(es), err)
	}
	dest := t.TempDir()
	if err := New().Extract(ctx, src, dest, ports.ExtractOptions{}); err != nil {
		t.Fatal(err)
	}
	if read(t, filepath.Join(dest, "textures", "a.dds")) != "dds" {
		t.Fatal("folder copy")
	}
}

// D099: names written without the UTF-8 flag are code page 437; two
// different names never collapse into one file.
func TestZipNonUTF8NamesAreCP437(t *testing.T) {
	ctx := context.Background()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, n := range []string{"\x8e.esp", "\x99.esp"} { // "Ä" and "Ö" in CP437
		w, err := zw.CreateHeader(&zip.FileHeader{Name: n, NonUTF8: true})
		if err != nil {
			t.Fatal(err)
		}
		_, _ = w.Write([]byte(n))
	}
	_ = zw.Close()
	p := filepath.Join(t.TempDir(), "cp437.zip")
	if err := os.WriteFile(p, buf.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
	es, err := New().List(ctx, p)
	if err != nil || !slices.Equal(names(es), []string{"Ä.esp", "Ö.esp"}) {
		t.Fatalf("list = %v %v", names(es), err)
	}
	dest := t.TempDir()
	if err := New().Extract(ctx, p, dest, ports.ExtractOptions{}); err != nil {
		t.Fatal(err)
	}
	if read(t, filepath.Join(dest, "Ä.esp")) != "\x8e.esp" || read(t, filepath.Join(dest, "Ö.esp")) != "\x99.esp" {
		t.Fatal("each name is its own file")
	}
}

// F14 (INV-ID-04): whatever the entry names, an extraction writes only
// below its destination, and only names the domain accepts.
func FuzzExtractStaysInside(f *testing.F) {
	for _, s := range []string{"a.txt", "../x", `..\x`, "/abs", "C:/x", "a/../../x", "a:b", "CON", "a/./b", "\x8e.esp", "dir/", `x\..\..\y`} {
		f.Add(s, "b.txt")
	}
	ctx := context.Background()
	f.Fuzz(func(t *testing.T, a, b string) {
		var buf bytes.Buffer
		zw := zip.NewWriter(&buf)
		for _, n := range []string{a, b} {
			w, err := zw.CreateHeader(&zip.FileHeader{Name: n, NonUTF8: !utf8.ValidString(n)})
			if err != nil {
				return
			}
			_, _ = w.Write([]byte("x"))
		}
		if zw.Close() != nil {
			return
		}
		parent := t.TempDir()
		p := filepath.Join(parent, "f.zip")
		if err := os.WriteFile(p, buf.Bytes(), 0o644); err != nil {
			t.Fatal(err)
		}
		dest := filepath.Join(parent, "out")
		if err := os.Mkdir(dest, 0o755); err != nil {
			t.Fatal(err)
		}
		_ = New().Extract(ctx, p, dest, ports.ExtractOptions{})
		_ = filepath.WalkDir(parent, func(cur string, d fs.DirEntry, err error) error {
			if err != nil || cur == parent || cur == p || cur == dest {
				return nil
			}
			rel, _ := filepath.Rel(dest, cur)
			if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
				t.Fatalf("%q/%q wrote %s outside the destination", a, b, cur)
			}
			if _, err := relpath.Parse(filepath.ToSlash(rel)); err != nil {
				t.Fatalf("%q/%q wrote a name the domain refuses: %q", a, b, rel)
			}
			return nil
		})
	})
}
