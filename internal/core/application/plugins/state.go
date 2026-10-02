package plugins

import (
	"context"
	"errors"
	"fmt"
	"io"
	"slices"
	"strconv"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/conflict"
	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/health"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/override"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/core/domain/profile"
	"modorchestrator/internal/core/domain/relpath"
	"modorchestrator/internal/core/domain/rules"
)

// state is everything the plugin views and commands derive from, read
// outside any transaction. The inventory is calculated (docs-ia/03).
type state struct {
	inst    game.Instance
	def     game.Definition
	ps      ports.PluginSupport
	lo      ports.LoadOrderSupport // nil without the load_order capability
	profile *profile.Profile
	rules   *plugin.Rules
	// inv is the inventory in its natural order: implicit first, then
	// plugins of mods by priority, then unmanaged ones by name.
	inv   []plugin.Plugin
	byKey map[string]int
	// implicit are the fixed plugins at the top, in order.
	implicit []plugin.Name
	hard     []ordering.Edge
	// disabled are plugins of installed mods that are not in the
	// inventory (mod disabled, or its file loses), by key.
	disabled map[string]health.Provider
	// disabledList keeps them in a stable order for the UI filter.
	disabledList []DisabledPlugin
	losing       []health.LosingPlugin
	modNames     map[mod.ID]string
	settings     prefs
	// rootFiles are the file names at the top of the plugin target, in
	// the desired state of enabled mods and on disk (archive checks).
	rootFiles []string
}

// DisabledPlugin is a plugin a disabled (or losing) mod provides.
type DisabledPlugin struct {
	Name    plugin.Name
	Mod     mod.ID
	ModName string
	// Losing is true when the mod is enabled but another one deploys the
	// file.
	Losing bool
}

// prefs are the instance settings of core/13 › Plugins.
type prefs struct {
	autoSort, enableOnModEnable, enableExternal bool
}

// support returns the adapter interfaces of an instance, refusing games
// without the plugins capability.
func (s *Service) support(inst game.Instance) (game.Definition, ports.PluginSupport, ports.LoadOrderSupport, error) {
	adapter, ok := s.Registry.ByName(inst.Adapter)
	if !ok {
		return game.Definition{}, nil, nil, fail("game_unknown", nil, "game", string(inst.Game))
	}
	def, err := adapter.InstanceDefinition(inst.Game, inst.Targets)
	if err != nil {
		return game.Definition{}, nil, nil, err
	}
	ps, ok := adapter.(ports.PluginSupport)
	if !ok || !def.Capabilities.Has(game.CapPlugins) {
		return def, nil, nil, fail(CodeNoPlugins, nil, "game", string(inst.Game))
	}
	lo, _ := adapter.(ports.LoadOrderSupport)
	if !def.Capabilities.Has(game.CapLoadOrder) {
		lo = nil
	}
	return def, ps, lo, nil
}

// Supported reports whether an instance has the plugins capability.
func (s *Service) Supported(ctx context.Context, instance game.InstanceID) bool {
	inst, err := s.Instances.Get(ctx, instance)
	if err != nil {
		return false
	}
	_, _, _, err = s.support(inst)
	return err == nil
}

func (s *Service) load(ctx context.Context, instance game.InstanceID) (*state, error) {
	inst, err := s.Instances.Get(ctx, instance)
	if errors.Is(err, ports.ErrNotFound) {
		return nil, fail(CodeInstanceNotFound, err, "instance", string(instance))
	}
	if err != nil {
		return nil, err
	}
	def, ps, lo, err := s.support(inst)
	if err != nil {
		return nil, err
	}
	pid, err := s.Profiles.Active(ctx, instance)
	if err != nil {
		return nil, err
	}
	p, err := s.Profiles.Get(ctx, pid)
	if err != nil {
		return nil, err
	}
	pr, err := s.PluginRules.Get(ctx, instance)
	if errors.Is(err, ports.ErrNotFound) {
		pr, err = plugin.NewRules(instance)
	}
	if err != nil {
		return nil, err
	}
	st := &state{inst: inst, def: def, ps: ps, lo: lo, profile: p, rules: pr, disabled: map[string]health.Provider{}, modNames: map[mod.ID]string{}}
	st.settings = prefs{
		autoSort:          s.boolSetting(ctx, instance, "plugins.autoSort", true),
		enableOnModEnable: s.boolSetting(ctx, instance, "plugins.enableOnModEnable", true),
		enableExternal:    s.boolSetting(ctx, instance, "plugins.enableExternallyAdded", false),
	}
	if err := s.inventory(ctx, st); err != nil {
		return nil, err
	}
	return st, nil
}

