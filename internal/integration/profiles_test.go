package integration_test

import (
	"errors"
	"slices"
	"strconv"
	"testing"

	profilesvc "modorchestrator/internal/core/application/profiles"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/profile"
)

// installMods imports one small mod per name and returns their ids in
// install order (lowest priority first).
func (e *env) installMods(names ...string) []mod.ID {
	e.t.Helper()
	var paths []string
	for _, n := range names {
		paths = append(paths, e.zipFile(n+".zip", "textures/"+n+".dds", n))
	}
	e.importAndWait(paths...)
	byName := map[string]mod.ID{}
	for _, r := range e.rows() {
		byName[r.Name] = r.ID
	}
	out := make([]mod.ID, len(names))
	for i, n := range names {
		if out[i] = byName[n]; out[i] == "" {
			e.t.Fatalf("mod %s not installed", n)
		}
	}
	return out
}

func (e *env) active() *profile.Profile {
	e.t.Helper()
	id, err := e.profiles.Active(ctx, e.inst.ID)
	if err != nil {
		e.t.Fatal(err)
	}
	p, err := e.profiles.Get(ctx, id)
	if err != nil {
		e.t.Fatal(err)
	}
	return p
}

func (e *env) profile(id profile.ID) *profile.Profile {
	e.t.Helper()
	p, err := e.profiles.Get(ctx, id)
	if err != nil {
		e.t.Fatal(err)
	}
	return p
}

// checkOrderInvariants asserts INV-ORD-01/02/03 over every profile.
func (e *env) checkOrderInvariants() {
	e.t.Helper()
	list, err := e.profiles.ListByInstance(ctx, e.inst.ID)
	if err != nil || len(list) == 0 {
		e.t.Fatalf("INV-ORD-01: instance without profiles (%v)", err)
	}
	active, err := e.profiles.Active(ctx, e.inst.ID)
	if err != nil || !slices.ContainsFunc(list, func(p *profile.Profile) bool { return p.ID() == active }) {
		e.t.Fatalf("INV-ORD-01: no valid active profile (%v)", err)
	}
	var installed []mod.ID
	for _, r := range e.rows() {
		if r.State == mod.StateInstalled {
			installed = append(installed, r.ID)
		}
	}
	slices.Sort(installed)
	set, _ := e.rules.Get(ctx, e.inst.ID)
	for _, p := range list {
		got := p.Mods()
		slices.Sort(got)
		if !slices.Equal(got, installed) {
			e.t.Fatalf("INV-ORD-02: profile %s has %v, installed %v", p.Name(), got, installed)
		}
		if set != nil {
			if v := p.Violations(set.OrderEdges()); len(v) > 0 {
				e.t.Fatalf("INV-ORD-03: profile %s breaks %v", p.Name(), v)
			}
		}
	}
}

func codeOf(err error) string {
	var coded interface{ Code() string }
	if errors.As(err, &coded) {
		return coded.Code()
	}
	return ""
}

