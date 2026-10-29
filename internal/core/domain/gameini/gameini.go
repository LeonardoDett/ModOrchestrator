// Package gameini reads and edits one key of a game settings file in the
// INI format (D142): "[section]" headers and "key=value" lines. It is the
// minimum the game_settings feature reuses (LV8): an edit changes only the
// line of the key and keeps every other byte, the encoding and the line
// endings, so a file the game or another tool also writes is never
// rewritten as a whole.
//
// Section and key names compare without case, as the games that use these
// files do. Values are returned without the spaces around them. Comments
// (";" or "#" at the start of a line) are kept and never matched.
package gameini

import (
	"bytes"
	"strings"
)

// line is one line of the file without its line ending.
type line struct {
	start, end int // text, without the ending
	next       int // start of the next line
}

func lines(data []byte) []line {
	var out []line
	for i := 0; i < len(data); {
		j := bytes.IndexByte(data[i:], '\n')
		next := len(data)
		end := len(data)
		if j >= 0 {
			next = i + j + 1
			end = i + j
		}
		if end > i && data[end-1] == '\r' {
			end--
		}
		out = append(out, line{start: i, end: end, next: next})
		i = next
	}
	return out
}

// newline is the line ending the file uses: CRLF unless it only has LF.
func newline(data []byte) string {
	if bytes.Contains(data, []byte("\n")) && !bytes.Contains(data, []byte("\r\n")) {
		return "\n"
	}
	return "\r\n"
}

func header(text string) (string, bool) {
	t := strings.TrimSpace(text)
	if len(t) < 2 || t[0] != '[' {
		return "", false
	}
	i := strings.IndexByte(t, ']')
	if i < 0 {
		return "", false
	}
	return strings.TrimSpace(t[1:i]), true
}

func pair(text string) (key, value string, ok bool) {
	t := strings.TrimSpace(text)
	if t == "" || t[0] == ';' || t[0] == '#' {
		return "", "", false
	}
	k, v, found := strings.Cut(t, "=")
	if !found {
		return "", "", false
	}
	return strings.TrimSpace(k), strings.TrimSpace(v), true
}

// find locates the section and the last line of the key in it (the games
// read the last one when a key repeats). sectionEnd is where a new key of
// the section is inserted: after its last non-empty line.
func find(data []byte, section, key string) (keyLine int, sectionFound bool, sectionEnd int, ls []line) {
	ls = lines(data)
	keyLine, sectionEnd = -1, -1
	in := false
	for i, l := range ls {
		text := string(data[l.start:l.end])
		if name, ok := header(text); ok {
			if in && !strings.EqualFold(name, section) {
				in = false
			}
			if strings.EqualFold(name, section) {
				in, sectionFound = true, true
				sectionEnd = i
			}
			continue
		}
		if !in {
			continue
		}
		if strings.TrimSpace(text) != "" {
			sectionEnd = i
		}
		if k, _, ok := pair(text); ok && strings.EqualFold(k, key) {
			keyLine = i
		}
	}
	return keyLine, sectionFound, sectionEnd, ls
}

// Lookup returns the value of a key and whether the key is present.
func Lookup(data []byte, section, key string) (string, bool) {
	i, _, _, ls := find(data, section, key)
	if i < 0 {
		return "", false
	}
	_, v, _ := pair(string(data[ls[i].start:ls[i].end]))
	return v, true
}

// Set returns the file with the key set to value. An existing line keeps
// the spelling of its key and is the only line that changes; a missing key
// is added at the end of its section, and a missing section at the end of
// the file.
func Set(data []byte, section, key, value string) []byte {
	i, found, end, ls := find(data, section, key)
	nl := newline(data)
	var b bytes.Buffer
	switch {
	case i >= 0:
		l := ls[i]
		text := string(data[l.start:l.end])
		name := strings.TrimSpace(text[:strings.IndexByte(text, '=')])
		b.Write(data[:l.start])
		b.WriteString(name + "=" + value)
		b.Write(data[l.end:])
	case found:
		l := ls[end]
		b.Write(data[:l.next])
		if l.next == l.end { // last line without an ending
			b.WriteString(nl)
		}
		b.WriteString(key + "=" + value + nl)
		b.Write(data[l.next:])
	default:
		b.Write(data)
		if len(data) > 0 && !bytes.HasSuffix(data, []byte("\n")) {
			b.WriteString(nl)
		}
		b.WriteString("[" + section + "]" + nl + key + "=" + value + nl)
	}
	return b.Bytes()
}

// Remove returns the file without the key (every line of it in the
// section). Nothing else changes; an emptied section stays.
func Remove(data []byte, section, key string) []byte {
	ls := lines(data)
	var b bytes.Buffer
	in := false
	last := 0
	for _, l := range ls {
		text := string(data[l.start:l.end])
		if name, ok := header(text); ok {
			in = strings.EqualFold(name, section)
			continue
		}
		if k, _, ok := pair(text); in && ok && strings.EqualFold(k, key) {
			b.Write(data[last:l.start])
			last = l.next
		}
	}
	b.Write(data[last:])
	return b.Bytes()
}

// Pair is one "key=value" line of a section.
type Pair struct {
	Section, Key, Value string
}

// Pairs lists the keys of the file in the order they appear, with the
// section each belongs to. Lines before the first section and comments are
// skipped. A key that repeats appears each time; the last one is the one
// the game reads.
func Pairs(data []byte) []Pair {
	var out []Pair
	section := ""
	for _, l := range lines(data) {
		text := string(data[l.start:l.end])
		if name, ok := header(text); ok {
			section = name
			continue
		}
		if section == "" {
			continue
		}
		if k, v, ok := pair(text); ok && k != "" {
			out = append(out, Pair{Section: section, Key: k, Value: v})
		}
	}
	return out
}