// inventory derives the plugins (core/08 §2): winners of the desired state
// of the active profile in the plugin target, the implicit plugins and the
// plugins found in the target that the manager does not own.
func (s *Service) inventory(ctx context.Context, st *state) error {
	id := st.inst.Game
	target := st.ps.PluginTarget(id)
	list, err := s.Mods.ListByInstance(ctx, st.inst.ID)
	if err != nil {
		return err
	}
	installed := map[mod.ID]*mod.Mod{}
	for _, m := range list {
		st.modNames[m.ID] = m.DisplayName()
		if m.State == mod.StateInstalled && m.Installation != "" {
			installed[m.ID] = m
		}
	}
	// Plugin files of every installed mod (only these are read).
	files := map[mod.ID]*mod.Installation{}
	var order []mod.ID // installed mods in mod order
	for _, mid := range st.profile.Mods() {
		m, ok := installed[mid]
		if !ok {
			continue
		}
		inst, err := s.installation(ctx, m.Installation)
		if errors.Is(err, ports.ErrNotFound) {
			continue // staging problem, reported elsewhere
		}
		if err != nil {
			return err
		}
		reduced := &mod.Installation{ID: inst.ID, Mod: inst.Mod, Instance: inst.Instance}
		for _, f := range inst.Files {
			if f.Dest.Target != target || strings.Contains(f.Dest.Path.String(), "/") {
				continue
			}
			if st.profile.IsEnabled(mid) {
				st.rootFiles = append(st.rootFiles, f.Dest.Path.String())
			}
			if st.ps.IsPlugin(id, f.Dest.Path.String()) {
				reduced.Files = append(reduced.Files, f)
			}
		}
		if len(reduced.Files) > 0 {
			files[mid] = reduced
			order = append(order, mid)
		}
	}
	var enabled []mod.ID
	installs := map[mod.ID]*mod.Installation{}
	for _, mid := range order {
		if st.profile.IsEnabled(mid) {
			enabled = append(enabled, mid)
			installs[mid] = files[mid]
		}
	}
	modRules, err := s.Rules.Get(ctx, st.inst.ID)
	if errors.Is(err, ports.ErrNotFound) {
		modRules, err = rules.New(st.inst.ID)
	}
	if err != nil {
		return err
	}
	intent, err := s.Overrides.Get(ctx, st.inst.ID)
	if errors.Is(err, ports.ErrNotFound) {
		intent, err = override.New(st.inst.ID)
	}
	if err != nil {
		return err
	}
	res := conflict.Calculate(conflict.Input{Enabled: enabled, Installations: installs, Intent: intent, RuleEdges: modRules.OrderEdges()})
	won := map[string]conflict.Winner{}
	for _, w := range res.Winners {
		won[w.Location.Path.Key()] = w
	}
	for _, c := range res.Conflicts {
		w, ok := won[c.Location.Path.Key()]
		if !ok {
			continue
		}
		var losers []string
		for _, p := range c.Providers {
			if p != w.Mod {
				losers = append(losers, st.modNames[p])
			}
		}
		if len(losers) > 0 {
			st.losing = append(st.losing, health.LosingPlugin{Name: plugin.Name(c.Location.Path.String()), Winner: w.Mod, WinnerName: st.modNames[w.Mod], Losers: losers})
		}
	}
	// Mod plugins in mod priority order (lowest first), as the game would
	// see them appended.
	var modPlugins []plugin.Plugin
	for _, mid := range enabled {
		for _, f := range files[mid].Files {
			w, ok := won[f.Dest.Path.Key()]
			if !ok || w.Mod != mid {
				continue
			}
			p := plugin.Plugin{Name: plugin.Name(f.Dest.Path.String()), Location: f.Dest, Origin: plugin.OriginMod, Mod: mid}
			s.header(ctx, st, &p, game.JoinPath(game.JoinPath(st.inst.Staging, string(mid)), f.Source.String()))
			modPlugins = append(modPlugins, p)
		}
	}
	inMods := map[string]bool{}
	for _, p := range modPlugins {
		inMods[p.Name.Key()] = true
	}
	for _, mid := range order {
		for _, f := range files[mid].Files {
			k := f.Dest.Path.Key()
			if inMods[k] {
				if w := won[k]; w.Mod != mid && st.profile.IsEnabled(mid) {
					st.disabledList = append(st.disabledList, DisabledPlugin{Name: plugin.Name(f.Dest.Path.String()), Mod: mid, ModName: st.modNames[mid], Losing: true})
				}
				continue
			}
			if _, ok := st.disabled[k]; !ok {
				st.disabled[k] = health.Provider{Mod: mid, ModName: st.modNames[mid]}
			}
			st.disabledList = append(st.disabledList, DisabledPlugin{Name: plugin.Name(f.Dest.Path.String()), Mod: mid, ModName: st.modNames[mid]})
		}
	}
	// Plugins on disk that the manager does not own.
	var manifest *deployment.Manifest
	if m, err := s.Manifests.Current(ctx, st.inst.ID); err == nil {
		manifest = m
	} else if !errors.Is(err, ports.ErrNotFound) {
		return err
	}
	dir := ""
	for _, t := range st.inst.Targets {
		if t.ID == target {
			dir = t.Path
		}
	}
	var unmanaged []plugin.Plugin
	if info, err := s.FS.Stat(ctx, dir); dir != "" && err == nil && info.Exists && info.IsDir {
		entries, err := s.FS.ReadDir(ctx, dir)
		if err != nil {
			return err
		}
		for _, e := range entries {
			if !e.IsDir {
				st.rootFiles = append(st.rootFiles, e.Name)
			}
			if e.IsDir || !st.ps.IsPlugin(id, e.Name) {
				continue
			}
			rel, err := relpath.Parse(e.Name)
			if err != nil {
				continue
			}
			loc := game.Location{Target: target, Path: rel}
			if inMods[rel.Key()] {
				continue // the desired state replaces it
			}
			if manifest != nil {
				if _, ours := manifest.Owns(loc); ours {
					continue // deployed by us and no longer desired
				}
			}
			p := plugin.Plugin{Name: plugin.Name(e.Name), Location: loc, Origin: plugin.OriginUnmanaged}
			s.header(ctx, st, &p, game.JoinPath(dir, e.Name))
			unmanaged = append(unmanaged, p)
		}
	}
	slices.SortFunc(unmanaged, func(a, b plugin.Plugin) int { return strings.Compare(a.Name.Key(), b.Name.Key()) })
	all := append(modPlugins, unmanaged...)
	names := make([]plugin.Name, len(all))
	for i, p := range all {
		names[i] = p.Name
	}
	implicit, err := st.ps.Implicit(ctx, s.FS, st.inst, names)
	if err != nil {
		return err
	}
	st.implicit = implicit
	isImplicit := map[string]bool{}
	for _, n := range implicit {
		isImplicit[n.Key()] = true
	}
	byKey := map[string]plugin.Plugin{}
	for _, p := range all {
		if isImplicit[p.Name.Key()] {
			p.Implicit = true
			if p.Origin == plugin.OriginUnmanaged {
				p.Origin = plugin.OriginBaseGame
			}
		}
		byKey[p.Name.Key()] = p
	}
	st.inv = st.inv[:0]
	for _, n := range implicit {
		st.inv = append(st.inv, byKey[n.Key()])
	}
	for _, p := range all {
		if !isImplicit[p.Name.Key()] {
			st.inv = append(st.inv, byKey[p.Name.Key()])
		}
	}
	st.byKey = make(map[string]int, len(st.inv))
	for i, p := range st.inv {
		st.byKey[p.Name.Key()] = i
	}
	st.hard = st.ps.Constraints(id, st.inv)
	if s.Cache != nil {
		_ = s.Cache.Flush()
	}
	return nil
}