// INV-ORD-01, D037: the active and the last profile cannot be deleted.
func TestProfileLifecycle(t *testing.T) {
	e := newEnv(t)
	ids := e.installMods("A", "B")
	def := e.active()
	if err := e.prof.Delete(ctx, def.ID()); codeOf(err) != profilesvc.CodeProfileIsActive {
		t.Fatalf("deleting the active profile: %v", err)
	}
	empty, err := e.prof.Create(ctx, e.inst.ID, "Survival", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.prof.Create(ctx, e.inst.ID, "survival", ""); codeOf(err) != profilesvc.CodeProfileNameTaken {
		t.Fatalf("name taken: %v", err)
	}
	p := e.profile(empty)
	if len(p.EnabledMods()) != 0 || !slices.Equal(p.Mods(), ids) {
		t.Fatalf("empty profile: enabled %v order %v", p.EnabledMods(), p.Mods())
	}
	if err := e.prof.Activate(ctx, empty); err != nil {
		t.Fatal(err)
	}
	if e.active().ID() != empty {
		t.Fatal("not activated")
	}
	if err := e.prof.Delete(ctx, def.ID()); err != nil {
		t.Fatal(err)
	}
	if err := e.prof.Delete(ctx, empty); codeOf(err) != profilesvc.CodeProfileIsActive {
		t.Fatalf("deleting the last (active) profile: %v", err)
	}
	if err := e.prof.Rename(ctx, empty, "Main"); err != nil || e.active().Name() != "Main" {
		t.Fatalf("rename: %v", err)
	}
	e.checkOrderInvariants()
}

// core/07 §10: a rule created in a clone appears in the original (D026);
// a mod installed later reaches every profile (INV-ORD-02).
func TestCloneSharesRulesAndInstallReachesEveryProfile(t *testing.T) {
	e := newEnv(t)
	ids := e.installMods("A", "B")
	clone, err := e.prof.Create(ctx, e.inst.ID, "Clone", e.active().ID())
	if err != nil {
		t.Fatal(err)
	}
	if err := e.prof.Activate(ctx, clone); err != nil {
		t.Fatal(err)
	}
	if _, err := e.prof.CreateOrderRule(ctx, e.inst.ID, ids[1], ids[0]); err != nil {
		t.Fatal(err)
	}
	rules, err := e.prof.RuleList(ctx, e.inst.ID)
	if err != nil || len(rules) != 1 {
		t.Fatalf("rules = %v, %v", rules, err)
	}
	c := e.installMods("C")[0]
	e.checkOrderInvariants()
	if !e.active().IsEnabled(c) || e.profile(e.firstOther()).IsEnabled(c) {
		t.Fatal("a new mod is enabled only in the active profile (D066)")
	}
}

// core/05 §9: "B vence A" with B already above changes nothing; with B
// below, only one mod moves and the reason is recorded; a cycle is refused.
func TestOrderRulesMoveTheMinimumAndRefuseCycles(t *testing.T) {
	e := newEnv(t)
	ids := e.installMods("A", "B", "C", "D")
	a, b, c, d := ids[0], ids[1], ids[2], ids[3]
	if _, err := e.prof.CreateOrderRule(ctx, e.inst.ID, b, a); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(e.active().Mods(), ids) {
		t.Fatal("a rule already satisfied must not move anything")
	}
	prev, err := e.prof.PreviewOrderRule(ctx, e.inst.ID, a, d)
	if err != nil || len(prev.Cycle) != 0 || len(prev.Profiles) != 1 || len(prev.Profiles[0].Moves) != 1 {
		t.Fatalf("preview = %+v, %v", prev, err)
	}
	e.events = nil
	if _, err := e.prof.CreateOrderRule(ctx, e.inst.ID, a, d); err != nil {
		t.Fatal(err)
	}
	before, after := ids, e.active().Mods()
	if profile.Displacement(entries(before), entries(after)) != 1 {
		t.Fatalf("more than one mod moved: %v -> %v", before, after)
	}
	if !slices.ContainsFunc(e.events, func(ev event.Event) bool {
		p, _ := ev.Payload.(map[string]string)
		return ev.Type == profilesvc.EventOrderChanged && p["reason"] == profilesvc.ReasonRule
	}) {
		t.Fatal("order.changed with the rule as reason expected")
	}
	// b wins a, a wins d; now d wins b closes d < a < b < d... refused.
	_, err = e.prof.CreateOrderRule(ctx, e.inst.ID, d, b)
	if codeOf(err) != profilesvc.CodeRuleCycle {
		t.Fatalf("cycle: %v", err)
	}
	var coded interface{ Params() map[string]string }
	if !errors.As(err, &coded) || coded.Params()["cycle"] == "" {
		t.Fatal("the refusal names the cycle")
	}
	prev, _ = e.prof.PreviewOrderRule(ctx, e.inst.ID, d, b)
	if len(prev.Cycle) != 4 || prev.Cycle[0].ID != prev.Cycle[3].ID {
		t.Fatalf("preview cycle = %+v", prev.Cycle)
	}
	if _, err := e.prof.CreateOrderRule(ctx, e.inst.ID, c, c); codeOf(err) != profilesvc.CodeRuleSelf {
		t.Fatalf("self rule: %v", err)
	}
	if _, err := e.prof.CreateOrderRule(ctx, e.inst.ID, b, a); codeOf(err) != profilesvc.CodeRuleDuplicate {
		t.Fatalf("duplicate: %v", err)
	}
	e.checkOrderInvariants()
}

func entries(ids []mod.ID) []profile.Entry {
	out := make([]profile.Entry, len(ids))
	for i, id := range ids {
		out[i] = profile.Entry{Mod: id}
	}
	return out
}

// core/05 §4: a move that breaks a rule is refused with alternatives and
// nothing changes; the alternatives are explicit commands.
func TestMoveRefusedWithAlternatives(t *testing.T) {
	e := newEnv(t)
	ids := e.installMods("A", "B", "C")
	a, b, c := ids[0], ids[1], ids[2]
	if _, err := e.prof.CreateOrderRule(ctx, e.inst.ID, b, a); err != nil {
		t.Fatal(err)
	}
	move := []profile.Entry{{Mod: b}}
	res, err := e.prof.MoveMods(ctx, e.inst.ID, move, profile.Anchor{Kind: profile.AnchorTop}, profilesvc.MoveExact)
	if err != nil || res.Applied || len(res.Violated) != 1 || !res.HasNearest || res.NearestPriority != 2 {
		t.Fatalf("refusal = %+v, %v", res, err)
	}
	if !slices.Equal(e.active().Mods(), ids) {
		t.Fatal("a refused move changes nothing")
	}
	res, _ = e.prof.MoveMods(ctx, e.inst.ID, []profile.Entry{{Mod: c}}, profile.Anchor{Kind: profile.AnchorTop}, profilesvc.MoveExact)
	if !res.Applied || !slices.Equal(e.active().Mods(), []mod.ID{c, a, b}) {
		t.Fatalf("valid move: %+v %v", res, e.active().Mods())
	}
	res, _ = e.prof.MoveMods(ctx, e.inst.ID, move, profile.Anchor{Kind: profile.AnchorTop}, profilesvc.MoveNearest)
	if !res.Applied || !slices.Equal(e.active().Mods(), []mod.ID{c, a, b}) {
		t.Fatalf("nearest: %v", e.active().Mods())
	}
	res, _ = e.prof.MoveMods(ctx, e.inst.ID, move, profile.Anchor{Kind: profile.AnchorTop}, profilesvc.MoveRemoveRules)
	if !res.Applied || !slices.Equal(e.active().Mods(), []mod.ID{b, c, a}) {
		t.Fatalf("remove rules: %v", e.active().Mods())
	}
	if rules, _ := e.prof.RuleList(ctx, e.inst.ID); len(rules) != 0 {
		t.Fatalf("the violated user rule is removed: %v", rules)
	}
	e.checkOrderInvariants()
}

// ui/02 F-04: Ctrl+Z reverts the latest order change through history; the
// revert is a new entry and repeated undos keep going back.
func TestUndoOrderChanges(t *testing.T) {
	e := newEnv(t)
	ids := e.installMods("A", "B", "C")
	a, b, c := ids[0], ids[1], ids[2]
	if err := e.prof.UndoOrderChange(ctx, e.inst.ID); codeOf(err) != profilesvc.CodeNothingToUndo {
		t.Fatalf("nothing to undo: %v", err)
	}
	mustMove := func(m mod.ID, k profile.AnchorKind) {
		t.Helper()
		if res, err := e.prof.MoveMods(ctx, e.inst.ID, []profile.Entry{{Mod: m}}, profile.Anchor{Kind: k}, profilesvc.MoveExact); err != nil || !res.Applied {
			t.Fatalf("move: %+v %v", res, err)
		}
	}
	mustMove(c, profile.AnchorTop)    // c a b
	mustMove(a, profile.AnchorBottom) // c b a
	if err := e.prof.UndoOrderChange(ctx, e.inst.ID); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(e.active().Mods(), []mod.ID{c, a, b}) {
		t.Fatalf("first undo: %v", e.active().Mods())
	}
	if err := e.prof.UndoOrderChange(ctx, e.inst.ID); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(e.active().Mods(), []mod.ID{a, b, c}) {
		t.Fatalf("second undo: %v", e.active().Mods())
	}
	hist, _ := e.prof.OrderHistory(ctx, e.inst.ID)
	if len(hist) != 4 || hist[0].RevertOf == "" {
		t.Fatalf("history = %+v", hist)
	}
	// A rule created after a change makes reverting it break the rule.
	mustMove(c, profile.AnchorTop) // c a b
	if _, err := e.prof.CreateOrderRule(ctx, e.inst.ID, c, a); err != nil {
		t.Fatal(err)
	}
	e.checkOrderInvariants()
}

// core/07 §10: restoring a snapshot gives back exactly selection and order;
// transfer copies the selection after a snapshot of the destination.
func TestSnapshotsAndTransfer(t *testing.T) {
	e := newEnv(t)
	ids := e.installMods("A", "B", "C")
	p := e.active()
	snap, err := e.prof.CreateSnapshot(ctx, p.ID())
	if err != nil {
		t.Fatal(err)
	}
	saved := p.Data()
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids[:2], false); err != nil {
		t.Fatal(err)
	}
	_, _ = e.prof.MoveMods(ctx, e.inst.ID, []profile.Entry{{Mod: ids[2]}}, profile.Anchor{Kind: profile.AnchorTop}, profilesvc.MoveExact)
	if _, err := e.prof.RestoreSnapshot(ctx, p.ID(), snap); err != nil {
		t.Fatal(err)
	}
	got := e.active().Data()
	if !slices.Equal(got.Order, saved.Order) || len(got.Mods) != len(saved.Mods) {
		t.Fatalf("restore: %v vs %v", got.Order, saved.Order)
	}
	for m, st := range saved.Mods {
		if got.Mods[m].Enabled != st.Enabled {
			t.Fatalf("restore: %s enabled %v", m, got.Mods[m].Enabled)
		}
	}

	other, _ := e.prof.Create(ctx, e.inst.ID, "Other", "")
	if err := e.prof.Transfer(ctx, p.ID(), other, profilesvc.TransferOptions{Order: true}); err != nil {
		t.Fatal(err)
	}
	if o := e.profile(other); !slices.Equal(o.EnabledMods(), e.active().EnabledMods()) {
		t.Fatalf("transfer: %v vs %v", o.EnabledMods(), e.active().EnabledMods())
	}
	snaps, _ := e.prof.Snapshots(ctx, other)
	if len(snaps) != 1 || snaps[0].Reason != profile.SnapshotTransfer {
		t.Fatalf("transfer snapshot: %+v", snaps)
	}
	cmp, err := e.prof.Compare(ctx, p.ID(), other)
	if err != nil || len(cmp.OnlyA)+len(cmp.OnlyB)+len(cmp.PriorityChanged) != 0 {
		t.Fatalf("after transfer the profiles are equal: %+v %v", cmp, err)
	}
	e.checkOrderInvariants()
}

