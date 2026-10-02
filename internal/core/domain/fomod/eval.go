package fomod

import (
	"slices"
	"strconv"
	"strings"
)

// Env is what conditions read about the game (core/03 §4). It is computed
// by the application before evaluation; evaluation itself is pure.
type Env struct {
	// Files maps a path relative to the plugin target, in lower case with
	// "/" separators, to its state. Absent means Missing.
	Files map[string]FileState
	// Versions of the game, of the manager (fommDependency) and of the
	// script extender (foseDependency); "" is unknown.
	GameVersion     string
	ManagerVersion  string
	ExtenderVersion string
}

// FileKey is the key of a path in Env.Files.
func FileKey(p string) string { return strings.ToLower(cleanPath(p)) }

// Warning is a non-fatal finding, with a stable code and parameters the UI
// translates (INV-OPS-05).
type Warning struct {
	Code   string
	Params map[string]string
}

// Warning codes.
const (
	// WarnUnknownVersion: a version condition could not be compared and was
	// considered true (core/03 §4).
	WarnUnknownVersion = "fomod_unknown_version"
	// WarnMissingSource: an instruction names a file or folder the archive
	// does not have; it is skipped.
	WarnMissingSource = "fomod_missing_source"
	// WarnInvalidDestination: an instruction's destination is not a valid
	// relative path (INV-ID-02); it is skipped.
	WarnInvalidDestination = "fomod_invalid_destination"
	// WarnChoiceDropped: a recorded choice no longer matches the installer.
	WarnChoiceDropped = "fomod_choice_dropped"
)

// GroupKey addresses a group by display position.
type GroupKey struct{ Step, Group int }

// Selection holds the options the user chose in the groups they visited,
// by display position. A group without entry was not visited: it takes its
// defaults (Required and Recommended options, or the first usable option
// when the group needs one).
type Selection map[GroupKey][]int

// Clone copies a selection.
func (s Selection) Clone() Selection {
	out := make(Selection, len(s))
	for k, v := range s {
		out[k] = slices.Clone(v)
	}
	return out
}

// Problem codes of a group that does not accept its selection.
const (
	ProblemExactlyOne = "exactly_one"
	ProblemAtLeastOne = "at_least_one"
	ProblemAtMostOne  = "at_most_one"
)

// State is the wizard for a selection: every step in display order with
// its visibility, the groups with the state of each option, the flags, and
// the instructions the selection installs.
type State struct {
	Steps []StepState
	Flags map[string]string
	// DependenciesMet is false when moduleDependencies are not met; Unmet
	// lists the failing terms ("file:X:Active", "game:1.6").
	DependenciesMet bool
	Unmet           []string
	Instructions    []Instruction
	Warnings        []Warning
}

// StepState is one step.
type StepState struct {
	Index   int
	Name    string
	Visible bool
	Groups  []GroupState
}

// GroupState is one group of a step.
type GroupState struct {
	Index   int
	Name    string
	Type    GroupType
	Options []OptionState
	// Problem is set when the selection breaks the group type.
	Problem string
}

// OptionState is one option of a group.
type OptionState struct {
	Index       int
	Name        string
	Description string
	Image       string
	Type        OptionType
	Selected    bool
	// Locked options cannot be changed (Required, SelectAll); Disabled ones
	// cannot be selected (NotUsable).
	Locked   bool
	Disabled bool
}

// Selected returns the positions of the selected options.
func (g GroupState) Selected() []int {
	var out []int
	for _, o := range g.Options {
		if o.Selected {
			out = append(out, o.Index)
		}
	}
	return out
}

// VisibleSteps returns the visible steps, in order.
func (s *State) VisibleSteps() []StepState {
	var out []StepState
	for _, st := range s.Steps {
		if st.Visible {
			out = append(out, st)
		}
	}
	return out
}

// Problems returns the groups of visible steps whose selection is invalid.
func (s *State) Problems() []GroupKey {
	var out []GroupKey
	for _, st := range s.VisibleSteps() {
		for _, g := range st.Groups {
			if g.Problem != "" {
				out = append(out, GroupKey{st.Index, g.Index})
			}
		}
	}
	return out
}

// Effective returns the selection the state shows, for every group of
// every visible step: what a reinstall records.
func (s *State) Effective() Selection {
	out := Selection{}
	for _, st := range s.VisibleSteps() {
		for _, g := range st.Groups {
			out[GroupKey{st.Index, g.Index}] = g.Selected()
		}
	}
	return out
}

