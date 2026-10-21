// Package loot is the provider of LOOT data for the plugins module (D041,
// D140, D141): it reads a LOOT masterlist (and a userlist), evaluates its
// conditions against the plugins of an instance and gives the plugins
// module soft rules, groups and messages. It is not a sorter: the native
// engine (D029) keeps the order.
//
// The module knows the LOOT file format, never a game: which masterlist a
// game uses, and the copy shipped with the app, come from the adapter
// (ports.LootSupport).
package loot

import (
	"bytes"
	"fmt"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

// Masterlist is the part of a LOOT metadata file the provider uses
// (masterlist.yaml or userlist.yaml). Bash tags and cleaning data other than
// the dirty entries are ignored.
type Masterlist struct {
	Groups  []Group
	Globals []Message
	Plugins []PluginEntry
}

// Group is a LOOT group: plugins of a group load after the plugins of the
// groups in After.
type Group struct {
	Name        string
	After       []string
	Description string
}

// File is an entry of after, req and inc: a file name with an optional
// condition. Display is the text LOOT shows instead of the name.
type File struct {
	Name      string
	Display   string
	Condition string
}

// Text is a message text in one language.
type Text struct {
	Lang string
	Text string
}

// Message is a LOOT message: type say, warn or error; content in one or more
// languages, with {0}-style substitutions.
type Message struct {
	Type      string
	Content   []Text
	Subs      []string
	Condition string
}

// Dirty is a dirty version of a plugin: the CRC-32 of the file and what
// cleaning removes (identical to master records, deleted references,
// deleted navmeshes).
type Dirty struct {
	CRC       uint32
	Util      string
	ITM       int
	UDR       int
	Nav       int
	Condition string
}

// PluginEntry is the metadata of one plugin name or, when the name is a
// regular expression, of every plugin it matches.
type PluginEntry struct {
	Name  string
	Group string
	After []File
	Req   []File
	Inc   []File
	Msg   []Message
	Dirty []Dirty

	re *regexp.Regexp
}

// Matches reports whether the entry applies to a plugin name.
func (e PluginEntry) Matches(name string) bool {
	if e.re != nil {
		return e.re.MatchString(name)
	}
	return strings.EqualFold(e.Name, name)
}

// IsRegex reports whether the entry name is a regular expression (LOOT: the
// name holds one of `:\*?|`).
func (e PluginEntry) IsRegex() bool { return e.re != nil }

// isRegex is LOOT's rule for telling a regular expression from a file name.
func isRegex(s string) bool { return strings.ContainsAny(s, `:\*?|`) }

// compileName compiles a file name regex the way LOOT does: whole name,
// case-insensitive.
func compileName(s string) (*regexp.Regexp, error) {
	return regexp.Compile(`(?i)^(?:` + s + `)$`)
}

// Parse reads a masterlist or a userlist. When prelude is not empty it
// replaces the prelude section of the masterlist first, as LOOT does, so the
// anchors the masterlist uses carry the translations of the prelude.
func Parse(data, prelude []byte) (*Masterlist, error) {
	if len(prelude) > 0 {
		data = splicePrelude(data, prelude)
	}
	var raw rawList
	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("loot: %w", err)
	}
	m := &Masterlist{}
	for _, g := range raw.Groups {
		if strings.TrimSpace(g.Name) == "" {
			continue
		}
		m.Groups = append(m.Groups, Group{Name: g.Name, After: g.After, Description: g.Description})
	}
	for _, msg := range raw.Globals {
		m.Globals = append(m.Globals, msg.message())
	}
	for _, p := range raw.Plugins {
		if strings.TrimSpace(p.Name) == "" {
			continue
		}
		e := PluginEntry{Name: p.Name, Group: p.Group, After: files(p.After), Req: files(p.Req), Inc: files(p.Inc)}
		if isRegex(p.Name) {
			re, err := compileName(p.Name)
			if err != nil {
				continue // LOOT skips what it cannot compile too
			}
			e.re = re
		}
		for _, msg := range p.Msg {
			e.Msg = append(e.Msg, msg.message())
		}
		for _, d := range p.Dirty {
			e.Dirty = append(e.Dirty, Dirty{CRC: d.CRC, Util: d.Util, ITM: d.ITM, UDR: d.UDR, Nav: d.Nav, Condition: d.Condition})
		}
		m.Plugins = append(m.Plugins, e)
	}
	return m, nil
}