// core/07 §2: activation is refused while another operation holds the
// instance (D038).
func TestActivateRefusedWhenBusy(t *testing.T) {
	e := newEnv(t)
	other, _ := e.prof.Create(ctx, e.inst.ID, "Other", "")
	release, err := e.prof.Locks.Acquire(e.inst.ID, "import")
	if err != nil {
		t.Fatal(err)
	}
	if err := e.prof.Activate(ctx, other); codeOf(err) != "instance_busy" {
		t.Fatalf("busy: %v", err)
	}
	release()
	if err := e.prof.Activate(ctx, other); err != nil {
		t.Fatal(err)
	}
}

// Separators: moving one moves its block; enabling a block enables its
// mods; deleting keeps the mods in place.
func TestSeparators(t *testing.T) {
	e := newEnv(t)
	ids := e.installMods("A", "B", "C")
	sep, err := e.prof.CreateSeparator(ctx, e.inst.ID, "Textures", "", profile.Anchor{Kind: profile.AnchorBefore, Entry: profile.Entry{Mod: ids[1]}})
	if err != nil {
		t.Fatal(err)
	}
	if err := e.prof.SetBlockEnabled(ctx, e.inst.ID, sep, false); err != nil {
		t.Fatal(err)
	}
	if got := e.active().EnabledMods(); !slices.Equal(got, ids[:1]) {
		t.Fatalf("block disabled: %v", got)
	}
	res, err := e.prof.MoveMods(ctx, e.inst.ID, []profile.Entry{{Separator: sep}}, profile.Anchor{Kind: profile.AnchorTop}, profilesvc.MoveExact)
	if err != nil || !res.Applied || !slices.Equal(e.active().Mods(), []mod.ID{ids[1], ids[2], ids[0]}) {
		t.Fatalf("block move: %+v %v %v", res, err, e.active().Mods())
	}
	view, _ := e.prof.OrderView(ctx, e.inst.ID)
	if view.Entries[0].Separator == nil || view.Entries[0].Separator.Total != 3 || view.Entries[1].Priority != 1 {
		t.Fatalf("view = %+v", view.Entries)
	}
	if err := e.prof.DeleteSeparator(ctx, e.inst.ID, sep); err != nil || !slices.Equal(e.active().Mods(), []mod.ID{ids[1], ids[2], ids[0]}) {
		t.Fatalf("delete: %v", err)
	}
	e.checkOrderInvariants()
}

