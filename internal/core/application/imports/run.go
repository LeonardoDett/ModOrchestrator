package imports

import (
	"context"
	"errors"
	"slices"
	"strings"

	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	profilesvc "modorchestrator/internal/core/application/profiles"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/migration"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/core/domain/profile"
	"modorchestrator/internal/core/domain/rules"
)

// run is the state of one import.
type run struct {
	s    *Service
	t    *operations.Tracker
	env  env
	src  migration.Source
	opts Options

	snap      migration.Snapshot
	parts     map[migration.Part]bool
	chosen    []migration.Profile
	items     []*item
	skipped   []Skipped
	created   []mod.ID
	committed bool
}

func (r *run) has(p migration.Part) bool { return r.parts[p] }

func (r *run) run(ctx context.Context) error {
	for _, st := range []struct {
		name string
		fn   func(context.Context) error
	}{{StepRead, r.read}, {StepCopy, r.copy}, {StepCommit, r.commit}} {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := r.t.BeginStep(ctx, st.name); err != nil {
			return err
		}
		if err := st.fn(ctx); err != nil {
			return err
		}
		if err := r.t.CompleteStep(ctx, st.name); err != nil {
			return err
		}
	}
	return nil
}

// read loads the source again (it may have changed since the preview) and
// resolves the options.
func (r *run) read(ctx context.Context) error {
	snap, err := r.s.read(ctx, r.env, r.src)
	if err != nil {
		return err
	}
	r.snap = snap
	available := snap.Parts(r.env.def)
	want := r.opts.Parts
	if len(want) == 0 {
		want = migration.DefaultParts(available)
	}
	r.parts = map[migration.Part]bool{migration.PartMods: true}
	for _, p := range want {
		if slices.Contains(available, p) {
			r.parts[p] = true
		}
	}
	if len(r.opts.Profiles) == 0 {
		if p, ok := snap.ActiveProfile(); ok {
			r.chosen = []migration.Profile{p}
		}
	}
	for _, name := range r.opts.Profiles {
		p, ok := snap.Profile(name)
		if !ok {
			return fail(CodeProfileNotFound, nil, "name", name)
		}
		r.chosen = append(r.chosen, p)
	}
	if len(r.chosen) == 0 {
		// A manager without profiles: everything enabled in one.
		all := map[string]bool{}
		for _, m := range snap.Mods {
			all[m.Key] = true
		}
		r.chosen = []migration.Profile{{Name: snap.Source.Name, Active: true, Enabled: all}}
	}
	return nil
}

// copy enters the mods in the library as installing, then copies each one
// into its own staging folder (".installing" first, renamed when whole).
func (r *run) copy(ctx context.Context) error {
	inst := r.env.inst
	if info, err := r.s.FS.Stat(ctx, inst.Staging); err != nil || !info.Exists || !info.IsDir || !r.s.ownsStaging(ctx, inst) {
		return fail(CodeStagingUnavail, err, "folder", inst.Staging)
	}
	items, skipped, err := r.s.scan(ctx, r.snap)
	if err != nil {
		return err
	}
	items = slices.DeleteFunc(items, func(it *item) bool { return slices.Contains(r.opts.Exclude, it.src.Key) })
	if len(items) == 0 {
		return fail(CodeNothing, nil, "manager", string(r.src.Manager))
	}
	r.items, r.skipped = items, skipped
	var total int64
	for _, it := range items {
		total += it.size
	}
	if free, err := r.s.FS.FreeSpace(ctx, inst.Staging); err == nil && free < total {
		return fail(CodeDiskFull, nil, "folder", inst.Staging)
	}
	now := r.s.Clock.Now()
	opID := r.t.ID()
	var ids []mod.ID
	err = r.s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		for _, it := range items {
			it.id = mod.ID(r.s.IDs.NewID())
			name := strings.TrimSpace(it.src.Name)
			if name == "" {
				name = it.src.Key
			}
			m, err := mod.New(it.id, inst.ID, name, mod.Source{Kind: mod.SourceImport, Ref: string(opID)}, now)
			if err != nil {
				return err
			}
			if err := m.BeginInstall(now); err != nil {
				return err
			}
			if err := tx.Mods().Save(ctx, m); err != nil {
				return err
			}
			ids = append(ids, it.id)
		}
		return nil
	})
	if err != nil {
		return err
	}
	r.created = ids
	var done int64
	for _, it := range items {
		folder := game.JoinPath(inst.Staging, string(it.id))
		work := folder + ".installing"
		made := map[string]bool{}
		for _, f := range it.files {
			if err := ctx.Err(); err != nil {
				return err
			}
			dst := game.JoinPath(work, f.Path.String())
			if parent := parentDir(dst); !made[parent] {
				if err := r.s.FS.MkdirAll(ctx, parent); err != nil {
					return err
				}
				made[parent] = true
			}
			if err := r.s.FS.Copy(ctx, game.JoinPath(it.src.Folder, f.Path.String()), dst); err != nil {
				if errors.Is(err, ports.ErrDiskFull) {
					return fail(CodeDiskFull, err, "folder", inst.Staging)
				}
				return err
			}
			done += f.Size
		}
		if err := r.s.FS.Rename(ctx, work, folder); err != nil {
			return err
		}
		_ = r.t.Progress(ctx, done, total)
	}
	return nil
}