// splicePrelude replaces the value of the top-level "prelude:" key with the
// prelude file, indented under it.
func splicePrelude(data, prelude []byte) []byte {
	lines := bytes.Split(data, []byte("\n"))
	start := -1
	for i, l := range lines {
		if bytes.Equal(bytes.TrimRight(l, " \r"), []byte("prelude:")) {
			start = i
			break
		}
	}
	if start < 0 {
		return data
	}
	end := len(lines)
	for i := start + 1; i < len(lines); i++ {
		l := lines[i]
		if len(l) > 0 && l[0] != ' ' && l[0] != '\t' && l[0] != '#' && l[0] != '\r' {
			end = i
			break
		}
	}
	var b bytes.Buffer
	for _, l := range lines[:start+1] {
		b.Write(l)
		b.WriteByte('\n')
	}
	for _, l := range bytes.Split(prelude, []byte("\n")) {
		if len(bytes.TrimSpace(l)) > 0 {
			b.WriteString("  ")
		}
		b.Write(l)
		b.WriteByte('\n')
	}
	for i, l := range lines[end:] {
		b.Write(l)
		if end+i < len(lines)-1 {
			b.WriteByte('\n')
		}
	}
	return b.Bytes()
}

// Text picks the text of a message in a language ("pt-BR" matches LOOT's
// "pt_BR", then "pt"), falling back to English and then to the first text,
// with the substitutions applied.
func (m Message) Text(lang string) string {
	pick := func() string {
		want := strings.ReplaceAll(lang, "-", "_")
		base, _, _ := strings.Cut(want, "_")
		for _, c := range []string{want, base, "en"} {
			for _, t := range m.Content {
				if strings.EqualFold(t.Lang, c) {
					return t.Text
				}
			}
		}
		if len(m.Content) > 0 {
			return m.Content[0].Text
		}
		return ""
	}
	s := pick()
	for i, sub := range m.Subs {
		s = strings.ReplaceAll(s, fmt.Sprintf("{%d}", i), sub)
	}
	return s
}

type rawList struct {
	Groups  []rawGroup   `yaml:"groups"`
	Globals []rawMessage `yaml:"globals"`
	Plugins []rawPlugin  `yaml:"plugins"`
}

type rawGroup struct {
	Name        string   `yaml:"name"`
	After       []string `yaml:"after"`
	Description string   `yaml:"description"`
}

type rawPlugin struct {
	Name  string       `yaml:"name"`
	Group string       `yaml:"group"`
	After []rawFile    `yaml:"after"`
	Req   []rawFile    `yaml:"req"`
	Inc   []rawFile    `yaml:"inc"`
	Msg   []rawMessage `yaml:"msg"`
	Dirty []rawDirty   `yaml:"dirty"`
}

// rawFile is a scalar name or a map with name, display and condition.
type rawFile struct {
	Name      string `yaml:"name"`
	Display   string `yaml:"display"`
	Condition string `yaml:"condition"`
}

func (f *rawFile) UnmarshalYAML(n *yaml.Node) error {
	if n.Kind == yaml.ScalarNode {
		f.Name = n.Value
		return nil
	}
	type plain rawFile
	var p plain
	if err := n.Decode(&p); err != nil {
		return err
	}
	*f = rawFile(p)
	return nil
}

func files(in []rawFile) []File {
	var out []File
	for _, f := range in {
		if strings.TrimSpace(f.Name) != "" {
			out = append(out, File{Name: f.Name, Display: f.Display, Condition: f.Condition})
		}
	}
	return out
}

// rawContent is a scalar (English) or a list of {lang, text}.
type rawContent []Text

func (c *rawContent) UnmarshalYAML(n *yaml.Node) error {
	if n.Kind == yaml.ScalarNode {
		*c = rawContent{{Lang: "en", Text: n.Value}}
		return nil
	}
	var list []struct {
		Lang string `yaml:"lang"`
		Text string `yaml:"text"`
	}
	if err := n.Decode(&list); err != nil {
		return err
	}
	for _, t := range list {
		*c = append(*c, Text{Lang: t.Lang, Text: t.Text})
	}
	return nil
}

type rawMessage struct {
	Type      string     `yaml:"type"`
	Content   rawContent `yaml:"content"`
	Subs      []string   `yaml:"subs"`
	Condition string     `yaml:"condition"`
}

func (r rawMessage) message() Message {
	return Message{Type: r.Type, Content: []Text(r.Content), Subs: r.Subs, Condition: r.Condition}
}

type rawDirty struct {
	CRC       uint32 `yaml:"crc"`
	Util      string `yaml:"util"`
	ITM       int    `yaml:"itm"`
	UDR       int    `yaml:"udr"`
	Nav       int    `yaml:"nav"`
	Condition string `yaml:"condition"`
}
