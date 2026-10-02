package plugins

import (
	"context"
	"errors"
	"slices"
	"strconv"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/core/domain/profile"
	"modorchestrator/internal/core/domain/rules"
)

// mutation is what a command changes in the profile and in the plugin
// rules of an instance; persist saves it with the events in one
// transaction (INV-OPS-01).
type mutation struct {
	st *state
	// order is the new load order (nil keeps the arranged one).
	order []plugin.Name
	// states are plugin states to record.
	states map[plugin.Name]bool
	locks  map[plugin.Name]int
	rules  bool
	events []event.Event
	// snapshot is taken (before the change) when set.
	snapshot profile.SnapshotReason
}

// persist records the arrangement of the inventory (new plugins, removed
// ones, default states) together with the command's own change. A
// command is always applied over the current inventory, so the stored
// load order never lags behind it.
func (s *Service) persist(ctx context.Context, m mutation) (changed bool, err error) {
	st := m.st
	a := st.arrange(st.settings.autoSort)
	if m.order == nil {
		m.order = a.order
	}
	before := st.profile.Data()
	err = s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		p, err := tx.Profiles().Get(ctx, st.profile.ID())
		if err != nil {
			return err
		}
		now := s.Clock.Now()
		if m.snapshot != "" {
			snap := profile.Snapshot{ID: profile.SnapshotID(s.IDs.NewID()), Profile: p.ID(), Reason: m.snapshot, CreatedAt: now, State: before}
			if err := tx.Profiles().SaveSnapshot(ctx, snap); err != nil {
				return err
			}
		}
		for _, pl := range st.inv {
			if pl.Implicit {
				continue
			}
			if _, known := p.PluginEnabled(pl.Name); !known {
				if err := p.SetPluginEnabled(pl.Name, st.enabled(pl), now); err != nil {
					return err
				}
				changed = true
			}
		}
		for n, on := range m.states {
			if cur, known := p.PluginEnabled(n); !known || cur != on {
				changed = true
			}
			if err := p.SetPluginEnabled(n, on, now); err != nil {
				return err
			}
		}
		for n, i := range m.locks {
			if err := p.SetIndexLock(n, i, now); err != nil {
				return fail(CodeIndexLockConflict, err, "plugin", string(n))
			}
			changed = true
		}
		if !slices.Equal(p.LoadOrder(), m.order) {
			if err := p.SetLoadOrder(m.order, now); err != nil {
				return err
			}
			changed = true
			if len(a.added) > 0 || len(a.removed) > 0 {
				tx.Emit(s.newEvent(EventInventoryChanged, subjectProfile, string(p.ID()), map[string]string{
					"instance": string(st.inst.ID), "added": strconv.Itoa(len(a.added)), "removed": strconv.Itoa(len(a.removed)),
				}))
			}
		}
		if changed || len(m.events) > 0 || m.rules {
			if err := tx.Profiles().Save(ctx, p); err != nil {
				return err
			}
		}
		if m.rules {
			if err := tx.PluginRules().Save(ctx, st.rules); err != nil {
				return err
			}
			changed = true
		}
		tx.Emit(m.events...)
		return nil
	})
	if err == nil && changed {
		s.bg.applyLater(st.inst.ID)
	}
	return changed, err
}

// lock takes the instance lock for a short command (D038).
func (s *Service) lock(instance game.InstanceID) (func(), error) {
	return s.Locks.Acquire(instance, holderPlugins)
}

// command runs fn with the instance locked and the state loaded.
func (s *Service) command(ctx context.Context, instance game.InstanceID, fn func(st *state) error) error {
	release, err := s.lock(instance)
	if err != nil {
		return err
	}
	defer release()
	st, err := s.load(ctx, instance)
	if err != nil {
		return err
	}
	return fn(st)
}

// Sync records the arrangement of the current inventory in the active
// profile (new plugins placed and given their default state, removed ones
// taken out of the order). Background sync and the deploy call it; it
// writes nothing when nothing changed.
func (s *Service) Sync(ctx context.Context, instance game.InstanceID) error {
	return s.command(ctx, instance, func(st *state) error { return s.syncLocked(ctx, st) })
}

func (s *Service) syncLocked(ctx context.Context, st *state) error {
	a := st.arrange(st.settings.autoSort)
	m := mutation{st: st}
	if a.sorted && len(a.moves) > 0 {
		m.events = append(m.events, s.newEvent(EventSorted, subjectProfile, string(st.profile.ID()), map[string]string{
			"instance": string(st.inst.ID), "moved": strconv.Itoa(len(a.moves)), "auto": "true",
		}))
		s.rememberSort(ctx, st, a.before)
	}
	_, err := s.persist(ctx, m)
	return err
}

