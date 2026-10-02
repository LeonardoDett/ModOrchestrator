package fomod

import (
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"slices"
	"strconv"
	"strings"
)

// MaxXMLSize bounds what is parsed (core/03 §7).
const MaxXMLSize = 8 << 20

// Errors of the parser.
var (
	// ErrInvalidXML is a malformed or refused ModuleConfig.xml
	// (fomod_invalid_xml).
	ErrInvalidXML = errors.New("fomod: invalid xml")
)

// Parse reads a ModuleConfig.xml. It accepts UTF-8, UTF-16 and
// Windows-1252 text (core/03 §4), refuses documents above MaxXMLSize and
// any entity declaration: the decoder never resolves external entities
// (XXE), and declared ones are refused before decoding as defence in depth.
// Unknown elements are ignored; unknown enum values fall back to the schema
// defaults.
func Parse(data []byte) (*Module, error) {
	if len(data) > MaxXMLSize {
		return nil, fmt.Errorf("%w: larger than %d bytes", ErrInvalidXML, MaxXMLSize)
	}
	text, err := DecodeText(data)
	if err != nil {
		return nil, errors.Join(ErrInvalidXML, err)
	}
	if strings.Contains(strings.ToUpper(text), "<!ENTITY") {
		return nil, fmt.Errorf("%w: entity declarations are not accepted", ErrInvalidXML)
	}
	var doc xConfig
	dec := xml.NewDecoder(strings.NewReader(text))
	dec.Strict = false
	dec.Entity = xml.HTMLEntity
	dec.CharsetReader = func(_ string, r io.Reader) (io.Reader, error) { return r, nil } // already decoded
	if err := dec.Decode(&doc); err != nil {
		return nil, errors.Join(ErrInvalidXML, err)
	}
	if doc.XMLName.Local != "config" {
		return nil, fmt.Errorf("%w: root element is %q, not config", ErrInvalidXML, doc.XMLName.Local)
	}
	m := &Module{Name: clean(doc.ModuleName), Required: doc.Required.files()}
	if doc.ModuleImage != nil {
		m.Image = cleanPath(doc.ModuleImage.Path)
	}
	if doc.Dependencies != nil {
		c := doc.Dependencies.condition()
		m.Dependencies = &c
	}
	if doc.Steps != nil {
		for _, s := range doc.Steps.Steps {
			step := Step{Name: clean(s.Name)}
			if s.Visible != nil {
				c := s.Visible.condition()
				step.Visible = &c
			}
			if s.Groups != nil {
				for _, g := range s.Groups.Groups {
					group := Group{Name: clean(g.Name), Type: groupType(g.Type)}
					if g.Plugins != nil {
						for _, p := range g.Plugins.Plugins {
							group.Options = append(group.Options, p.option())
						}
						sortByName(group.Options, order(g.Plugins.Order), func(o Option) string { return o.Name })
					}
					step.Groups = append(step.Groups, group)
				}
				sortByName(step.Groups, order(s.Groups.Order), func(g Group) string { return g.Name })
			}
			m.Steps = append(m.Steps, step)
		}
		sortByName(m.Steps, order(doc.Steps.Order), func(s Step) string { return s.Name })
	}
	if doc.Conditional != nil {
		for _, p := range doc.Conditional.Patterns {
			m.Conditional = append(m.Conditional, ConditionalInstall{When: p.Dependencies.condition(), Files: p.Files.files()})
		}
	}
	return m, nil
}

// sortByName applies an order attribute. Sorting is stable and ignores
// case, so equal names keep their document order.
func sortByName[T any](items []T, o Order, name func(T) string) {
	switch o {
	case OrderExplicit:
		return
	case OrderDescending:
		slices.SortStableFunc(items, func(a, b T) int { return strings.Compare(strings.ToLower(name(b)), strings.ToLower(name(a))) })
	default:
		slices.SortStableFunc(items, func(a, b T) int { return strings.Compare(strings.ToLower(name(a)), strings.ToLower(name(b))) })
	}
}

func order(s string) Order {
	switch strings.TrimSpace(s) {
	case string(OrderExplicit):
		return OrderExplicit
	case string(OrderDescending):
		return OrderDescending
	}
	return OrderAscending
}

