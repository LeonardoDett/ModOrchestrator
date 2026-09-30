package profile

import (
	"errors"
	"slices"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/plugin"
)

var t0 = time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

func newProfile(t *testing.T, mods ...mod.ID) *Profile {
	t.Helper()
	p, err := New("p1", "i1", "Default", t0)
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range mods {
		if err := p.AddMod(m, true, t0); err != nil {
			t.Fatal(err)
		}
	}
	return p
}

// wins is the edge of "winner wins loser" (loser before winner), as the
// rules package produces it.
func wins(winner, loser mod.ID) ordering.Edge {
	return ordering.Edge{Before: ordering.Item(loser), After: ordering.Item(winner), Ref: string(winner) + ">" + string(loser)}
}

func TestAddedModsGoToHighestPriority(t *testing.T) {
	p := newProfile(t, "a", "b")
	if prio, _ := p.Priority("b"); prio != 2 {
		t.Fatalf("last added must have highest priority, got %d", prio)
	}
	if err := p.AddMod("a", false, t0); !errors.Is(err, ErrDuplicate) {
		t.Fatal("duplicate mod must be rejected")
	}
	_ = p.AddMod("c", false, t0)
	if !slices.Equal(p.EnabledMods(), []mod.ID{"a", "b"}) {
		t.Fatalf("enabled = %v", p.EnabledMods())
	}
}

func TestDisabledModsKeepPosition(t *testing.T) {
	p := newProfile(t, "a", "b", "c")
	_ = p.SetEnabled("a", false, t0)
	_ = p.SetEnabled("a", true, t0)
	if prio, _ := p.Priority("a"); prio != 1 {
		t.Fatal("re-enabling must not move the mod")
	}
	if st, _ := p.ModState("a"); st.EnabledAt != t0 {
		t.Fatal("enabled time is recorded")
	}
}

func TestSeparatorsDoNotCountForPriority(t *testing.T) {
	p := newProfile(t, "a", "b")
	if err := p.AddSeparator(Separator{ID: "s1", Label: "Textures"}, 0, t0); err != nil {
		t.Fatal(err)
	}
	if prio, _ := p.Priority("a"); prio != 1 {
		t.Fatalf("separator must not shift priorities, got %d", prio)
	}
	_ = p.RemoveSeparator("s1", t0)
	if len(p.Order()) != 2 {
		t.Fatal("removing a separator keeps its mods")
	}
}

func TestMoveRefusesRuleViolationWithNearestPosition(t *testing.T) {
	p := newProfile(t, "a", "b", "c")
	edges := []ordering.Edge{wins("b", "a")} // a must stay below b
	err := p.Move([]Entry{{Mod: "a"}}, 2, edges, t0)
	var ref *MoveRefusal
	if !errors.As(err, &ref) || !errors.Is(err, ErrOrderViolation) {
		t.Fatalf("expected refusal, got %v", err)
	}
	if len(ref.Violated) != 1 || ref.Violated[0].Before != "a" || ref.Violated[0].After != "b" {
		t.Fatalf("refusal must cite the rule in mod terms: %+v", ref.Violated)
	}
	if ref.Nearest != 0 || ref.NearestOrder[0].Mod != "a" {
		t.Fatalf("nearest valid position is where it is: %+v", ref)
	}
	if !slices.Equal(p.Mods(), []mod.ID{"a", "b", "c"}) {
		t.Fatal("a refused move changes nothing")
	}
	if err := p.Move([]Entry{{Mod: "c"}}, 0, edges, t0); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(p.Mods(), []mod.ID{"c", "a", "b"}) {
		t.Fatalf("valid move applied: %v", p.Mods())
	}
}

func TestMovingSeparatorMovesItsBlock(t *testing.T) {
	p := newProfile(t, "a", "b", "c")
	_ = p.AddSeparator(Separator{ID: "s1"}, 1, t0) // a | s1 b c
	if err := p.Move([]Entry{{Separator: "s1"}}, 0, nil, t0); err != nil {
		t.Fatal(err)
	}
	if got := p.Order(); got[0].Separator != "s1" || !slices.Equal(p.Mods(), []mod.ID{"b", "c", "a"}) {
		t.Fatalf("block must move with its separator: %v", got)
	}
}