// INV-ORD-03 as a property: after a random sequence of commands every
// profile satisfies every enabled order rule.
func TestOrderInvariantUnderRandomCommands(t *testing.T) {
	e := newEnv(t)
	names := make([]string, 8)
	for i := range names {
		names[i] = "M" + strconv.Itoa(i)
	}
	ids := e.installMods(names...)
	second, _ := e.prof.Create(ctx, e.inst.ID, "Second", e.active().ID())
	seed := uint32(7)
	next := func(n int) int { seed = seed*1664525 + 1013904223; return int(seed>>8) % n }
	for step := range 120 {
		x, y := ids[next(len(ids))], ids[next(len(ids))]
		switch next(5) {
		case 0, 1:
			_, _ = e.prof.CreateOrderRule(ctx, e.inst.ID, x, y)
		case 2:
			_, _ = e.prof.MoveMods(ctx, e.inst.ID, []profile.Entry{{Mod: x}}, profile.Anchor{Kind: profile.AnchorPriority, Priority: next(len(ids)) + 1}, profilesvc.MoveExact)
		case 3:
			_, _ = e.prof.MoveMods(ctx, e.inst.ID, []profile.Entry{{Mod: x}}, profile.Anchor{Kind: profile.AnchorBefore, Entry: profile.Entry{Mod: y}}, profilesvc.MoveNearest)
		case 4:
			_ = e.prof.UndoOrderChange(ctx, e.inst.ID)
			if step%10 == 0 {
				_ = e.prof.Activate(ctx, second)
			}
		}
		e.checkOrderInvariants()
	}
}

// firstOther returns a profile that is not the active one.
func (e *env) firstOther() profile.ID {
	e.t.Helper()
	active := e.active().ID()
	list, _ := e.profiles.ListByInstance(ctx, e.inst.ID)
	for _, p := range list {
		if p.ID() != active {
			return p.ID()
		}
	}
	e.t.Fatal("no other profile")
	return ""
}
