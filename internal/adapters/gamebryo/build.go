package gamebryo

import (
	"bytes"
	"encoding/binary"
	"slices"
	"strings"
)

// BuildBSA writes a BSA of the given version (103, 104 or 105) with the
// files at paths ("meshes\a.nif") and no contents: the index ArchiveIndex
// reads. Hashes are zero; the game would not load it. Used by tests of the
// adapters and of the core.
func BuildBSA(version uint32, paths []string) []byte {
	byFolder := map[string][]string{}
	var folders []string
	for _, p := range paths {
		p = strings.ReplaceAll(p, "/", `\`)
		dir, name := "", p
		if i := strings.LastIndex(p, `\`); i >= 0 {
			dir, name = p[:i], p[i+1:]
		}
		if _, ok := byFolder[dir]; !ok {
			folders = append(folders, dir)
		}
		byFolder[dir] = append(byFolder[dir], name)
	}
	slices.Sort(folders)
	var folderNames, fileNames uint32
	for _, f := range folders {
		folderNames += uint32(len(f)) + 1
		for _, n := range byFolder[f] {
			fileNames += uint32(len(n)) + 1
		}
	}
	var b bytes.Buffer
	b.WriteString(bsaMagic)
	le := func(v any) { _ = binary.Write(&b, binary.LittleEndian, v) }
	le(bsaHeader{Version: version, Offset: 36, Flags: bsaFlagDirNames | bsaFlagFileNames, Folders: uint32(len(folders)), Files: uint32(len(paths)), FolderNames: folderNames, FileNames: fileNames})
	for _, f := range folders {
		le(uint64(0))
		le(uint32(len(byFolder[f])))
		if version == 105 {
			le(uint32(0))
			le(uint64(0))
		} else {
			le(uint32(0))
		}
	}
	for _, f := range folders {
		b.WriteByte(byte(len(f) + 1))
		b.WriteString(f)
		b.WriteByte(0)
		for range byFolder[f] {
			b.Write(make([]byte, 16))
		}
	}
	for _, f := range folders {
		for _, n := range byFolder[f] {
			b.WriteString(n)
			b.WriteByte(0)
		}
	}
	return b.Bytes()
}

// BuildBA2 writes a general BA2 (version 1) whose name table lists paths,
// with data bytes of padding before the table. Used by tests.
func BuildBA2(paths []string, data int) []byte {
	var b bytes.Buffer
	b.WriteString(ba2Magic)
	le := func(v any) { _ = binary.Write(&b, binary.LittleEndian, v) }
	le(uint32(1))
	b.WriteString("GNRL")
	le(uint32(len(paths)))
	le(uint64(24 + data))
	b.Write(make([]byte, data))
	for _, p := range paths {
		le(uint16(len(p)))
		b.WriteString(p)
	}
	return b.Bytes()
}