// header reads the header of p through the cache. The key is the file
// identity on disk (path, size, modification time): a changed file is read
// again (D088).
func (s *Service) header(ctx context.Context, st *state, p *plugin.Plugin, path string) {
	info, err := s.FS.Stat(ctx, path)
	if err != nil || !info.Exists {
		p.HeaderError = "unreadable"
		return
	}
	key := strings.ToLower(game.CleanAbs(path)) + "|" + strconv.FormatInt(info.Size, 10) + "|" + strconv.FormatInt(info.ModTime.UnixNano(), 10)
	if s.Cache != nil {
		if h, ok := s.Cache.Get(key); ok {
			p.Header = h
			return
		}
	}
	f, err := s.FS.Open(ctx, path)
	if err != nil {
		p.HeaderError = "unreadable"
		return
	}
	defer f.Close()
	h, err := st.ps.ReadHeader(st.inst.Game, string(p.Name), io.LimitReader(f, 4<<20))
	if err != nil {
		p.HeaderError = "invalid"
		return
	}
	p.Header = h
	if s.Cache != nil {
		s.Cache.Put(key, h)
	}
}

func (st *state) names() []plugin.Name {
	out := make([]plugin.Name, len(st.inv))
	for i, p := range st.inv {
		out[i] = p.Name
	}
	return out
}