// SetPluginsEnabled activates or deactivates plugins in the active
// profile. Implicit plugins are always active (core/12 §5).
func (s *Service) SetPluginsEnabled(ctx context.Context, instance game.InstanceID, names []plugin.Name, enabled bool) error {
	return s.command(ctx, instance, func(st *state) error {
		m := mutation{st: st, states: map[plugin.Name]bool{}}
		for _, n := range names {
			p, err := st.mustPlugin(n)
			if err != nil {
				return err
			}
			if p.Implicit {
				if enabled {
					continue
				}
				return fail(CodeImplicitPlugin, nil, "plugin", string(p.Name))
			}
			if st.enabled(p) == enabled {
				if _, known := st.profile.PluginEnabled(p.Name); known {
					continue
				}
			}
			m.states[p.Name] = enabled
		}
		if len(m.states) == 0 {
			return nil
		}
		t := EventPluginDisabled
		if enabled {
			t = EventPluginEnabled
		}
		var list []string
		for n := range m.states {
			list = append(list, string(n))
		}
		slices.Sort(list)
		m.events = append(m.events, s.newEvent(t, subjectProfile, string(st.profile.ID()), map[string]string{
			"instance": string(instance), "count": strconv.Itoa(len(list)), "plugin": list[0], "plugins": strings.Join(list, "\n"),
		}))
		_, err := s.persist(ctx, m)
		return err
	})
}

// SortResult is what "Ordenar agora" did.
type SortResult struct {
	Moved int
	Moves []MoveView
}

// SortPlugins is "Ordenar agora" (core/08 §5): every constraint, minimal
// movement from the current order. A large sort takes a snapshot first
// (core/07 §6); a cycle refuses the sort and the order stays.
func (s *Service) SortPlugins(ctx context.Context, instance game.InstanceID) (SortResult, error) {
	var out SortResult
	err := s.command(ctx, instance, func(st *state) error {
		a := st.arrange(true)
		if a.cycle != nil {
			return fail(CodeSortBlocked, &ordering.CycleError{Cycle: *a.cycle}, cycleParams(*a.cycle)...)
		}
		out = SortResult{Moved: len(a.moves), Moves: st.moveViews(a.moves)}
		m := mutation{st: st, order: a.order}
		if len(a.moves) > 0 {
			if len(a.moves) > s.intSetting(ctx, "order.snapshotMoveThreshold", 20) {
				m.snapshot = profile.SnapshotSort
			}
			m.events = append(m.events, s.newEvent(EventSorted, subjectProfile, string(st.profile.ID()), map[string]string{
				"instance": string(instance), "moved": strconv.Itoa(len(a.moves)),
			}))
			s.rememberSort(ctx, st, a.before)
		}
		_, err := s.persist(ctx, m)
		return err
	})
	return out, err
}

const stateLastSort = "plugins.lastSort."

// rememberSort keeps the order before a sort for "Desfazer última
// ordenação" (presentation convenience, not domain state).
func (s *Service) rememberSort(ctx context.Context, st *state, before []plugin.Name) {
	names := make([]string, len(before))
	for i, n := range before {
		names[i] = string(n)
	}
	_ = s.State.Set(ctx, stateLastSort+string(st.profile.ID()), strings.Join(names, "\n"))
}

// UndoLastSort puts back the order before the last sort of the active
// profile, through the engine (only hard constraints): plugins that
// appeared since then are placed again.
func (s *Service) UndoLastSort(ctx context.Context, instance game.InstanceID) error {
	return s.command(ctx, instance, func(st *state) error {
		key := stateLastSort + string(st.profile.ID())
		raw, err := s.State.Get(ctx, key)
		if errors.Is(err, ports.ErrNotFound) || raw == "" {
			return fail(CodeNothingToUndo, nil)
		}
		if err != nil {
			return err
		}
		var prev []plugin.Name
		for _, n := range strings.Split(raw, "\n") {
			prev = append(prev, plugin.Name(n))
		}
		merged, _, _ := plugin.Merge(prev, st.names())
		res, err := plugin.Settle(merged, st.constraints(true))
		if err != nil {
			return fail(CodeOrderViolates, err)
		}
		m := mutation{st: st, order: res.Order}
		m.events = append(m.events, s.newEvent(EventOrderChanged, subjectProfile, string(st.profile.ID()), map[string]string{
			"instance": string(instance), "reason": "undo_sort",
		}))
		if _, err := s.persist(ctx, m); err != nil {
			return err
		}
		return s.State.Delete(ctx, key)
	})
}