// commit records everything in one transaction: installations, categories,
// rules, profiles (order, separators, enabled, plugins, load order).
func (r *run) commit(ctx context.Context) error {
	now := r.s.Clock.Now()
	opID := r.t.ID()
	inst, def := r.env.inst, r.env.def
	keyID := map[string]mod.ID{}
	keep := map[string]bool{}
	for _, it := range r.items {
		keyID[it.src.Key] = it.id
		keep[it.src.Key] = true
	}
	var rulesAdded int
	err := r.s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		profiles, err := tx.Profiles().ListByInstance(ctx, inst.ID)
		if err != nil {
			return err
		}
		fresh := !slices.ContainsFunc(profiles, func(p *profile.Profile) bool { return len(p.Mods()) > 0 })
		cats, err := r.categories(ctx, tx)
		if err != nil {
			return err
		}
		for _, it := range r.items {
			m, err := tx.Mods().Get(ctx, it.id)
			if err != nil {
				return err
			}
			mt, ok := def.ModType(def.DetectModType(paths(it)))
			if !ok {
				mt, _ = def.ModType(game.DefaultModType)
			}
			if err := m.SetType(mt.ID, now); err != nil {
				return err
			}
			m.Attributes.Version = strings.TrimSpace(it.src.Version)
			m.Attributes.Author = strings.TrimSpace(it.src.Author)
			m.Attributes.Notes = strings.TrimSpace(it.src.Notes)
			if c := cats[it.src.Category]; c != "" {
				m.Category = c
			}
			files, err := filesOf(it, mt)
			if err != nil {
				return err
			}
			in, err := mod.NewInstallation(mod.InstallationID(r.s.IDs.NewID()), m.ID, inst.ID, Installer, nil, files, now)
			if err != nil {
				return err
			}
			m.Content = r.env.adapter.ContentFlags(inst.Game, in.ContentFootprint())
			if err := m.CompleteInstall(in, now); err != nil {
				return err
			}
			if err := tx.Installations().Save(ctx, in); err != nil {
				return err
			}
			if err := tx.Mods().Save(ctx, m); err != nil {
				return err
			}
			tx.Emit(r.s.newEvent(EventModInstalled, subjectMod, string(m.ID), opID, map[string]string{
				"name": m.DisplayName(), "installer": Installer, "installation": string(in.ID),
				"files": itoa(len(in.Files)), "type": string(m.Type), "manager": string(r.src.Manager),
			}))
		}
		set, err := tx.Rules().Get(ctx, inst.ID)
		if errors.Is(err, ports.ErrNotFound) {
			set, err = rules.New(inst.ID)
		}
		if err != nil {
			return err
		}
		if r.has(migration.PartRules) {
			if set, rulesAdded, err = r.addRules(set, keyID, keep); err != nil {
				return err
			}
			if err := tx.Rules().Save(ctx, set); err != nil {
				return err
			}
		}
		return r.applyProfiles(ctx, tx, profiles, fresh, keyID, keep, set.OrderEdges())
	})
	if err != nil {
		return err
	}
	r.committed = true
	_ = r.s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		tx.Emit(r.s.newEvent(EventManagerImported, subjectInstance, string(inst.ID), opID, map[string]string{
			"manager": string(r.src.Manager), "source": r.src.Name, "mods": itoa(len(r.items)),
			"skipped": itoa(len(r.skipped)), "profiles": itoa(len(r.chosen)), "rules": itoa(rulesAdded),
		}))
		return nil
	})
	return nil
}