func TestReorderMovesMinimallyAndExplains(t *testing.T) {
	p := newProfile(t, "a", "b", "c", "d")
	moves, err := p.Reorder([]ordering.Edge{wins("a", "d")}, t0)
	if err != nil {
		t.Fatal(err)
	}
	if len(moves) != 1 || len(moves[0].Because) != 1 || moves[0].Because[0].Ref != "a>d" {
		t.Fatalf("one explained move expected: %+v", moves)
	}
	pa, _ := p.Priority("a")
	pd, _ := p.Priority("d")
	if pa <= pd {
		t.Fatal("a must now win d")
	}
	again, _ := p.Reorder([]ordering.Edge{wins("a", "d")}, t0)
	if len(again) != 0 {
		t.Fatal("a valid order is not touched")
	}
	_, err = p.Reorder([]ordering.Edge{wins("a", "b"), wins("b", "a")}, t0)
	var ce *ordering.CycleError
	if !errors.As(err, &ce) || ce.Cycle.Items[0] == "" || ce.Cycle.Items[0][0] == 'm' {
		t.Fatalf("cycle must be reported in mod terms, got %v", err)
	}
}

func TestPluginStateAndLocks(t *testing.T) {
	p := newProfile(t)
	_ = p.SetPluginEnabled("A.esp", true, t0)
	_ = p.SetPluginEnabled("a.ESP", false, t0)
	if on, known := p.PluginEnabled("a.esp"); !known || on {
		t.Fatal("plugin state is case-insensitive and last write wins")
	}
	if err := p.SetLoadOrder([]plugin.Name{"a.esp", "A.esp"}, t0); !errors.Is(err, plugin.ErrDuplicate) {
		t.Fatal("duplicate plugin in load order must be rejected")
	}
	_ = p.SetIndexLock("a.esp", 0, t0)
	if err := p.SetIndexLock("b.esp", 0, t0); !errors.Is(err, ErrDuplicate) {
		t.Fatal("two locks on one index must be rejected")
	}
	if l := p.IndexLocks(); len(l) != 1 || l[0].Item != "a.esp" {
		t.Fatalf("locks = %v", l)
	}
}

func TestCloneCopiesSelectionOnly(t *testing.T) {
	p := newProfile(t, "a", "b")
	_ = p.SetEnabled("a", false, t0)
	c, err := p.Clone("p2", "Copy", t0)
	if err != nil {
		t.Fatal(err)
	}
	_ = c.SetEnabled("a", true, t0)
	if p.IsEnabled("a") {
		t.Fatal("clone must be independent")
	}
	if !slices.Equal(c.Mods(), p.Mods()) {
		t.Fatal("clone keeps the order")
	}
}

func TestSnapshotRoundTrip(t *testing.T) {
	p := newProfile(t, "a", "b", "c")
	snap, _ := p.TakeSnapshot("s1", SnapshotManual, t0)
	_ = p.SetEnabled("a", false, t0)
	_ = p.Move([]Entry{{Mod: "c"}}, 0, nil, t0)
	_ = p.RemoveMod("b", t0)
	_ = p.AddMod("d", true, t0)
	ignored, err := p.RestoreSnapshot(snap, t0)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(ignored, []mod.ID{"b"}) {
		t.Fatalf("removed mod must be reported, got %v", ignored)
	}
	if !slices.Equal(p.Mods(), []mod.ID{"a", "c", "d"}) || !p.IsEnabled("a") || p.IsEnabled("d") {
		t.Fatalf("restore: order %v, a=%v d=%v", p.Mods(), p.IsEnabled("a"), p.IsEnabled("d"))
	}
}

func TestRestoreValidates(t *testing.T) {
	if _, err := Restore(Data{ID: "p", Instance: "i", Name: "x", Order: []Entry{{Mod: "a"}}}); !errors.Is(err, ErrInvalid) {
		t.Fatal("mod in order without state must be rejected")
	}
	if _, err := Restore(Data{ID: "p", Instance: "i", Name: "x", Mods: map[mod.ID]ModState{"a": {}}}); !errors.Is(err, ErrInvalid) {
		t.Fatal("mod with state but missing from order must be rejected (INV-ORD-02)")
	}
}