// SetAutoSort turns plugins.autoSort on or off for the instance; turning
// it on sorts at once.
func (s *Service) SetAutoSort(ctx context.Context, instance game.InstanceID, on bool) error {
	if err := s.Settings.SetInstance(ctx, string(instance), "plugins.autoSort", strconv.FormatBool(on)); err != nil {
		return err
	}
	if on {
		return s.Sync(ctx, instance)
	}
	return nil
}

// MoveResult answers a manual move: applied, or refused with the broken
// constraints and the nearest valid position (core/05 §4 UX). Nearest is
// the index to move to again (-1 when no position is valid).
type MoveResult struct {
	Applied  bool
	Violated []ReasonView
	Nearest  int
}

// MovePlugins moves a block of plugins so the first lands at index of the
// load order (core/08 §5). It is refused when it breaks a constraint, a
// plugin is fixed or locked, or the adapter does not allow manual order.
func (s *Service) MovePlugins(ctx context.Context, instance game.InstanceID, names []plugin.Name, index int) (MoveResult, error) {
	var out MoveResult
	err := s.command(ctx, instance, func(st *state) error {
		if st.lo != nil && !st.lo.ManualOrder(st.inst.Game) {
			return fail(CodeManualOrderDisabled, nil)
		}
		a := st.arrange(false)
		var block []plugin.Name
		for _, n := range names {
			p, err := st.mustPlugin(n)
			if err != nil {
				return err
			}
			block = append(block, p.Name)
		}
		pl, err := plugin.Place(a.order, block, index, st.constraints(true))
		if errors.Is(err, plugin.ErrLocked) {
			return fail(CodeIndexLockConflict, err, "plugin", string(block[0]))
		}
		if err != nil {
			return err
		}
		if !pl.Valid() {
			out = MoveResult{Violated: st.reasonViews(pl.Violated), Nearest: pl.NearestIndex}
			return nil
		}
		out.Applied = true
		m := mutation{st: st, order: pl.Order}
		m.events = append(m.events, s.newEvent(EventOrderChanged, subjectProfile, string(st.profile.ID()), map[string]string{
			"instance": string(instance), "reason": "move", "plugin": string(block[0]), "count": strconv.Itoa(len(block)),
		}))
		_, err = s.persist(ctx, m)
		return err
	})
	return out, err
}

// SetIndexLock pins plugins at their current position, or releases them
// (core/08 §3, IndexLock).
func (s *Service) SetIndexLock(ctx context.Context, instance game.InstanceID, names []plugin.Name, locked bool) error {
	return s.command(ctx, instance, func(st *state) error {
		a := st.arrange(false)
		m := mutation{st: st, order: a.order, locks: map[plugin.Name]int{}}
		for _, n := range names {
			p, err := st.mustPlugin(n)
			if err != nil {
				return err
			}
			if p.Implicit {
				return fail(CodeImplicitPlugin, nil, "plugin", string(p.Name))
			}
			idx := -1
			if locked {
				idx = slices.IndexFunc(a.order, func(o plugin.Name) bool { return o.Key() == p.Name.Key() })
			}
			m.locks[p.Name] = idx
		}
		m.events = append(m.events, s.newEvent(EventLocked, subjectProfile, string(st.profile.ID()), map[string]string{
			"instance": string(instance), "locked": strconv.FormatBool(locked), "plugin": string(names[0]), "count": strconv.Itoa(len(names)),
		}))
		_, err := s.persist(ctx, m)
		return err
	})
}

// check is the context of a rule change: the inventory and the hard
// constraints (INV-ORD-04 against masters too).
func (st *state) check() plugin.Check { return plugin.Check{Known: st.names(), Hard: st.hard} }

func ruleError(err error) error {
	var ce *ordering.CycleError
	switch {
	case err == nil:
		return nil
	case errors.As(err, &ce):
		return fail(CodeRuleCycle, err, cycleParams(ce.Cycle)...)
	case errors.Is(err, plugin.ErrDuplicate):
		return fail(CodeRuleDuplicate, err)
	case errors.Is(err, plugin.ErrNotFound):
		return fail(CodeRuleNotFound, err)
	case errors.Is(err, plugin.ErrInvalid):
		return fail(CodeGroupInvalid, err)
	}
	return err
}

