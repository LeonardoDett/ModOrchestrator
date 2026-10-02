package plugins

import (
	"context"
	"slices"
	"strings"

	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/plugin"
)

// Row is one plugin of the Plugins and Load Order screens (core/08 §9).
type Row struct {
	Name     plugin.Name
	Enabled  bool
	Implicit bool
	Locked   bool
	// Position is the place in the full load order (1-based); Index the
	// load index in the adapter format ("" when inactive).
	Position int
	Index    string
	Origin   plugin.Origin
	Mod      mod.ID
	ModName  string
	Flags    []plugin.Flag
	Group    string
	Masters  int
	// Problems counts the diagnostics about the plugin; Problem is the
	// code of the most severe one.
	Problems    int
	Problem     diagnostic.Code
	Severity    diagnostic.Severity
	Author      string
	Version     string
	Description string
	Rules       int
}

// ListView is the Plugins screen (ui/telas/plugins.md).
type ListView struct {
	Instance game.InstanceID
	Rows     []Row
	Limits   []plugin.LimitUsage
	Active   int
	Errors   int
	AutoSort bool
	// Disabled lists plugins of disabled or losing mods (filter "plugins
	// de mods desabilitados", core/08 §2).
	Disabled []DisabledPlugin
	// External: the game's load order file changed outside the app.
	External bool
	// Cycle lists the plugins of a cycle that blocks the sort.
	Cycle        []plugin.Name
	ManualOrder  bool
	HasLoadOrder bool
}

func (s *Service) problems(ctx context.Context, st *state, a arrangement) (map[string][]diagnostic.Diagnostic, []diagnostic.Diagnostic, error) {
	ds, err := s.diagnostics(ctx, st, a)
	if err != nil {
		return nil, nil, err
	}
	by := map[string][]diagnostic.Diagnostic{}
	for _, d := range ds {
		for _, r := range d.Related {
			if r.Kind == "plugin" {
				by[r.ID] = append(by[r.ID], d)
			}
		}
	}
	return by, ds, nil
}

func rank(sv diagnostic.Severity) int {
	switch sv {
	case diagnostic.SeverityError:
		return 3
	case diagnostic.SeverityWarning:
		return 2
	}
	return 1
}

func (st *state) rows(a arrangement, probs map[string][]diagnostic.Diagnostic) ([]Row, []plugin.LimitUsage) {
	var active []plugin.Plugin
	for _, n := range a.order {
		if p, ok := st.plugin(n); ok && st.enabled(p) {
			active = append(active, p)
		}
	}
	idx, limits := st.ps.Indexes(st.inst.Game, active)
	locks := map[string]bool{}
	for _, l := range st.profile.IndexLocks() {
		locks[string(l.Item)] = true
	}
	ruleCount := map[string]int{}
	for _, r := range st.rules.List() {
		ruleCount[r.Plugin.Key()]++
		ruleCount[r.After.Key()]++
	}
	rows := make([]Row, 0, len(a.order))
	for i, n := range a.order {
		p, ok := st.plugin(n)
		if !ok {
			continue
		}
		r := Row{
			Name: p.Name, Enabled: st.enabled(p), Implicit: p.Implicit, Locked: p.Implicit || locks[p.Name.Key()],
			Position: i + 1, Origin: p.Origin, Mod: p.Mod, ModName: st.modNames[p.Mod], Flags: slices.Clone(p.Header.Flags),
			Group: st.rules.GroupOf(p.Name), Masters: len(p.Header.Masters), Author: p.Header.Author,
			Version: p.Header.Version, Description: p.Header.Description, Rules: ruleCount[p.Name.Key()],
		}
		if r.Enabled {
			r.Index = idx[p.Name.Key()]
		}
		for _, d := range probs[p.Name.Key()] {
			r.Problems++
			if rank(d.Severity) > rank(r.Severity) {
				r.Severity, r.Problem = d.Severity, d.Code
			}
		}
		rows = append(rows, r)
	}
	return rows, limits
}