// categories finds or creates, by name under the same parent, every
// category the imported mods use (only when the part was chosen).
func (r *run) categories(ctx context.Context, tx ports.Tx) (map[string]mod.CategoryID, error) {
	out := map[string]mod.CategoryID{}
	if !r.has(migration.PartCategories) {
		return out, nil
	}
	cats, err := tx.Categories().List(ctx, r.env.inst.ID)
	if err != nil && !errors.Is(err, ports.ErrNotFound) {
		return nil, err
	}
	byKey := map[string]migration.Category{}
	for _, c := range r.snap.Categories {
		byKey[c.Key] = c
	}
	var resolve func(key string, depth int) mod.CategoryID
	resolve = func(key string, depth int) mod.CategoryID {
		if id, ok := out[key]; ok || key == "" || depth > 16 {
			return id
		}
		c, ok := byKey[key]
		if !ok {
			return ""
		}
		parent := resolve(c.Parent, depth+1)
		name := strings.TrimSpace(c.Name)
		if i := slices.IndexFunc(cats, func(x mod.Category) bool { return x.Parent == parent && strings.EqualFold(x.Name, name) }); i >= 0 {
			out[key] = cats[i].ID
			return cats[i].ID
		}
		id := mod.CategoryID(r.s.IDs.NewID())
		cats = append(cats, mod.Category{ID: id, Instance: r.env.inst.ID, Name: name, Parent: parent, Order: len(cats)})
		out[key] = id
		return id
	}
	before := len(cats)
	for _, it := range r.items {
		resolve(it.src.Category, 0)
	}
	if len(cats) == before {
		return out, nil
	}
	if _, err := mod.NewCategoryTree(cats); err != nil {
		return nil, err
	}
	return out, tx.Categories().Replace(ctx, r.env.inst.ID, cats)
}

// addRules adds the rules among imported mods. A rule that would close a
// cycle is kept anyway, through Restore: the cycle becomes the blocking
// diagnostic it always is (D028), never a failed import.
func (r *run) addRules(set *rules.Set, keyID map[string]mod.ID, keep map[string]bool) (*rules.Set, int, error) {
	t := r.s.Clock.Now()
	added := 0
	var cyclic []rules.OrderRule
	for _, ru := range r.snap.RulesAmong(keep) {
		a, b := keyID[ru.Mod], keyID[ru.Other]
		id := rules.ID(r.s.IDs.NewID())
		var err error
		switch ru.Kind {
		case migration.RuleAfter:
			or := rules.OrderRule{ID: id, Before: b, After: a, Source: rules.SourceImport, CreatedAt: t}
			if err = set.AddOrderRule(or); errors.Is(err, rules.ErrCycle) {
				cyclic, err = append(cyclic, or), nil
			}
		case migration.RuleRequires, migration.RuleRecommends:
			kind := rules.Requires
			if ru.Kind == migration.RuleRecommends {
				kind = rules.Recommends
			}
			err = set.AddDependency(rules.DependencyRule{ID: id, Mod: a, Target: b, Kind: kind, Source: rules.SourceImport, CreatedAt: t})
		case migration.RuleConflicts:
			err = set.AddIncompatibility(rules.IncompatibilityRule{ID: id, A: a, B: b, Source: rules.SourceImport, CreatedAt: t})
		default:
			continue
		}
		switch {
		case errors.Is(err, rules.ErrDuplicate):
			continue
		case err != nil:
			return nil, 0, err
		}
		added++
	}
	if len(cyclic) > 0 {
		d := set.Data()
		d.Order = append(d.Order, cyclic...)
		next, err := rules.Restore(d)
		if err != nil {
			return nil, 0, err
		}
		set = next
	}
	return set, added, nil
}

