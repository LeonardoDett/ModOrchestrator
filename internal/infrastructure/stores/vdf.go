// Package stores implements ports.StoreScanner for Steam, GOG, Epic and the
// registry hints declared by adapters (core/11 §3). It only reads.
package stores

import (
	"fmt"
	"strings"
)

// vdf is a parsed Valve KeyValues document: values are string or vdf.
type vdf map[string]any

// parseVDF parses the text KeyValues format used by libraryfolders.vdf and
// appmanifest_*.acf: quoted keys and values, nested blocks in braces, "//"
// comments. Keys are matched without case by the helpers below.
func parseVDF(src string) (vdf, error) {
	p := &vdfParser{src: src}
	doc, err := p.block(true)
	if err != nil {
		return nil, err
	}
	return doc, nil
}

type vdfParser struct {
	src string
	pos int
}

func (p *vdfParser) block(top bool) (vdf, error) {
	out := vdf{}
	for {
		tok, kind, err := p.next()
		if err != nil {
			return nil, err
		}
		switch kind {
		case tokEOF:
			if top {
				return out, nil
			}
			return nil, fmt.Errorf("vdf: unexpected end of input")
		case tokClose:
			if top {
				return nil, fmt.Errorf("vdf: unmatched }")
			}
			return out, nil
		case tokOpen:
			return nil, fmt.Errorf("vdf: block without a key at %d", p.pos)
		}
		key := strings.ToLower(tok)
		val, vkind, err := p.next()
		if err != nil {
			return nil, err
		}
		switch vkind {
		case tokString:
			out[key] = val
		case tokOpen:
			child, err := p.block(false)
			if err != nil {
				return nil, err
			}
			out[key] = child
		default:
			return nil, fmt.Errorf("vdf: key %q has no value", key)
		}
	}
}

type tokKind int

const (
	tokString tokKind = iota
	tokOpen
	tokClose
	tokEOF
)

func (p *vdfParser) next() (string, tokKind, error) {
	for p.pos < len(p.src) {
		c := p.src[p.pos]
		switch {
		case c == ' ' || c == '\t' || c == '\r' || c == '\n':
			p.pos++
		case c == '/' && p.pos+1 < len(p.src) && p.src[p.pos+1] == '/':
			for p.pos < len(p.src) && p.src[p.pos] != '\n' {
				p.pos++
			}
		case c == '{':
			p.pos++
			return "", tokOpen, nil
		case c == '}':
			p.pos++
			return "", tokClose, nil
		case c == '"':
			return p.quoted()
		default:
			return "", tokString, fmt.Errorf("vdf: unexpected %q at %d", c, p.pos)
		}
	}
	return "", tokEOF, nil
}

func (p *vdfParser) quoted() (string, tokKind, error) {
	p.pos++ // opening quote
	var b strings.Builder
	for p.pos < len(p.src) {
		c := p.src[p.pos]
		p.pos++
		switch c {
		case '"':
			return b.String(), tokString, nil
		case '\\':
			if p.pos >= len(p.src) {
				return "", tokString, fmt.Errorf("vdf: dangling escape")
			}
			e := p.src[p.pos]
			p.pos++
			switch e {
			case 'n':
				b.WriteByte('\n')
			case 't':
				b.WriteByte('\t')
			default: // \\ and \" and anything else keep the character
				b.WriteByte(e)
			}
		default:
			b.WriteByte(c)
		}
	}
	return "", tokString, fmt.Errorf("vdf: unterminated string")
}

func (d vdf) str(key string) string {
	s, _ := d[strings.ToLower(key)].(string)
	return s
}

func (d vdf) sub(key string) vdf {
	v, _ := d[strings.ToLower(key)].(vdf)
	return v
}