// List builds the Plugins screen of the active profile.
func (s *Service) List(ctx context.Context, instance game.InstanceID) (ListView, error) {
	st, err := s.load(ctx, instance)
	if err != nil {
		return ListView{}, err
	}
	a := st.arrange(st.settings.autoSort)
	probs, ds, err := s.problems(ctx, st, a)
	if err != nil {
		return ListView{}, err
	}
	v := ListView{Instance: instance, AutoSort: st.settings.autoSort, Disabled: st.disabledList, HasLoadOrder: st.lo != nil}
	v.ManualOrder = st.lo == nil || st.lo.ManualOrder(st.inst.Game)
	v.Rows, v.Limits = st.rows(a, probs)
	for _, r := range v.Rows {
		if r.Enabled {
			v.Active++
		}
		if r.Severity == diagnostic.SeverityError {
			v.Errors++
		}
	}
	for _, d := range ds {
		if d.Code == diagnostic.CodeLoadOrderExternalChange {
			v.External = true
		}
	}
	if a.cycle != nil {
		v.Cycle = st.cycleNames(*a.cycle)
	}
	return v, nil
}

func (st *state) cycleNames(c ordering.Cycle) []plugin.Name {
	out := make([]plugin.Name, len(c.Items))
	for i, it := range c.Items {
		out[i] = plugin.Name(it)
		if p, ok := st.plugin(plugin.Name(it)); ok {
			out[i] = p.Name
		}
	}
	return out
}

// MasterView is a master of a plugin with its state (ui/telas/plugins.md
// §4: present, active, before this one).
type MasterView struct {
	Name    plugin.Name
	Present bool
	Active  bool
	Before  bool
	// Mod provides it (the inventory's mod, or an installed mod outside
	// the inventory when absent).
	Mod      mod.ID
	ModName  string
	Disabled bool
}

// RuleView is a plugin rule.
type RuleView struct {
	ID       plugin.RuleID
	Plugin   plugin.Name
	After    plugin.Name
	Source   string
	Disabled bool
	// Orphan: one of the plugins is unknown to the instance.
	Orphan bool
}

// Details is the Inspector of a plugin.
type Details struct {
	Row
	Path        string
	HeaderError string
	MastersList []MasterView
	Dependents  []plugin.Name
	Rules       []RuleView
	Diagnostics []diagnostic.Diagnostic
}

// Details describes one plugin (core/08 §9).
func (s *Service) Details(ctx context.Context, instance game.InstanceID, name plugin.Name) (Details, error) {
	st, err := s.load(ctx, instance)
	if err != nil {
		return Details{}, err
	}
	p, err := st.mustPlugin(name)
	if err != nil {
		return Details{}, err
	}
	a := st.arrange(st.settings.autoSort)
	probs, _, err := s.problems(ctx, st, a)
	if err != nil {
		return Details{}, err
	}
	rows, _ := st.rows(a, probs)
	d := Details{HeaderError: p.HeaderError, Diagnostics: probs[p.Name.Key()]}
	for _, r := range rows {
		if r.Name.Key() == p.Name.Key() {
			d.Row = r
		}
	}
	for _, t := range st.inst.Targets {
		if t.ID == p.Location.Target {
			d.Path = game.JoinPath(t.Path, p.Location.Path.String())
		}
	}
	if p.Origin == plugin.OriginMod {
		d.Path = game.JoinPath(game.JoinPath(st.inst.Staging, string(p.Mod)), p.Location.Path.String())
	}
	pos := map[string]int{}
	for i, n := range a.order {
		pos[n.Key()] = i
	}
	for _, m := range p.Header.Masters {
		mv := MasterView{Name: m}
		if mp, ok := st.plugin(m); ok {
			mv.Name, mv.Present, mv.Active = mp.Name, true, st.enabled(mp)
			mv.Before = pos[m.Key()] < pos[p.Name.Key()]
			mv.Mod, mv.ModName = mp.Mod, st.modNames[mp.Mod]
		} else if prov, ok := st.disabled[m.Key()]; ok {
			mv.Mod, mv.ModName, mv.Disabled = prov.Mod, prov.ModName, true
		}
		d.MastersList = append(d.MastersList, mv)
	}
	for _, o := range st.inv {
		if slices.ContainsFunc(o.Header.Masters, func(m plugin.Name) bool { return m.Key() == p.Name.Key() }) {
			d.Dependents = append(d.Dependents, o.Name)
		}
	}
	known := st.known()
	for _, r := range st.rules.List() {
		if r.Plugin.Key() == p.Name.Key() || r.After.Key() == p.Name.Key() {
			d.Rules = append(d.Rules, ruleView(r, known))
		}
	}
	return d, nil
}