// applyProfiles gives every imported mod its entry in every profile. Each
// chosen profile of the other manager goes into a profile of the same name
// when the library was empty (the instance's "Default" receives MO2's
// "Default"), or into a new profile; it brings the order, separators and
// enabled state, and the plugins and load order when the instance has
// them. Other profiles get the mods disabled at the end. The order rules
// are then applied (INV-ORD-03); a cycle keeps the order.
func (r *run) applyProfiles(ctx context.Context, tx ports.Tx, profiles []*profile.Profile, fresh bool, keyID map[string]mod.ID, keep map[string]bool, edges []ordering.Edge) error {
	now := r.s.Clock.Now()
	inst := r.env.inst
	active, err := tx.Profiles().Active(ctx, inst.ID)
	if err != nil {
		return err
	}
	var base *profile.Profile
	for _, p := range profiles {
		if p.ID() == active {
			base = p
		}
	}
	if base == nil && len(profiles) > 0 {
		base = profiles[0]
	}
	// New profiles start from the order as it was before the import: the
	// chosen profiles fill in below.
	if base != nil {
		if base, err = profile.Restore(base.Data()); err != nil {
			return err
		}
	}
	targets := map[profile.ID]bool{}
	var activate *profile.Profile
	for _, fp := range r.chosen {
		var target *profile.Profile
		if fresh {
			for _, p := range profiles {
				if !targets[p.ID()] && strings.EqualFold(p.Name(), fp.Name) {
					target = p
				}
			}
		}
		if target == nil {
			name := uniqueName(profiles, fp.Name)
			if base != nil {
				target, err = profile.NewFromOrder(profile.ID(r.s.IDs.NewID()), name, base, now)
			} else {
				target, err = profile.New(profile.ID(r.s.IDs.NewID()), inst.ID, name, now)
			}
			if err != nil {
				return err
			}
			profiles = append(profiles, target)
		}
		targets[target.ID()] = true
		order := fp
		if !r.has(migration.PartOrder) {
			order.Order = nil
		}
		for _, e := range r.snap.Entries(order, keep, r.has(migration.PartOrder)) {
			if e.Separator != "" {
				sep := profile.Separator{ID: profile.SeparatorID(r.s.IDs.NewID()), Label: e.Separator}
				if err := target.AddSeparator(sep, len(target.Order()), now); err != nil {
					return err
				}
				continue
			}
			if err := target.AddMod(keyID[e.Mod], fp.Enabled[e.Mod], now); err != nil {
				return err
			}
		}
		// Plugin states and the load order go to the plugins section of
		// the profile (D133).
		sec, err := plugin.StateOf(target)
		if err != nil {
			return err
		}
		touched := false
		if r.has(migration.PartPlugins) {
			for _, ps := range fp.Plugins {
				if err := sec.SetEnabled(plugin.Name(ps.Name), ps.Enabled); err != nil {
					return err
				}
				touched = true
			}
		}
		if r.has(migration.PartLoadOrder) && fp.LoadOrder != nil {
			var lo []plugin.Name
			seen := map[string]bool{}
			for _, n := range fp.LoadOrder {
				if k := strings.ToLower(strings.TrimSpace(n)); k != "" && !seen[k] {
					seen[k] = true
					lo = append(lo, plugin.Name(strings.TrimSpace(n)))
				}
			}
			if err := sec.SetLoadOrder(lo); err != nil {
				return err
			}
			for n, i := range fp.Locks {
				_ = sec.SetIndexLock(plugin.Name(n), i)
			}
			touched = true
		}
		if touched {
			if err := sec.Store(target, now); err != nil {
				return err
			}
		}
		if activate == nil || fp.Active {
			activate = target
		}
	}
	for _, p := range profiles {
		if !targets[p.ID()] {
			for _, it := range r.items {
				if _, ok := p.ModState(it.id); !ok {
					if err := p.AddMod(it.id, false, now); err != nil {
						return err
					}
				}
			}
		}
		if _, err := p.Reorder(edges, now); err != nil && !errors.Is(err, ordering.ErrCycle) {
			return err
		}
		if err := tx.Profiles().Save(ctx, p); err != nil {
			return err
		}
	}
	// A fresh library starts on the profile the other manager was using;
	// an instance already in use keeps its active profile.
	if fresh && activate != nil && activate.ID() != active {
		if err := tx.Profiles().SetActive(ctx, inst.ID, activate.ID()); err != nil {
			return err
		}
		activate.MarkActivated(now)
		if err := tx.Profiles().Save(ctx, activate); err != nil {
			return err
		}
		tx.Emit(r.s.newEvent(profilesvc.EventProfileActivated, "profile", string(activate.ID()), r.t.ID(), map[string]string{
			"name": activate.Name(), "previous": string(active), "instance": string(inst.ID),
		}))
	}
	return nil
}

func uniqueName(profiles []*profile.Profile, name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "Default"
	}
	taken := func(n string) bool {
		return slices.ContainsFunc(profiles, func(p *profile.Profile) bool { return strings.EqualFold(p.Name(), n) })
	}
	if !taken(name) {
		return name
	}
	for i := 2; ; i++ {
		if n := name + " (" + itoa(i) + ")"; !taken(n) {
			return n
		}
	}
}

// abort undoes an import that did not reach its commit.
func (r *run) abort(ctx context.Context) {
	if r.committed {
		return
	}
	if len(r.created) > 0 {
		_ = r.s.discard(ctx, r.env.inst, r.created)
		return
	}
	for _, it := range r.items {
		if it.id != "" {
			_ = r.s.FS.RemoveAll(ctx, game.JoinPath(r.env.inst.Staging, string(it.id))+".installing")
		}
	}
}

func parentDir(p string) string {
	i := strings.LastIndexAny(p, `\/`)
	if i <= 0 {
		return p
	}
	return p[:i]
}
