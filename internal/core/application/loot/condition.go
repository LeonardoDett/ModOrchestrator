package loot

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

// ErrUnsupported is returned by a condition that uses a function the
// provider does not evaluate (or a file it cannot read). The caller treats
// the condition as false: the item is not applied, which never invents a
// problem.
var ErrUnsupported = errors.New("loot: unsupported condition")

// Env answers the questions of LOOT conditions about one instance. Paths are
// relative to the game's data folder, with "/" separators; "../" reaches the
// game root.
type Env interface {
	// FileExists: a plugin of the inventory, or a file on disk.
	FileExists(path string) bool
	// CountFiles counts the files of dir whose name matches re.
	CountFiles(dir string, re *regexp.Regexp) int
	Readable(path string) bool
	Active(name string) bool
	CountActive(re *regexp.Regexp) int
	IsMaster(path string) (bool, error)
	Checksum(path string) (uint32, error)
	// Version is the version LOOT reads for a file (for a plugin, from its
	// description).
	Version(path string) (string, error)
	Description(path string) (string, error)
}

// Condition is a parsed LOOT condition.
type Condition struct{ root node }

// ParseCondition parses a condition string (LOOT metadata syntax: functions
// combined with and, or, not and parentheses). An empty string is always
// true.
func ParseCondition(s string) (*Condition, error) {
	if strings.TrimSpace(s) == "" {
		return &Condition{}, nil
	}
	p := &parser{toks: tokenize(s)}
	n, err := p.expr()
	if err != nil {
		return nil, err
	}
	if p.pos < len(p.toks) {
		return nil, fmt.Errorf("loot: condition %q: unexpected %q", s, p.toks[p.pos].text)
	}
	return &Condition{root: n}, nil
}

// Eval evaluates the condition.
func (c *Condition) Eval(env Env) (bool, error) {
	if c == nil || c.root == nil {
		return true, nil
	}
	return c.root.eval(env)
}

type node interface {
	eval(Env) (bool, error)
}

type andNode []node
type orNode []node
type notNode struct{ n node }
type callNode struct {
	fn   string
	args []string
}

func (a andNode) eval(env Env) (bool, error) {
	for _, n := range a {
		v, err := n.eval(env)
		if err != nil || !v {
			return false, err
		}
	}
	return true, nil
}

func (o orNode) eval(env Env) (bool, error) {
	var first error
	for _, n := range o {
		v, err := n.eval(env)
		if err == nil && v {
			return true, nil
		}
		if err != nil && first == nil {
			first = err
		}
	}
	return false, first
}

func (n notNode) eval(env Env) (bool, error) {
	v, err := n.n.eval(env)
	if err != nil {
		return false, err
	}
	return !v, nil
}

func (c callNode) eval(env Env) (bool, error) {
	arg := func(i int) string {
		if i < len(c.args) {
			return c.args[i]
		}
		return ""
	}
	switch c.fn {
	case "file":
		if isRegex(arg(0)) {
			dir, re, err := splitRegexPath(arg(0))
			if err != nil {
				return false, err
			}
			return env.CountFiles(dir, re) > 0, nil
		}
		return env.FileExists(arg(0)), nil
	case "many":
		dir, re, err := splitRegexPath(arg(0))
		if err != nil {
			return false, err
		}
		return env.CountFiles(dir, re) > 1, nil
	case "readable":
		return env.Readable(arg(0)), nil
	case "active":
		if isRegex(arg(0)) {
			re, err := compileName(arg(0))
			if err != nil {
				return false, ErrUnsupported
			}
			return env.CountActive(re) > 0, nil
		}
		return env.Active(arg(0)), nil
	case "many_active":
		re, err := compileName(arg(0))
		if err != nil {
			return false, ErrUnsupported
		}
		return env.CountActive(re) > 1, nil
	case "is_master":
		return env.IsMaster(arg(0))
	case "checksum":
		want, err := strconv.ParseUint(strings.TrimPrefix(strings.ToLower(arg(1)), "0x"), 16, 32)
		if err != nil {
			return false, ErrUnsupported
		}
		got, err := env.Checksum(arg(0))
		if err != nil {
			return false, err
		}
		return got == uint32(want), nil
	case "version":
		if !env.FileExists(arg(0)) {
			// LOOT: a missing file has no version; "!=" and "<" are true
			// for it, the others false.
			return arg(2) == "!=" || arg(2) == "<" || arg(2) == "<=", nil
		}
		got, err := env.Version(arg(0))
		if err != nil {
			return false, err
		}
		return compare(CompareVersions(got, arg(1)), arg(2))
	case "description_contains":
		re, err := regexp.Compile("(?i)" + arg(1))
		if err != nil {
			return false, ErrUnsupported
		}
		d, err := env.Description(arg(0))
		if err != nil {
			return false, err
		}
		return re.MatchString(d), nil
	}
	// product_version, filename_version, is_executable, file_size and any
	// function of a newer format.
	return false, ErrUnsupported
}

func compare(c int, op string) (bool, error) {
	switch op {
	case "==":
		return c == 0, nil
	case "!=":
		return c != 0, nil
	case "<":
		return c < 0, nil
	case ">":
		return c > 0, nil
	case "<=":
		return c <= 0, nil
	case ">=":
		return c >= 0, nil
	}
	return false, ErrUnsupported
}