// Evaluate computes the wizard state of sel. Flags are recalculated from
// scratch in the order of the visible steps; a step's visibility and its
// options' types read the flags set by the steps before it. Steps that are
// not visible contribute neither files nor flags (core/03 §4). Same module,
// env and selection always give the same state.
func Evaluate(m *Module, env Env, sel Selection) *State {
	st := &State{Flags: map[string]string{}}
	ev := &evaluator{env: env, flags: st.Flags, warned: map[string]bool{}}
	st.DependenciesMet = true
	if m.Dependencies != nil {
		st.DependenciesMet = ev.eval(*m.Dependencies)
		if !st.DependenciesMet {
			st.Unmet = ev.unmet(*m.Dependencies)
		}
	}
	var options []Instruction
	seq := 0
	for si, step := range m.Steps {
		ss := StepState{Index: si, Name: step.Name, Visible: step.Visible == nil || ev.eval(*step.Visible)}
		for gi, g := range step.Groups {
			gs := groupState(ev, gi, g, sel, GroupKey{si, gi})
			ss.Groups = append(ss.Groups, gs)
		}
		if ss.Visible {
			for gi, g := range step.Groups {
				for oi, o := range g.Options {
					os := ss.Groups[gi].Options[oi]
					if os.Selected {
						for _, f := range o.Flags {
							st.Flags[f.Name] = f.Value
						}
					}
					for _, f := range o.Files {
						if os.Selected || f.AlwaysInstall || (f.InstallIfUsable && os.Type != TypeNotUsable) {
							options = append(options, Instruction{FileInstall: f, Phase: PhaseOptions, Seq: seq})
							seq++
						}
					}
				}
			}
		}
		st.Steps = append(st.Steps, ss)
	}
	for _, f := range m.Required {
		st.Instructions = append(st.Instructions, Instruction{FileInstall: f, Phase: PhaseRequired, Seq: len(st.Instructions)})
	}
	st.Instructions = append(st.Instructions, options...)
	seq = 0
	for _, c := range m.Conditional {
		if ev.eval(c.When) {
			for _, f := range c.Files {
				st.Instructions = append(st.Instructions, Instruction{FileInstall: f, Phase: PhaseConditional, Seq: seq})
				seq++
			}
		}
	}
	st.Warnings = ev.warnings
	return st
}

// groupState resolves the type and selection of every option of a group.
func groupState(ev *evaluator, gi int, g Group, sel Selection, key GroupKey) GroupState {
	gs := GroupState{Index: gi, Name: g.Name, Type: g.Type}
	chosen, visited := sel[key]
	single := g.Type == SelectExactlyOne || g.Type == SelectAtMostOne
	locked := false
	for oi, o := range g.Options {
		t := ev.optionType(o.Type)
		os := OptionState{Index: oi, Name: o.Name, Description: o.Description, Image: o.Image, Type: t}
		os.Disabled = t == TypeNotUsable
		os.Locked = !os.Disabled && (t == TypeRequired || g.Type == SelectAll)
		if os.Locked {
			os.Selected = true
			locked = true
		}
		gs.Options = append(gs.Options, os)
	}
	free := func(i int) bool { return !gs.Options[i].Disabled && !gs.Options[i].Locked }
	switch {
	case single && locked:
		// A required option fills a single-choice group.
	case visited:
		for _, i := range chosen {
			if i >= 0 && i < len(gs.Options) && free(i) {
				gs.Options[i].Selected = true
				if single {
					break
				}
			}
		}
	default:
		for i, o := range gs.Options {
			if free(i) && o.Type == TypeRecommended {
				gs.Options[i].Selected = true
				if single {
					break
				}
			}
		}
		if (g.Type == SelectExactlyOne || g.Type == SelectAtLeastOne) && len(gs.Selected()) == 0 {
			for i := range gs.Options {
				if free(i) {
					gs.Options[i].Selected = true
					break
				}
			}
		}
	}
	n := len(gs.Selected())
	usable := slices.ContainsFunc(gs.Options, func(o OptionState) bool { return !o.Disabled })
	switch g.Type {
	case SelectExactlyOne:
		if n != 1 && usable {
			gs.Problem = ProblemExactlyOne
		}
	case SelectAtLeastOne:
		if n < 1 && usable {
			gs.Problem = ProblemAtLeastOne
		}
	case SelectAtMostOne:
		if n > 1 {
			gs.Problem = ProblemAtMostOne
		}
	}
	return gs
}

// evaluator evaluates conditions against the env and the current flags.
type evaluator struct {
	env      Env
	flags    map[string]string
	warnings []Warning
	warned   map[string]bool
}

func (ev *evaluator) optionType(td TypeDescriptor) OptionType {
	for _, p := range td.Patterns {
		if ev.eval(p.When) {
			return p.Type
		}
	}
	if td.Default == "" {
		return TypeOptional
	}
	return td.Default
}

// terms lists the results of every term of c.
func (ev *evaluator) terms(c Condition) []bool {
	var out []bool
	for _, f := range c.Files {
		out = append(out, ev.fileState(f.File) == f.State)
	}
	for _, f := range c.Flags {
		out = append(out, ev.flags[f.Flag] == f.Value)
	}
	for _, v := range c.Game {
		out = append(out, ev.version("game", ev.env.GameVersion, v))
	}
	for _, v := range c.Manager {
		out = append(out, ev.version("manager", ev.env.ManagerVersion, v))
	}
	for _, v := range c.Extender {
		out = append(out, ev.version("extender", ev.env.ExtenderVersion, v))
	}
	for _, n := range c.Nested {
		out = append(out, ev.eval(n))
	}
	return out
}

