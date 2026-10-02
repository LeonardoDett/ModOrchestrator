package fomod

import (
	"bytes"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// DecodeText turns the bytes into a Go string: UTF-16 by BOM (or by the
// zero bytes of a BOM-less "<?xml"), UTF-8 when valid, otherwise
// Windows-1252. The XML declaration is removed: its encoding no longer
// applies to the decoded text.
func DecodeText(b []byte) (string, error) {
	bomless := len(b) >= 4 && ((b[0] == '<' && b[1] == 0 && b[2] != 0) || (b[0] == 0 && b[1] == '<' && b[3] == '?'))
	switch {
	case bytes.HasPrefix(b, []byte{0xFF, 0xFE}), bytes.HasPrefix(b, []byte{0xFE, 0xFF}), bomless:
		le := b[0] == 0xFF || b[0] == '<'
		if !bomless {
			b = b[2:]
		}
		if len(b)%2 != 0 {
			b = b[:len(b)-1]
		}
		u := make([]uint16, len(b)/2)
		for i := range u {
			if le {
				u[i] = uint16(b[2*i]) | uint16(b[2*i+1])<<8
			} else {
				u[i] = uint16(b[2*i])<<8 | uint16(b[2*i+1])
			}
		}
		return stripDecl(string(utf16.Decode(u))), nil
	case bytes.HasPrefix(b, []byte{0xEF, 0xBB, 0xBF}):
		b = b[3:]
	}
	if utf8.Valid(b) {
		return stripDecl(string(b)), nil
	}
	var sb strings.Builder
	for _, c := range b {
		if c >= 0x80 && c <= 0x9F {
			sb.WriteRune(cp1252[c-0x80])
			continue
		}
		sb.WriteRune(rune(c))
	}
	return stripDecl(sb.String()), nil
}

// stripDecl removes the XML declaration: the text is already decoded, so a
// declared encoding would only mislead the decoder.
func stripDecl(s string) string {
	t := strings.TrimLeft(s, " \t\r\n")
	if strings.HasPrefix(t, "<?xml") {
		if i := strings.Index(t, "?>"); i >= 0 {
			return t[i+2:]
		}
	}
	return s
}

// cp1252 maps 0x80–0x9F of Windows-1252.
var cp1252 = [32]rune{
	'€', '\u0081', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '\u008d', 'Ž', '\u008f',
	'\u0090', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', '\u009d', 'ž', 'Ÿ',
}