// splitRegexPath splits "dir/name-regex" into the literal folder and the
// compiled name pattern.
func splitRegexPath(s string) (string, *regexp.Regexp, error) {
	dir, name := "", s
	if i := strings.LastIndex(s, "/"); i >= 0 {
		dir, name = s[:i], s[i+1:]
	}
	re, err := compileName(name)
	if err != nil {
		return "", nil, ErrUnsupported
	}
	return dir, re, nil
}

// CompareVersions compares two version strings the way LOOT's pseudo-semver
// does in practice: runs of digits compare as numbers, other runs as
// case-insensitive text, separators are ignored and missing parts count as
// zero.
func CompareVersions(a, b string) int {
	pa, pb := versionParts(a), versionParts(b)
	for i := 0; i < len(pa) || i < len(pb); i++ {
		x, y := "0", "0"
		if i < len(pa) {
			x = pa[i]
		}
		if i < len(pb) {
			y = pb[i]
		}
		nx, ex := strconv.ParseUint(x, 10, 64)
		ny, ey := strconv.ParseUint(y, 10, 64)
		switch {
		case ex == nil && ey == nil:
			if nx != ny {
				if nx < ny {
					return -1
				}
				return 1
			}
		case ex == nil: // number beats text (1.0 > 1.0-beta)
			return 1
		case ey == nil:
			return -1
		default:
			if c := strings.Compare(strings.ToLower(x), strings.ToLower(y)); c != 0 {
				return c
			}
		}
	}
	return 0
}

func versionParts(s string) []string {
	var out []string
	var cur []rune
	kind := 0 // 1 digit, 2 letter
	flush := func() {
		if len(cur) > 0 {
			out = append(out, string(cur))
			cur = cur[:0]
		}
	}
	for _, r := range strings.TrimSpace(s) {
		k := 0
		switch {
		case unicode.IsDigit(r):
			k = 1
		case unicode.IsLetter(r):
			k = 2
		}
		if k == 0 || k != kind {
			flush()
		}
		kind = k
		if k != 0 {
			cur = append(cur, r)
		}
	}
	flush()
	return out
}

type token struct {
	kind byte // 'i' ident, 's' string, 'o' operator/number, '(' ')' ','
	text string
}

func tokenize(s string) []token {
	var out []token
	rs := []rune(s)
	for i := 0; i < len(rs); {
		r := rs[i]
		switch {
		case unicode.IsSpace(r):
			i++
		case r == '(' || r == ')' || r == ',':
			out = append(out, token{kind: byte(r), text: string(r)})
			i++
		case r == '"':
			j := i + 1
			for j < len(rs) && rs[j] != '"' {
				j++
			}
			out = append(out, token{kind: 's', text: string(rs[i+1 : min(j, len(rs))])})
			i = j + 1
		case unicode.IsLetter(r) || r == '_':
			j := i
			for j < len(rs) && (unicode.IsLetter(rs[j]) || unicode.IsDigit(rs[j]) || rs[j] == '_') {
				j++
			}
			out = append(out, token{kind: 'i', text: string(rs[i:j])})
			i = j
		default:
			j := i
			for j < len(rs) && !unicode.IsSpace(rs[j]) && rs[j] != ',' && rs[j] != ')' && rs[j] != '(' {
				j++
			}
			out = append(out, token{kind: 'o', text: string(rs[i:j])})
			i = j
		}
	}
	return out
}

type parser struct {
	toks []token
	pos  int
}

func (p *parser) peek() (token, bool) {
	if p.pos < len(p.toks) {
		return p.toks[p.pos], true
	}
	return token{}, false
}

func (p *parser) keyword(w string) bool {
	t, ok := p.peek()
	if ok && t.kind == 'i' && t.text == w {
		p.pos++
		return true
	}
	return false
}

func (p *parser) expr() (node, error) {
	var or orNode
	for {
		n, err := p.and()
		if err != nil {
			return nil, err
		}
		or = append(or, n)
		if !p.keyword("or") {
			break
		}
	}
	if len(or) == 1 {
		return or[0], nil
	}
	return or, nil
}

func (p *parser) and() (node, error) {
	var and andNode
	for {
		n, err := p.unary()
		if err != nil {
			return nil, err
		}
		and = append(and, n)
		if !p.keyword("and") {
			break
		}
	}
	if len(and) == 1 {
		return and[0], nil
	}
	return and, nil
}

func (p *parser) unary() (node, error) {
	if p.keyword("not") {
		n, err := p.unary()
		if err != nil {
			return nil, err
		}
		return notNode{n}, nil
	}
	t, ok := p.peek()
	if !ok {
		return nil, errors.New("loot: condition ends early")
	}
	if t.kind == '(' {
		p.pos++
		n, err := p.expr()
		if err != nil {
			return nil, err
		}
		if t, ok := p.peek(); !ok || t.kind != ')' {
			return nil, errors.New("loot: condition misses )")
		}
		p.pos++
		return n, nil
	}
	if t.kind != 'i' {
		return nil, fmt.Errorf("loot: condition: unexpected %q", t.text)
	}
	p.pos++
	call := callNode{fn: t.text}
	if t, ok := p.peek(); !ok || t.kind != '(' {
		return nil, fmt.Errorf("loot: condition: %s needs arguments", call.fn)
	}
	p.pos++
	for {
		t, ok := p.peek()
		if !ok {
			return nil, errors.New("loot: condition misses )")
		}
		p.pos++
		if t.kind == ')' {
			break
		}
		if t.kind == ',' {
			continue
		}
		call.args = append(call.args, t.text)
	}
	return call, nil
}