func groupType(s string) GroupType {
	switch t := GroupType(strings.TrimSpace(s)); t {
	case SelectExactlyOne, SelectAtMostOne, SelectAtLeastOne, SelectAll:
		return t
	}
	return SelectAny
}

func optionType(s string) OptionType {
	switch t := OptionType(strings.TrimSpace(s)); t {
	case TypeRequired, TypeRecommended, TypeNotUsable, TypeCouldBeUsable:
		return t
	}
	return TypeOptional
}

func fileState(s string) FileState {
	switch t := FileState(strings.TrimSpace(s)); t {
	case FileInactive, FileMissing:
		return t
	}
	return FileActive
}

func clean(s string) string { return strings.TrimSpace(s) }

// cleanPath turns a FOMOD path into "/" form without leading or trailing
// separators. It does not validate it: sources are matched against the
// archive entries and destinations are parsed by the installer (INV-ID-02).
func cleanPath(s string) string {
	s = strings.ReplaceAll(strings.TrimSpace(s), `\`, "/")
	for strings.Contains(s, "//") {
		s = strings.ReplaceAll(s, "//", "/")
	}
	s = strings.TrimPrefix(s, "./")
	return strings.Trim(s, "/")
}

// --- raw XML shapes (schema ModuleConfig 5.x) ---

type xConfig struct {
	XMLName      xml.Name
	ModuleName   string        `xml:"moduleName"`
	ModuleImage  *xImage       `xml:"moduleImage"`
	Dependencies *xDeps        `xml:"moduleDependencies"`
	Required     *xFiles       `xml:"requiredInstallFiles"`
	Steps        *xSteps       `xml:"installSteps"`
	Conditional  *xConditional `xml:"conditionalFileInstalls"`
}

type xImage struct {
	Path string `xml:"path,attr"`
}

type xDeps struct {
	Operator string     `xml:"operator,attr"`
	Files    []xFileDep `xml:"fileDependency"`
	Flags    []xFlagDep `xml:"flagDependency"`
	Game     []xVersion `xml:"gameDependency"`
	Fomm     []xVersion `xml:"fommDependency"`
	Fose     []xVersion `xml:"foseDependency"`
	Nested   []xDeps    `xml:"dependencies"`
}

type xFileDep struct {
	File  string `xml:"file,attr"`
	State string `xml:"state,attr"`
}

type xFlagDep struct {
	Flag  string `xml:"flag,attr"`
	Value string `xml:"value,attr"`
}

type xVersion struct {
	Version string `xml:"version,attr"`
}

func (d *xDeps) condition() Condition {
	if d == nil {
		return Condition{Operator: OpAnd}
	}
	c := Condition{Operator: OpAnd}
	if strings.EqualFold(strings.TrimSpace(d.Operator), string(OpOr)) {
		c.Operator = OpOr
	}
	for _, f := range d.Files {
		c.Files = append(c.Files, FileCondition{File: cleanPath(f.File), State: fileState(f.State)})
	}
	for _, f := range d.Flags {
		c.Flags = append(c.Flags, FlagCondition{Flag: clean(f.Flag), Value: clean(f.Value)})
	}
	for _, v := range d.Game {
		c.Game = append(c.Game, clean(v.Version))
	}
	for _, v := range d.Fomm {
		c.Manager = append(c.Manager, clean(v.Version))
	}
	for _, v := range d.Fose {
		c.Extender = append(c.Extender, clean(v.Version))
	}
	for i := range d.Nested {
		c.Nested = append(c.Nested, d.Nested[i].condition())
	}
	return c
}

// xFiles keeps file and folder elements in document order: on equal
// priority the later one wins.
type xFiles struct {
	Items []xFile `xml:",any"`
}

type xFile struct {
	XMLName         xml.Name
	Source          string  `xml:"source,attr"`
	Destination     *string `xml:"destination,attr"`
	Priority        string  `xml:"priority,attr"`
	AlwaysInstall   string  `xml:"alwaysInstall,attr"`
	InstallIfUsable string  `xml:"installIfUsable,attr"`
}

func (f *xFiles) files() []FileInstall {
	if f == nil {
		return nil
	}
	var out []FileInstall
	for _, it := range f.Items {
		var folder bool
		switch it.XMLName.Local {
		case "file":
		case "folder":
			folder = true
		default:
			continue
		}
		fi := FileInstall{
			Folder: folder, Source: cleanPath(it.Source),
			AlwaysInstall: boolAttr(it.AlwaysInstall), InstallIfUsable: boolAttr(it.InstallIfUsable),
		}
		if it.Destination != nil {
			fi.Destination, fi.HasDestination = cleanPath(*it.Destination), true
		}
		if p, err := strconv.Atoi(strings.TrimSpace(it.Priority)); err == nil {
			fi.Priority = p
		}
		out = append(out, fi)
	}
	return out
}

func boolAttr(s string) bool {
	s = strings.TrimSpace(s)
	return strings.EqualFold(s, "true") || s == "1"
}

type xSteps struct {
	Order string  `xml:"order,attr"`
	Steps []xStep `xml:"installStep"`
}

type xStep struct {
	Name    string   `xml:"name,attr"`
	Visible *xDeps   `xml:"visible"`
	Groups  *xGroups `xml:"optionalFileGroups"`
}

type xGroups struct {
	Order  string   `xml:"order,attr"`
	Groups []xGroup `xml:"group"`
}

type xGroup struct {
	Name    string    `xml:"name,attr"`
	Type    string    `xml:"type,attr"`
	Plugins *xPlugins `xml:"plugins"`
}

type xPlugins struct {
	Order   string    `xml:"order,attr"`
	Plugins []xPlugin `xml:"plugin"`
}

type xPlugin struct {
	Name           string  `xml:"name,attr"`
	Description    string  `xml:"description"`
	Image          *xImage `xml:"image"`
	Files          *xFiles `xml:"files"`
	ConditionFlags *struct {
		Flags []struct {
			Name  string `xml:"name,attr"`
			Value string `xml:",chardata"`
		} `xml:"flag"`
	} `xml:"conditionFlags"`
	TypeDescriptor *struct {
		Type *struct {
			Name string `xml:"name,attr"`
		} `xml:"type"`
		DependencyType *struct {
			Default *struct {
				Name string `xml:"name,attr"`
			} `xml:"defaultType"`
			Patterns *struct {
				Patterns []struct {
					Dependencies *xDeps `xml:"dependencies"`
					Type         *struct {
						Name string `xml:"name,attr"`
					} `xml:"type"`
				} `xml:"pattern"`
			} `xml:"patterns"`
		} `xml:"dependencyType"`
	} `xml:"typeDescriptor"`
}

func (p xPlugin) option() Option {
	o := Option{Name: clean(p.Name), Description: clean(p.Description), Files: p.Files.files(), Type: TypeDescriptor{Default: TypeOptional}}
	if p.Image != nil {
		o.Image = cleanPath(p.Image.Path)
	}
	if p.ConditionFlags != nil {
		for _, f := range p.ConditionFlags.Flags {
			o.Flags = append(o.Flags, Flag{Name: clean(f.Name), Value: clean(f.Value)})
		}
	}
	if td := p.TypeDescriptor; td != nil {
		switch {
		case td.DependencyType != nil:
			if td.DependencyType.Default != nil {
				o.Type.Default = optionType(td.DependencyType.Default.Name)
			}
			if td.DependencyType.Patterns != nil {
				for _, pt := range td.DependencyType.Patterns.Patterns {
					tp := TypePattern{When: pt.Dependencies.condition(), Type: TypeOptional}
					if pt.Type != nil {
						tp.Type = optionType(pt.Type.Name)
					}
					o.Type.Patterns = append(o.Type.Patterns, tp)
				}
			}
		case td.Type != nil:
			o.Type.Default = optionType(td.Type.Name)
		}
	}
	return o
}

type xConditional struct {
	Patterns []struct {
		Dependencies *xDeps  `xml:"dependencies"`
		Files        *xFiles `xml:"files"`
	} `xml:"patterns>pattern"`
}