func (st *state) plugin(n plugin.Name) (plugin.Plugin, bool) {
	i, ok := st.byKey[n.Key()]
	if !ok {
		return plugin.Plugin{}, false
	}
	return st.inv[i], true
}

// enabled is the effective state of a plugin: implicit ones are always
// active; a recorded state wins; a plugin never seen takes the default of
// its origin (core/08 §3: plugins.enableOnModEnable for mods,
// plugins.enableExternallyAdded for the others).
func (st *state) enabled(p plugin.Plugin) bool {
	if p.Implicit {
		return true
	}
	if on, known := st.profile.PluginEnabled(p.Name); known {
		return on
	}
	if p.Origin == plugin.OriginMod {
		return st.settings.enableOnModEnable
	}
	return st.settings.enableExternal
}

// constraints of the current inventory (core/08 §4).
func (st *state) constraints(withLocks bool) plugin.Constraints {
	c := plugin.Constraints{Hard: st.hard, Soft: st.rules.Edges(st.names()), Fixed: st.implicit, Locks: map[string]int{}}
	if withLocks {
		for _, l := range st.profile.IndexLocks() {
			c.Locks[string(l.Item)] = l.Index
		}
	}
	return c
}

// arrangement is the load order the profile should have now.
type arrangement struct {
	// before is the persisted order merged with the inventory; order is
	// the result of the engine.
	before, order  []plugin.Name
	added, removed []plugin.Name
	moves          []plugin.Move
	sorted         bool
	cycle          *ordering.Cycle
	lockConflict   []plugin.Name
}

// arrange merges the persisted load order with the inventory and lets the
// engine place new plugins and fix broken hard constraints; with auto-sort
// (or sort) every constraint is applied (core/08 §5). A cycle keeps the
// order (only hard constraints, or nothing when those cycle); a lock that
// contradicts the constraints is left out and reported.
func (st *state) arrange(sort bool) arrangement {
	merged, added, removed := plugin.Merge(st.profile.LoadOrder(), st.names())
	a := arrangement{before: merged, order: merged, added: added, removed: removed}
	if c, cyclic := st.rules.Cycle(st.names(), st.hard); cyclic {
		a.cycle = &c
		sort = false
	}
	run := func(c plugin.Constraints) (plugin.Result, error) {
		if sort {
			return plugin.Sort(merged, c)
		}
		return plugin.Settle(merged, c)
	}
	res, err := run(st.constraints(true))
	if err != nil && errors.Is(err, ordering.ErrLockConflict) {
		for _, l := range st.profile.IndexLocks() {
			if p, ok := st.plugin(plugin.Name(l.Item)); ok {
				a.lockConflict = append(a.lockConflict, p.Name)
			}
		}
		res, err = run(st.constraints(false))
	}
	if err != nil {
		return a // hard constraints cycle: reported, nothing moves
	}
	a.order, a.moves, a.sorted = res.Order, res.Moves, sort
	return a
}

// changed reports whether the arrangement differs from what is persisted.
func (a arrangement) changed(persisted []plugin.Name) bool {
	return !slices.EqualFunc(a.order, persisted, func(x, y plugin.Name) bool { return x == y })
}

// entries is the load order as the adapter serializes it.
func (st *state) entries(order []plugin.Name) []plugin.Entry {
	out := make([]plugin.Entry, 0, len(order))
	for _, n := range order {
		p, ok := st.plugin(n)
		if !ok {
			continue
		}
		out = append(out, plugin.Entry{Name: p.Name, Enabled: st.enabled(p), Implicit: p.Implicit})
	}
	return out
}

func (st *state) mustPlugin(n plugin.Name) (plugin.Plugin, error) {
	p, ok := st.plugin(n)
	if !ok {
		return plugin.Plugin{}, fail(CodePluginNotFound, nil, "plugin", string(n))
	}
	return p, nil
}

func cycleParams(c ordering.Cycle) []string {
	items := make([]string, len(c.Items))
	for i, it := range c.Items {
		items[i] = string(it)
	}
	joined := strings.Join(items, " → ")
	return []string{"cycle", joined, "plugins", joined, "count", fmt.Sprint(len(items))}
}
