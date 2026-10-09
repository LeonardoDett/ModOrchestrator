// Command gen writes the synthetic fixtures of the archive tests (D097, D098):
//
//	go run ./internal/infrastructure/archive/testdata/gen
//
// lzma.zip and lzma-slip.zip hold ZIP method 14 (LZMA) entries, the format
// 7-Zip writes. rar5-wrap.rar is a hand-encoded RAR 5 stream whose content
// crosses the end of the decoder window twice: one match and one filter
// block straddle it, and a second filter is read while the first one is
// being gathered. The content is deterministic, so the files are stable.
package main

import (
	"archive/zip"
	"bytes"
	"encoding/binary"
	"hash/crc32"
	"log"
	"math/rand/v2"
	"os"
	"path/filepath"

	"github.com/ulikunitz/xz/lzma"
)

func main() {
	dir := filepath.Join("internal", "infrastructure", "archive", "testdata")
	write(filepath.Join(dir, "lzma.zip"), lzmaZip([]zipFile{
		{"Wrap/textures/a.dds", content(1, 20000), false},
		{"Wrap/plugin.esp", content(2, 3000), true},
		{"Wrap/readme.txt", []byte("stored entry"), false},
	}))
	write(filepath.Join(dir, "lzma-slip.zip"), lzmaZip([]zipFile{
		{"Wrap/ok.esp", content(3, 100), false},
		{"../evil.esp", content(4, 100), true},
	}))
	write(filepath.Join(dir, "rar5-wrap.rar"), rar5Wrap())
}

func write(path string, b []byte) {
	if err := os.WriteFile(path, b, 0o644); err != nil {
		log.Fatal(err)
	}
}

// content returns n compressible but non-trivial bytes.
func content(seed uint64, n int) []byte {
	r := rand.New(rand.NewPCG(seed, seed))
	words := [][]byte{[]byte("NiNode "), []byte("BSTriShape "), []byte("texture "), []byte("0123 ")}
	var b bytes.Buffer
	for b.Len() < n {
		if r.IntN(4) == 0 {
			b.WriteByte(byte(r.IntN(256)))
		} else {
			b.Write(words[r.IntN(len(words))])
		}
	}
	return b.Bytes()[:n]
}

type zipFile struct {
	name string
	body []byte
	eos  bool // LZMA end marker present (general purpose flag bit 1)
}

// lzmaZip writes every entry with method 14, except names ending in .txt,
// which are stored.
func lzmaZip(files []zipFile) []byte {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, f := range files {
		h := &zip.FileHeader{Name: f.name, Method: zip.Store}
		if filepath.Ext(f.name) != ".txt" {
			h.Method = 14
			if f.eos {
				h.Flags |= 0x2
			}
			h.CRC32 = crc32.ChecksumIEEE(f.body)
			h.UncompressedSize64 = uint64(len(f.body))
			comp := zipLZMA(f.body, f.eos)
			h.CompressedSize64 = uint64(len(comp))
			w, err := zw.CreateRaw(h)
			if err != nil {
				log.Fatal(err)
			}
			_, _ = w.Write(comp)
			continue
		}
		w, err := zw.CreateHeader(h)
		if err != nil {
			log.Fatal(err)
		}
		_, _ = w.Write(f.body)
	}
	if err := zw.Close(); err != nil {
		log.Fatal(err)
	}
	return buf.Bytes()
}

// zipLZMA encodes body as ZIP LZMA data: version 9.20, properties size 5,
// the classic header's 5 property bytes, then the stream.
func zipLZMA(body []byte, eos bool) []byte {
	var classic bytes.Buffer
	cfg := lzma.WriterConfig{DictCap: 1 << 16, EOSMarker: eos, SizeInHeader: !eos, Size: int64(len(body))}
	if eos {
		cfg.Size = -1
	}
	w, err := cfg.NewWriter(&classic)
	if err != nil {
		log.Fatal(err)
	}
	if _, err := w.Write(body); err != nil {
		log.Fatal(err)
	}
	if err := w.Close(); err != nil {
		log.Fatal(err)
	}
	c := classic.Bytes()
	out := []byte{9, 20, 5, 0}
	out = append(out, c[:5]...)
	return append(out, c[lzma.HeaderLen:]...)
}

// --- RAR 5 -------------------------------------------------------------

const (
	rarWindow = 0x40000 // rardecode's minimum window; the 128 KiB dictionary uses it
	rarSize   = 300000
	rarPeriod = 251 // the LZ stream repeats with this period: matches use it as distance
	filterAAt = 260000
	filterA   = rarWindow - 1000 // starts before the window end...
	filterAN  = 4000             // ...and ends after it
	matchAt   = rarWindow - 4    // 8 byte match: 4 bytes before, 4 after the end
	filterBAt = rarWindow + 2000 // read while filter A is gathered
	filterB   = rarWindow + 4000
	filterBN  = 3000
)

type bitWriter struct {
	b []byte
	n uint // bits used in the last byte
}

func (w *bitWriter) bits(v uint64, n uint) {
	for i := int(n) - 1; i >= 0; i-- {
		if w.n == 0 || w.n == 8 {
			w.b = append(w.b, 0)
			w.n = 0
		}
		if v>>uint(i)&1 != 0 {
			w.b[len(w.b)-1] |= 0x80 >> w.n
		}
		w.n++
	}
}

