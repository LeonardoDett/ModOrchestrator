package fomod

import (
	"encoding/json"
	"slices"
	"strconv"
)

// Choice is a recorded group selection. Names travel with the positions so
// a stored selection can be checked against the installer it is applied to
// (core/03 §2 options; the shape collections will reuse, core/03 §10).
type Choice struct {
	Step      int      `json:"step"`
	StepName  string   `json:"stepName"`
	Group     int      `json:"group"`
	GroupName string   `json:"groupName"`
	Options   []int    `json:"options"`
	Names     []string `json:"names"`
}

// Choices returns the recorded form of a selection, sorted by position.
func Choices(m *Module, sel Selection) []Choice {
	out := []Choice{}
	for k, opts := range sel {
		if k.Step < 0 || k.Step >= len(m.Steps) || k.Group < 0 || k.Group >= len(m.Steps[k.Step].Groups) {
			continue
		}
		g := m.Steps[k.Step].Groups[k.Group]
		c := Choice{Step: k.Step, StepName: m.Steps[k.Step].Name, Group: k.Group, GroupName: g.Name, Options: []int{}, Names: []string{}}
		sorted := slices.Clone(opts)
		slices.Sort(sorted)
		for _, i := range slices.Compact(sorted) {
			if i >= 0 && i < len(g.Options) {
				c.Options = append(c.Options, i)
				c.Names = append(c.Names, g.Options[i].Name)
			}
		}
		out = append(out, c)
	}
	slices.SortFunc(out, func(a, b Choice) int {
		if a.Step != b.Step {
			return a.Step - b.Step
		}
		return a.Group - b.Group
	})
	return out
}

// Encode serialises a selection for Installation.Options.
func Encode(m *Module, sel Selection) string {
	b, _ := json.Marshal(Choices(m, sel))
	return string(b)
}

// Decode reads a recorded selection and applies it to m. A choice whose
// step, group or option names no longer match is dropped with a warning,
// and its group falls back to its defaults.
func Decode(m *Module, s string) (Selection, []Warning, error) {
	var choices []Choice
	if err := json.Unmarshal([]byte(s), &choices); err != nil {
		return nil, nil, err
	}
	sel := Selection{}
	var warnings []Warning
	drop := func(c Choice) {
		warnings = append(warnings, Warning{Code: WarnChoiceDropped, Params: map[string]string{
			"step": c.StepName, "group": c.GroupName, "position": strconv.Itoa(c.Step) + "/" + strconv.Itoa(c.Group),
		}})
	}
	for _, c := range choices {
		if c.Step < 0 || c.Step >= len(m.Steps) || m.Steps[c.Step].Name != c.StepName ||
			c.Group < 0 || c.Group >= len(m.Steps[c.Step].Groups) || m.Steps[c.Step].Groups[c.Group].Name != c.GroupName ||
			len(c.Options) != len(c.Names) {
			drop(c)
			continue
		}
		g := m.Steps[c.Step].Groups[c.Group]
		ok := true
		for i, o := range c.Options {
			if o < 0 || o >= len(g.Options) || g.Options[o].Name != c.Names[i] {
				ok = false
			}
		}
		if !ok {
			drop(c)
			continue
		}
		sel[GroupKey{c.Step, c.Group}] = slices.Clone(c.Options)
	}
	return sel, warnings, nil
}