// known reports whether a plugin exists for the instance: inventory or a
// plugin of an installed mod.
func (st *state) known() func(plugin.Name) bool {
	return func(n plugin.Name) bool {
		if _, ok := st.plugin(n); ok {
			return true
		}
		_, ok := st.disabled[n.Key()]
		return ok
	}
}

func ruleView(r plugin.Rule, known func(plugin.Name) bool) RuleView {
	return RuleView{ID: r.ID, Plugin: r.Plugin, After: r.After, Source: string(r.Source), Disabled: r.Disabled, Orphan: !known(r.Plugin) || !known(r.After)}
}

// GroupView is a group with the plugins assigned to it.
type GroupView struct {
	Name    string
	After   []string
	Plugins []plugin.Name
	Default bool
}

// RulesView is the plugin rules dialog (DLG-23) and the groups dialog
// (DLG-24) data of an instance.
type RulesView struct {
	Rules  []RuleView
	Groups []GroupView
	// Plugins are the names offered by the editors (inventory).
	Plugins []plugin.Name
}

// RulesAndGroups lists the plugin rules and groups of an instance.
func (s *Service) RulesAndGroups(ctx context.Context, instance game.InstanceID) (RulesView, error) {
	st, err := s.load(ctx, instance)
	if err != nil {
		return RulesView{}, err
	}
	known := st.known()
	v := RulesView{Plugins: st.names()}
	slices.SortFunc(v.Plugins, func(a, b plugin.Name) int { return strings.Compare(a.Key(), b.Key()) })
	for _, r := range st.rules.List() {
		v.Rules = append(v.Rules, ruleView(r, known))
	}
	members := map[string][]plugin.Name{}
	for n, g := range st.rules.Assignments() {
		if p, ok := st.plugin(n); ok {
			n = p.Name
		}
		members[g] = append(members[g], n)
	}
	for _, g := range st.rules.Groups() {
		ps := members[g.Name]
		slices.SortFunc(ps, func(a, b plugin.Name) int { return strings.Compare(a.Key(), b.Key()) })
		v.Groups = append(v.Groups, GroupView{Name: g.Name, After: g.After, Plugins: ps, Default: g.Name == plugin.DefaultGroup})
	}
	return v, nil
}

// ApplyState says whether the game's load order file holds the profile's
// load order (ui/telas/load-order.md §2 "Estado").
type ApplyState struct {
	Supported bool
	// Applied: the file holds the desired load order.
	Applied bool
	// Differences counts plugins whose place or state differs.
	Differences int
	External    bool
	FileExists  bool
	Unreadable  bool
	// CanRestorePrevious: a previous written load order exists.
	CanRestorePrevious bool
}

// OrderView is the Load Order screen.
type OrderView struct {
	ListView
	State ApplyState
	// CanUndoSort: "Desfazer última ordenação" has something to undo.
	CanUndoSort bool
}

