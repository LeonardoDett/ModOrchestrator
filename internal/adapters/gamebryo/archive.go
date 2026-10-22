// Package gamebryo holds file formats shared by the adapters of Bethesda
// games (Gamebryo and Creation engines). It is adapter code (D112): no
// core package imports it.
package gamebryo

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"strings"
)

// ErrFormat: the reader is not an archive this package reads.
var ErrFormat = errors.New("gamebryo: not a readable archive")

const (
	bsaMagic = "BSA\x00"
	ba2Magic = "BTDX"

	bsaFlagDirNames  = 0x1
	bsaFlagFileNames = 0x2

	// maxEntries bounds the counts read from a header, so a damaged file
	// cannot make the reader allocate gigabytes.
	maxEntries = 1 << 22
)

// Index is what ArchiveIndex reads: the format ("bsa" or "ba2"), its
// version and the paths of the files inside.
type Index struct {
	Format  string
	Version uint32
	Paths   []string
}

// ArchiveIndex lists the paths of the files inside a BSA (versions 103,
// 104 and 105: Oblivion, Skyrim LE, Fallout 3, New Vegas, Skyrim SE) or a
// BA2 (Fallout 4, Starfield; general and texture archives), with "\" or
// "/" as written in the archive. It reads only the index at the start (BSA)
// or the name table (BA2); when r is an io.Seeker it seeks to the table,
// otherwise it reads past the data. An archive without stored names, or any
// other format, is ErrFormat.
func ArchiveIndex(r io.Reader) (Index, error) {
	var magic [4]byte
	if _, err := io.ReadFull(r, magic[:]); err != nil {
		return Index{}, fmt.Errorf("%w: %v", ErrFormat, err)
	}
	switch string(magic[:]) {
	case bsaMagic:
		return bsaIndex(r)
	case ba2Magic:
		return ba2Index(r)
	}
	return Index{}, ErrFormat
}

// bsaHeader is the BSA header after the magic.
type bsaHeader struct {
	Version, Offset, Flags, Folders, Files, FolderNames, FileNames uint32
	FileFlags                                                      uint32
}

func bsaIndex(r io.Reader) (Index, error) {
	var h bsaHeader
	if err := binary.Read(r, binary.LittleEndian, &h); err != nil {
		return Index{}, fmt.Errorf("%w: header: %v", ErrFormat, err)
	}
	var record int64
	switch h.Version {
	case 103, 104:
		record = 16
	case 105:
		record = 24
	default:
		return Index{}, fmt.Errorf("%w: BSA version %d", ErrFormat, h.Version)
	}
	if h.Flags&bsaFlagDirNames == 0 || h.Flags&bsaFlagFileNames == 0 {
		return Index{}, fmt.Errorf("%w: BSA without names", ErrFormat)
	}
	if h.Offset != 36 || h.Folders > maxEntries || h.Files > maxEntries || h.FileNames > maxEntries*64 {
		return Index{}, fmt.Errorf("%w: BSA header out of range", ErrFormat)
	}
	counts := make([]uint32, h.Folders)
	rec := make([]byte, record)
	for i := range counts {
		if _, err := io.ReadFull(r, rec); err != nil {
			return Index{}, fmt.Errorf("%w: folder record: %v", ErrFormat, err)
		}
		counts[i] = binary.LittleEndian.Uint32(rec[8:12])
	}
	folders := make([]string, 0, h.Folders)
	var total uint64
	var one [1]byte
	file := make([]byte, 16)
	for _, n := range counts {
		if _, err := io.ReadFull(r, one[:]); err != nil {
			return Index{}, fmt.Errorf("%w: folder name: %v", ErrFormat, err)
		}
		name := make([]byte, one[0])
		if _, err := io.ReadFull(r, name); err != nil {
			return Index{}, fmt.Errorf("%w: folder name: %v", ErrFormat, err)
		}
		folder := strings.TrimRight(string(name), "\x00")
		for range n {
			if _, err := io.ReadFull(r, file); err != nil {
				return Index{}, fmt.Errorf("%w: file record: %v", ErrFormat, err)
			}
			folders = append(folders, folder)
		}
		total += uint64(n)
	}
	if total != uint64(h.Files) {
		return Index{}, fmt.Errorf("%w: %d file records, header says %d", ErrFormat, total, h.Files)
	}
	names := make([]byte, h.FileNames)
	if _, err := io.ReadFull(r, names); err != nil {
		return Index{}, fmt.Errorf("%w: file names: %v", ErrFormat, err)
	}
	parts := strings.Split(strings.TrimSuffix(string(names), "\x00"), "\x00")
	if len(parts) != len(folders) {
		return Index{}, fmt.Errorf("%w: %d names for %d files", ErrFormat, len(parts), len(folders))
	}
	out := make([]string, len(parts))
	for i, n := range parts {
		if folders[i] == "" || folders[i] == "." {
			out[i] = n
		} else {
			out[i] = folders[i] + `\` + n
		}
	}
	return Index{Format: "bsa", Version: h.Version, Paths: out}, nil
}

func ba2Index(r io.Reader) (Index, error) {
	var h struct {
		Version   uint32
		Type      [4]byte
		Files     uint32
		NameTable uint64
	}
	if err := binary.Read(r, binary.LittleEndian, &h); err != nil {
		return Index{}, fmt.Errorf("%w: header: %v", ErrFormat, err)
	}
	if t := string(h.Type[:]); t != "GNRL" && t != "DX10" {
		return Index{}, fmt.Errorf("%w: BA2 type %q", ErrFormat, t)
	}
	if h.Files > maxEntries || h.NameTable < 24 {
		return Index{}, fmt.Errorf("%w: BA2 header out of range", ErrFormat)
	}
	// 24 bytes read so far (magic, version, type, count, name table offset).
	if s, ok := r.(io.Seeker); ok {
		if _, err := s.Seek(int64(h.NameTable), io.SeekStart); err != nil {
			return Index{}, fmt.Errorf("%w: seek: %v", ErrFormat, err)
		}
	} else if _, err := io.CopyN(io.Discard, r, int64(h.NameTable)-24); err != nil {
		return Index{}, fmt.Errorf("%w: name table: %v", ErrFormat, err)
	}
	out := make([]string, 0, h.Files)
	var size [2]byte
	for range h.Files {
		if _, err := io.ReadFull(r, size[:]); err != nil {
			return Index{}, fmt.Errorf("%w: name table: %v", ErrFormat, err)
		}
		name := make([]byte, binary.LittleEndian.Uint16(size[:]))
		if _, err := io.ReadFull(r, name); err != nil {
			return Index{}, fmt.Errorf("%w: name table: %v", ErrFormat, err)
		}
		out = append(out, string(name))
	}
	return Index{Format: "ba2", Version: h.Version, Paths: out}, nil
}