// eval combines the terms with the operator; a condition without terms is
// true.
func (ev *evaluator) eval(c Condition) bool {
	t := ev.terms(c)
	if len(t) == 0 {
		return true
	}
	if c.Operator == OpOr {
		return slices.Contains(t, true)
	}
	return !slices.Contains(t, false)
}

// unmet lists the failing terms of a failed condition, for the message.
func (ev *evaluator) unmet(c Condition) []string {
	var out []string
	for _, f := range c.Files {
		if ev.fileState(f.File) != f.State {
			out = append(out, "file:"+f.File+":"+string(f.State))
		}
	}
	for _, f := range c.Flags {
		if ev.flags[f.Flag] != f.Value {
			out = append(out, "flag:"+f.Flag+":"+f.Value)
		}
	}
	for _, v := range c.Game {
		if !ev.version("game", ev.env.GameVersion, v) {
			out = append(out, "game:"+v)
		}
	}
	for _, v := range c.Manager {
		if !ev.version("manager", ev.env.ManagerVersion, v) {
			out = append(out, "manager:"+v)
		}
	}
	for _, v := range c.Extender {
		if !ev.version("extender", ev.env.ExtenderVersion, v) {
			out = append(out, "extender:"+v)
		}
	}
	for _, n := range c.Nested {
		if !ev.eval(n) {
			out = append(out, ev.unmet(n)...)
		}
	}
	return out
}

func (ev *evaluator) fileState(file string) FileState {
	if s, ok := ev.env.Files[FileKey(file)]; ok {
		return s
	}
	return FileMissing
}

// version reports whether have >= want. An unknown or unparsable version
// makes the condition true with a warning (core/03 §4).
func (ev *evaluator) version(kind, have, want string) bool {
	h, ok1 := parseVersion(have)
	w, ok2 := parseVersion(want)
	if !ok1 || !ok2 {
		key := kind + "|" + have + "|" + want
		if !ev.warned[key] {
			ev.warned[key] = true
			ev.warnings = append(ev.warnings, Warning{Code: WarnUnknownVersion, Params: map[string]string{"kind": kind, "have": have, "want": want}})
		}
		return true
	}
	return compareVersions(h, w) >= 0
}

// parseVersion reads a dotted numeric version ("1.6.1170.0").
func parseVersion(s string) ([]int, bool) {
	s = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(s), "v"))
	if s == "" {
		return nil, false
	}
	var out []int
	for _, part := range strings.Split(s, ".") {
		n, err := strconv.Atoi(part)
		if err != nil || n < 0 {
			return nil, false
		}
		out = append(out, n)
	}
	return out, true
}

func compareVersions(a, b []int) int {
	for i := range max(len(a), len(b)) {
		var x, y int
		if i < len(a) {
			x = a[i]
		}
		if i < len(b) {
			y = b[i]
		}
		if x != y {
			if x < y {
				return -1
			}
			return 1
		}
	}
	return 0
}

// FileConditions lists every file named by a fileDependency anywhere in
// the module: the files the env must describe.
func (m *Module) FileConditions() []string {
	seen := map[string]bool{}
	var out []string
	var walk func(c *Condition)
	walk = func(c *Condition) {
		if c == nil {
			return
		}
		for _, f := range c.Files {
			if k := FileKey(f.File); !seen[k] {
				seen[k] = true
				out = append(out, f.File)
			}
		}
		for i := range c.Nested {
			walk(&c.Nested[i])
		}
	}
	walk(m.Dependencies)
	for i := range m.Steps {
		walk(m.Steps[i].Visible)
		for _, g := range m.Steps[i].Groups {
			for _, o := range g.Options {
				for j := range o.Type.Patterns {
					walk(&o.Type.Patterns[j].When)
				}
			}
		}
	}
	for i := range m.Conditional {
		walk(&m.Conditional[i].When)
	}
	return out
}

// RequiredFiles lists the files the moduleDependencies require to exist
// (state Active or Inactive) through And conditions only: the requirements
// the installer detects (core/03 §2).
func (m *Module) RequiredFiles() []string {
	var out []string
	var walk func(c Condition)
	walk = func(c Condition) {
		if c.Operator == OpOr && len(c.Files)+len(c.Flags)+len(c.Game)+len(c.Manager)+len(c.Extender)+len(c.Nested) > 1 {
			return
		}
		for _, f := range c.Files {
			if f.State != FileMissing && !slices.ContainsFunc(out, func(s string) bool { return FileKey(s) == FileKey(f.File) }) {
				out = append(out, f.File)
			}
		}
		for _, n := range c.Nested {
			walk(n)
		}
	}
	if m.Dependencies != nil {
		walk(*m.Dependencies)
	}
	return out
}