// CreatePluginRule stores "p loads after q" (core/08 §6), refusing a
// cycle with the other rules, the groups and the masters (D028).
func (s *Service) CreatePluginRule(ctx context.Context, instance game.InstanceID, p, after plugin.Name) error {
	if p.Key() == after.Key() {
		return fail(CodeRuleSelf, nil, "plugin", string(p))
	}
	return s.command(ctx, instance, func(st *state) error {
		rule := plugin.Rule{ID: plugin.RuleID(s.IDs.NewID()), Plugin: p, After: after, Source: rules.SourceUser, CreatedAt: s.Clock.Now()}
		if pl, ok := st.plugin(p); ok {
			rule.Plugin = pl.Name
		}
		if pl, ok := st.plugin(after); ok {
			rule.After = pl.Name
		}
		if err := st.rules.AddRule(rule, st.check()); err != nil {
			return ruleError(err)
		}
		_, err := s.persist(ctx, mutation{st: st, rules: true, events: []event.Event{s.newEvent(EventRuleCreated, subjectInstance, string(instance), map[string]string{
			"instance": string(instance), "rule": string(rule.ID), "plugin": string(rule.Plugin), "after": string(rule.After),
		})}})
		return err
	})
}

// RemovePluginRule deletes a user rule.
func (s *Service) RemovePluginRule(ctx context.Context, instance game.InstanceID, id plugin.RuleID) error {
	return s.command(ctx, instance, func(st *state) error {
		r, ok := st.rules.Rule(id)
		if !ok {
			return fail(CodeRuleNotFound, nil, "rule", string(id))
		}
		if err := st.rules.RemoveRule(id); err != nil {
			return fail(CodeRuleNotRemovable, err)
		}
		_, err := s.persist(ctx, mutation{st: st, rules: true, events: []event.Event{s.newEvent(EventRuleRemoved, subjectInstance, string(instance), map[string]string{
			"instance": string(instance), "rule": string(id), "plugin": string(r.Plugin), "after": string(r.After),
		})}})
		return err
	})
}

// SaveGroup creates (create=true) or updates a group: name and the groups
// it loads after (core/08 §6). A cycle is refused with the cycle.
func (s *Service) SaveGroup(ctx context.Context, instance game.InstanceID, name string, after []string, create bool) error {
	name = strings.TrimSpace(name)
	return s.command(ctx, instance, func(st *state) error {
		exists := st.rules.HasGroup(name)
		switch {
		case name == "":
			return fail(CodeGroupInvalid, nil)
		case create && exists:
			return fail(CodeGroupExists, nil, "group", name)
		case !create && !exists:
			return fail(CodeGroupNotFound, nil, "group", name)
		}
		for _, a := range after {
			if !st.rules.HasGroup(a) && a != name {
				return fail(CodeGroupNotFound, nil, "group", a)
			}
		}
		if err := st.rules.SetGroup(plugin.Group{Name: name, After: after}, st.check()); err != nil {
			return ruleError(err)
		}
		t := EventGroupUpdated
		if create {
			t = EventGroupCreated
		}
		_, err := s.persist(ctx, mutation{st: st, rules: true, events: []event.Event{s.newEvent(t, subjectInstance, string(instance), map[string]string{
			"instance": string(instance), "group": name, "after": strings.Join(after, "\n"),
		})}})
		return err
	})
}

// DeleteGroup removes a group; its plugins return to the default group.
func (s *Service) DeleteGroup(ctx context.Context, instance game.InstanceID, name string) error {
	return s.command(ctx, instance, func(st *state) error {
		if err := st.rules.DeleteGroup(name); err != nil {
			if errors.Is(err, plugin.ErrNotFound) {
				return fail(CodeGroupNotFound, err, "group", name)
			}
			return fail(CodeGroupInvalid, err, "group", name)
		}
		_, err := s.persist(ctx, mutation{st: st, rules: true, events: []event.Event{s.newEvent(EventGroupDeleted, subjectInstance, string(instance), map[string]string{
			"instance": string(instance), "group": name,
		})}})
		return err
	})
}

// SetPluginGroup assigns plugins to a group (DefaultGroup clears it).
func (s *Service) SetPluginGroup(ctx context.Context, instance game.InstanceID, names []plugin.Name, group string) error {
	return s.command(ctx, instance, func(st *state) error {
		if !st.rules.HasGroup(group) {
			return fail(CodeGroupNotFound, nil, "group", group)
		}
		for _, n := range names {
			p, err := st.mustPlugin(n)
			if err != nil {
				return err
			}
			if err := st.rules.Assign(p.Name, group, st.check()); err != nil {
				return ruleError(err)
			}
		}
		_, err := s.persist(ctx, mutation{st: st, rules: true, events: []event.Event{s.newEvent(EventGroupAssigned, subjectInstance, string(instance), map[string]string{
			"instance": string(instance), "group": group, "plugin": string(names[0]), "count": strconv.Itoa(len(names)),
		})}})
		return err
	})
}

// RebuildHeaderCache empties the header cache (Settings › Workarounds,
// core/13); headers are read again on the next query.
func (s *Service) RebuildHeaderCache(context.Context) error {
	if s.Cache == nil {
		return nil
	}
	return s.Cache.Clear()
}