// LoadOrder builds the Load Order screen.
func (s *Service) LoadOrder(ctx context.Context, instance game.InstanceID) (OrderView, error) {
	lv, err := s.List(ctx, instance)
	if err != nil {
		return OrderView{}, err
	}
	v := OrderView{ListView: lv}
	st, err := s.load(ctx, instance)
	if err != nil {
		return OrderView{}, err
	}
	if v2, err := s.State.Get(ctx, stateLastSort+string(st.profile.ID())); err == nil && v2 != "" {
		v.CanUndoSort = true
	}
	if st.lo == nil {
		return v, nil
	}
	a := st.arrange(st.settings.autoSort)
	fs, err := s.fileState(ctx, st, a.order)
	if err != nil {
		return OrderView{}, err
	}
	v.State = ApplyState{Supported: true, Applied: fs.inSync, External: fs.external, FileExists: fs.obs.exists, Unreadable: fs.obs.unreadable}
	v.State.CanRestorePrevious = fs.applied != nil && len(fs.applied.PrevOrder) > 0
	if !fs.inSync {
		v.State.Differences = differences(st.entries(a.order), fs.obs.entries)
	}
	return v, nil
}

// differences counts the plugins written differently: not listed, other
// state or moved (complement of the longest common order).
func differences(want, have []plugin.Entry) int {
	var w, h []plugin.Name
	got := map[string]plugin.Entry{}
	for _, e := range have {
		got[e.Name.Key()] = e
	}
	n := 0
	for _, e := range want {
		if e.Implicit {
			continue
		}
		o, ok := got[e.Name.Key()]
		switch {
		case !ok:
			n++
		case o.Enabled != e.Enabled:
			n++
			fallthrough
		default:
			w = append(w, e.Name)
		}
	}
	wanted := map[string]bool{}
	for _, x := range w {
		wanted[x.Key()] = true
	}
	for _, e := range have {
		if wanted[e.Name.Key()] {
			h = append(h, e.Name)
		} else {
			n++
		}
	}
	if len(w) == len(h) {
		n += plugin.Moved(h, w)
	}
	return n
}

// ReasonView explains one constraint (Inspector "Por que está aqui").
type ReasonView struct {
	Kind  string
	Rule  plugin.RuleID
	Group string
	// AfterGroup is the group the plugin's group loads after.
	AfterGroup string
	Other      plugin.Name
	// Before: Other loads before the plugin.
	Before bool
	// Plugin is the constrained plugin (move refusals list both sides).
	Plugin plugin.Name
}

func (st *state) reason(e ordering.Edge, subject plugin.Name, before bool, other plugin.Name) ReasonView {
	rv := ReasonView{Kind: plugin.RefKind(e.Ref), Other: other, Before: before, Plugin: subject}
	switch {
	case strings.HasPrefix(e.Ref, plugin.RefRulePrefix):
		rv.Rule = plugin.RuleID(strings.TrimPrefix(e.Ref, plugin.RefRulePrefix))
	case strings.HasPrefix(e.Ref, plugin.RefGroupPrefix):
		g, a, _ := strings.Cut(strings.TrimPrefix(e.Ref, plugin.RefGroupPrefix), ">")
		rv.Group, rv.AfterGroup = g, a
	}
	return rv
}

func (st *state) reasonViews(edges []ordering.Edge) []ReasonView {
	var out []ReasonView
	for _, e := range edges {
		after, _ := st.plugin(plugin.Name(e.After))
		before, _ := st.plugin(plugin.Name(e.Before))
		out = append(out, st.reason(e, after.Name, true, before.Name))
	}
	return out
}

// MoveView is one plugin moved by a sort, with why.
type MoveView struct {
	Plugin   plugin.Name
	From, To int
	Because  []ReasonView
}

func (st *state) moveViews(moves []plugin.Move) []MoveView {
	out := make([]MoveView, 0, len(moves))
	for _, m := range moves {
		out = append(out, MoveView{Plugin: m.Plugin, From: m.From + 1, To: m.To + 1, Because: st.reasonViews(m.Because)})
	}
	return out
}

// Explanation is why a plugin is where it is (ui/telas/load-order.md §3).
type Explanation struct {
	Plugin   plugin.Name
	Position int
	Fixed    bool
	Locked   bool
	Group    string
	// After: constraints that keep it after other plugins; Dependents:
	// plugins that must load after it.
	After      []ReasonView
	Dependents []ReasonView
}