func vint(b []byte, v uint64) []byte {
	for v >= 0x80 {
		b = append(b, byte(v)|0x80)
		v >>= 7
	}
	return append(b, byte(v))
}

// rar5Header frames one header: CRC32, size, then body.
func rar5Header(body []byte) []byte {
	sized := vint(nil, uint64(len(body)))
	sized = append(sized, body...)
	return append(binary.LittleEndian.AppendUint32(nil, crc32.ChecksumIEEE(sized)), sized...)
}

// rar5Wrap builds the archive. The LZ stream (what the decoder writes into
// its window) is a 251 byte random pattern repeated; delta filters A and B
// turn it into the file content, so the CRC only matches when every match
// byte and every filter lands where it was encoded.
func rar5Wrap() []byte {
	r := rand.New(rand.NewPCG(5, 5))
	lz := make([]byte, rarSize)
	for i := range rarPeriod {
		lz[i] = byte(r.IntN(256))
	}
	for i := rarPeriod; i < rarSize; i++ {
		lz[i] = lz[i-rarPeriod]
	}
	want := bytes.Clone(lz)
	delta(want[filterA : filterA+filterAN])
	delta(want[filterB : filterB+filterBN])

	var w bitWriter
	codeTables(&w)
	for i := range rarPeriod {
		w.bits(uint64(lz[i]), 9) // literal
	}
	pos := rarPeriod
	stops := []int{filterAAt, matchAt, matchAt + 8, filterBAt, rarSize}
	for _, stop := range stops {
		for pos < stop {
			n := min(stop-pos, 4097)
			if stop-pos-n == 1 {
				n--
			}
			match(&w, n)
			pos += n
		}
		switch stop {
		case filterAAt:
			filter(&w, filterA-filterAAt, filterAN)
		case filterBAt:
			filter(&w, filterB-filterBAt, filterBN)
		}
	}
	data := w.b
	last := w.n

	// block header: table present, last block, 3 size bytes
	flags := byte(0x80 | 0x40 | 2<<3 | (last - 1))
	size := len(data)
	sb := []byte{byte(size), byte(size >> 8), byte(size >> 16)}
	sum := 0x5a ^ flags ^ sb[0] ^ sb[1] ^ sb[2]
	packed := append([]byte{flags, sum}, sb...)
	packed = append(packed, data...)

	var out []byte
	out = append(out, "Rar!\x1a\x07\x01\x00"...)
	out = append(out, rar5Header([]byte{1, 0, 0})...) // main header, no flags
	var fh []byte
	fh = vint(fh, 2)                   // file header
	fh = vint(fh, 2)                   // has data
	fh = vint(fh, uint64(len(packed))) // data size
	fh = vint(fh, 4)                   // file flags: CRC32 present
	fh = vint(fh, rarSize)
	fh = vint(fh, 0x20) // attributes
	fh = binary.LittleEndian.AppendUint32(fh, crc32.ChecksumIEEE(want))
	fh = vint(fh, 3<<7) // method 3, RAR 5 algorithm, 128 KiB dictionary, not solid
	fh = vint(fh, 0)    // Windows
	name := "Wrap/textures/wrap.dds"
	fh = vint(fh, uint64(len(name)))
	fh = append(fh, name...)
	out = append(out, rar5Header(fh)...)
	out = append(out, packed...)
	return append(out, rar5Header([]byte{5, 0, 0})...) // end of archive
}

// delta runs the RAR delta filter (one channel) in place, as the decoder
// does: out[i] = out[i-1] - stored[i].
func delta(b []byte) {
	var c byte
	for i := range b {
		c -= b[i]
		b[i] = c
	}
}

// codeTables writes the Huffman tables: the precode gives lengths 4, 6
// and 9 two bits each (codes 00, 01, 10); every main symbol has 9 bits
// (code = symbol), offsets 6, low offsets 4 and repeat lengths 6.
func codeTables(w *bitWriter) {
	for i := range 20 {
		switch i {
		case 4, 6, 9:
			w.bits(2, 4)
		default:
			w.bits(0, 4)
		}
	}
	pre := map[int]uint64{4: 0, 6: 1, 9: 2}
	for range 306 {
		w.bits(pre[9], 2)
	}
	for range 64 {
		w.bits(pre[6], 2)
	}
	for range 16 {
		w.bits(pre[4], 2)
	}
	for range 44 {
		w.bits(pre[6], 2)
	}
}

// match writes a copy of n bytes at distance rarPeriod (251: slot 15,
// 2 high bits 3, low offset 10; no length bonus below 0x100).
func match(w *bitWriter, n int) {
	v := n - 2
	if v < 8 {
		w.bits(uint64(262+v), 9)
	} else {
		bits := 0
		for v >= 8<<bits {
			bits++
		}
		w.bits(uint64(262+4*(bits+1)+(v>>bits)&3), 9)
		w.bits(uint64(v&(1<<bits-1)), uint(bits))
	}
	w.bits(15, 6)
	w.bits(3, 2)
	w.bits(10, 4)
}

// filter writes a delta filter (one channel) starting offset bytes after
// the current position.
func filter(w *bitWriter, offset, length int) {
	w.bits(256, 9)
	for _, v := range []int{offset, length} {
		w.bits(3, 2) // 4 bytes
		for i := range 4 {
			w.bits(uint64(v>>(8*i)&0xff), 8)
		}
	}
	w.bits(0, 3) // delta
	w.bits(0, 5) // one channel
}