// Explain answers "por que está aqui".
func (s *Service) Explain(ctx context.Context, instance game.InstanceID, name plugin.Name) (Explanation, error) {
	st, err := s.load(ctx, instance)
	if err != nil {
		return Explanation{}, err
	}
	p, err := st.mustPlugin(name)
	if err != nil {
		return Explanation{}, err
	}
	a := st.arrange(st.settings.autoSort)
	c := st.constraints(true)
	ex := Explanation{Plugin: p.Name, Fixed: p.Implicit, Group: st.rules.GroupOf(p.Name)}
	_, ex.Locked = c.Locks[p.Name.Key()]
	ex.Position = slices.IndexFunc(a.order, func(n plugin.Name) bool { return n.Key() == p.Name.Key() }) + 1
	for _, r := range plugin.Explain(p.Name, a.order, c) {
		e := ordering.Edge{Ref: r.Ref}
		if r.Before {
			ex.After = append(ex.After, st.reason(e, p.Name, true, r.Other))
		} else {
			ex.Dependents = append(ex.Dependents, st.reason(e, p.Name, false, r.Other))
		}
	}
	return ex, nil
}

// Line is one line of the load order diff (DiffViewer).
type Line struct {
	Name    plugin.Name
	Enabled bool
}

// Diff is the desired load order against the game's file.
type Diff struct {
	Desired []Line
	Applied []Line
	Exists  bool
}

// DiffApplied compares the profile's load order with the game's file
// ("Comparar com aplicada").
func (s *Service) DiffApplied(ctx context.Context, instance game.InstanceID) (Diff, error) {
	st, err := s.load(ctx, instance)
	if err != nil {
		return Diff{}, err
	}
	if st.lo == nil {
		return Diff{}, fail(CodeNoPlugins, nil)
	}
	a := st.arrange(st.settings.autoSort)
	obs, err := s.observe(ctx, st)
	if err != nil {
		return Diff{}, err
	}
	d := Diff{Exists: obs.exists}
	for _, e := range st.entries(a.order) {
		if !e.Implicit {
			d.Desired = append(d.Desired, Line{Name: e.Name, Enabled: e.Enabled})
		}
	}
	for _, e := range obs.entries {
		d.Applied = append(d.Applied, Line{Name: e.Name, Enabled: e.Enabled})
	}
	return d, nil
}

// Preview is what "Ordenar agora" would do (DLG-25).
type Preview struct {
	Moves []MoveView
	// ConfirmAbove: the UI shows the preview when more plugins than this
	// would move; fewer are applied at once with "Desfazer".
	ConfirmAbove int
	Cycle        []plugin.Name
}

// SortPreview computes the sort without applying it.
func (s *Service) SortPreview(ctx context.Context, instance game.InstanceID) (Preview, error) {
	st, err := s.load(ctx, instance)
	if err != nil {
		return Preview{}, err
	}
	pv := Preview{ConfirmAbove: s.intSetting(ctx, "order.snapshotMoveThreshold", 20)}
	a := st.arrange(true)
	if a.cycle != nil {
		pv.Cycle = st.cycleNames(*a.cycle)
		return pv, nil
	}
	pv.Moves = st.moveViews(a.moves)
	return pv, nil
}

// Export returns the load order as text in the game's format ("Exportar ›
// Copiar lista").
func (s *Service) Export(ctx context.Context, instance game.InstanceID) (string, error) {
	st, err := s.load(ctx, instance)
	if err != nil {
		return "", err
	}
	if st.lo == nil {
		return "", fail(CodeNoPlugins, nil)
	}
	a := st.arrange(st.settings.autoSort)
	b, err := st.lo.Serialize(st.inst.Game, st.entries(a.order))
	if err != nil {
		return "", err
	}
	// The export is for reading and pasting: plain UTF-8 lines.
	entries, _ := st.lo.Parse(st.inst.Game, b)
	var sb strings.Builder
	for _, e := range entries {
		if e.Enabled {
			sb.WriteByte('*')
		}
		sb.WriteString(string(e.Name))
		sb.WriteString("\n")
	}
	return sb.String(), nil
}
