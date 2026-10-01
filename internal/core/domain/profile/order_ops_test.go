package profile

import (
	"errors"
	"slices"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/plugin"
)

func withSeparator(t *testing.T, p *Profile, id SeparatorID, index int) {
	t.Helper()
	if err := p.AddSeparator(Separator{ID: id, Label: string(id)}, index, t0); err != nil {
		t.Fatal(err)
	}
}

func TestResolveAnchors(t *testing.T) {
	p := newProfile(t, "a", "b", "c", "d")
	withSeparator(t, p, "s", 2) // a b [s] c d
	cases := []struct {
		name string
		a    Anchor
		want []Entry
	}{
		{"top", Anchor{Kind: AnchorTop}, []Entry{{Mod: "d"}, {Mod: "a"}, {Mod: "b"}, {Separator: "s"}, {Mod: "c"}}},
		{"bottom", Anchor{Kind: AnchorBottom}, []Entry{{Mod: "a"}, {Mod: "b"}, {Separator: "s"}, {Mod: "c"}, {Mod: "d"}}},
		{"before b", Anchor{Kind: AnchorBefore, Entry: Entry{Mod: "b"}}, []Entry{{Mod: "a"}, {Mod: "d"}, {Mod: "b"}, {Separator: "s"}, {Mod: "c"}}},
		{"after a", Anchor{Kind: AnchorAfter, Entry: Entry{Mod: "a"}}, []Entry{{Mod: "a"}, {Mod: "d"}, {Mod: "b"}, {Separator: "s"}, {Mod: "c"}}},
		{"end of block", Anchor{Kind: AnchorEndOfBlock, Entry: Entry{Separator: "s"}}, []Entry{{Mod: "a"}, {Mod: "b"}, {Separator: "s"}, {Mod: "c"}, {Mod: "d"}}},
		{"priority 2", Anchor{Kind: AnchorPriority, Priority: 2}, []Entry{{Mod: "a"}, {Mod: "d"}, {Mod: "b"}, {Separator: "s"}, {Mod: "c"}}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			q, _ := Restore(p.Data())
			i, err := q.Resolve([]Entry{{Mod: "d"}}, c.a)
			if err != nil {
				t.Fatal(err)
			}
			if err := q.Move([]Entry{{Mod: "d"}}, i, nil, t0); err != nil {
				t.Fatal(err)
			}
			if !slices.Equal(q.Order(), c.want) {
				t.Fatalf("order = %v, want %v", q.Order(), c.want)
			}
		})
	}
	if _, err := p.Resolve([]Entry{{Mod: "d"}}, Anchor{Kind: AnchorBefore, Entry: Entry{Mod: "d"}}); !errors.Is(err, ErrInvalid) {
		t.Fatal("anchoring on a moved entry is invalid")
	}
}

func TestBlockModsAndSeparatorOf(t *testing.T) {
	p := newProfile(t, "a", "b", "c")
	withSeparator(t, p, "s1", 0)
	withSeparator(t, p, "s2", 2) // s1 a s2 b c
	got, _ := p.BlockMods("s2")
	if !slices.Equal(got, []mod.ID{"b", "c"}) {
		t.Fatalf("block = %v", got)
	}
	if s, ok := p.SeparatorOf("a"); !ok || s != "s1" {
		t.Fatalf("separator of a = %q", s)
	}
}

func TestReplaceOrderKeepsTheSameMods(t *testing.T) {
	p := newProfile(t, "a", "b")
	if err := p.ReplaceOrder([]Entry{{Mod: "b"}, {Mod: "a"}}, nil, t0); err != nil {
		t.Fatal(err)
	}
	if err := p.ReplaceOrder([]Entry{{Mod: "b"}}, nil, t0); !errors.Is(err, ErrInvalid) {
		t.Fatal("an order missing a mod breaks INV-ORD-02 and is refused")
	}
	if err := p.ReplaceOrder([]Entry{{Mod: "b"}, {Mod: "a"}, {Mod: "x"}}, nil, t0); err == nil {
		t.Fatal("an order with an unknown mod is refused")
	}
	if !slices.Equal(p.Mods(), []mod.ID{"b", "a"}) {
		t.Fatal("refused replacements change nothing")
	}
}

func TestTransferCopiesSelectionAndOptionallyOrder(t *testing.T) {
	a := newProfile(t, "x", "y", "z")
	_ = a.SetEnabled("z", false, t0)
	withSeparator(t, a, "s", 0)
	b, _ := NewFromOrder("p2", "B", a, t0)
	_ = b.AddMod("only-b", true, t0)
	_ = a.Move([]Entry{{Mod: "x"}}, 3, nil, t0) // s y z x

	if err := b.TransferFrom(a, TransferOptions{}, t0); err != nil {
		t.Fatal(err)
	}
	if !b.IsEnabled("x") || !b.IsEnabled("y") || b.IsEnabled("z") || !b.IsEnabled("only-b") {
		t.Fatalf("selection not transferred: %v", b.EnabledMods())
	}
	if !slices.Equal(b.Mods(), []mod.ID{"x", "y", "z", "only-b"}) {
		t.Fatal("order is kept without the order option")
	}
	if err := b.TransferFrom(a, TransferOptions{Order: true}, t0); err != nil {
		t.Fatal(err)
	}
	want := []Entry{{Separator: "s"}, {Mod: "y"}, {Mod: "z"}, {Mod: "x"}, {Mod: "only-b"}}
	if !slices.Equal(b.Order(), want) {
		t.Fatalf("order = %v, want %v", b.Order(), want)
	}
}

func TestNewFromOrderStartsDisabledWithSamePositions(t *testing.T) {
	a := newProfile(t, "x", "y")
	withSeparator(t, a, "s", 1)
	b, err := NewFromOrder("p2", "Empty", a, t0)
	if err != nil {
		t.Fatal(err)
	}
	if len(b.EnabledMods()) != 0 || !slices.Equal(b.Order(), a.Order()) {
		t.Fatalf("enabled %v order %v", b.EnabledMods(), b.Order())
	}
}

func TestCompare(t *testing.T) {
	a := newProfile(t, "x", "y", "z")
	b, _ := a.Clone("p2", "B", t0)
	_ = b.SetEnabled("x", false, t0)
	_ = a.SetEnabled("z", false, t0)
	_ = b.Move([]Entry{{Mod: "y"}}, 0, nil, t0) // b: y x z
	c := Compare(a, b)
	if !slices.Equal(c.OnlyA, []mod.ID{"x"}) || !slices.Equal(c.OnlyB, []mod.ID{"z"}) {
		t.Fatalf("only: %v / %v", c.OnlyA, c.OnlyB)
	}
	if len(c.PriorityChanged) != 1 || c.PriorityChanged[0] != (PriorityChange{Mod: "y", A: 2, B: 1}) {
		t.Fatalf("priority changes = %v", c.PriorityChanged)
	}
}

func TestEncodeDecodeOrder(t *testing.T) {
	in := []Entry{{Mod: "a"}, {Separator: "s"}, {Mod: "b"}}
	out, err := DecodeOrder(EncodeOrder(in))
	if err != nil || !slices.Equal(in, out) {
		t.Fatalf("round trip = %v, %v", out, err)
	}
	if _, err := DecodeOrder("x:1"); err == nil {
		t.Fatal("unknown prefix is rejected")
	}
}

func TestPruneSnapshotsKeepsManualAndNewest(t *testing.T) {
	var list []Snapshot
	for i := range 4 {
		list = append(list, Snapshot{ID: SnapshotID(rune('a' + i)), Reason: SnapshotTransfer, CreatedAt: t0.Add(time.Duration(i) * time.Minute)})
	}
	list = append(list, Snapshot{ID: "m", Reason: SnapshotManual, CreatedAt: t0.Add(-time.Hour)})
	got := PruneSnapshots(list, 2)
	if !slices.Equal(got, []SnapshotID{"b", "a"}) {
		t.Fatalf("pruned = %v", got)
	}
}

// INV-ORD-06: ModOrder and LoadOrder share no structure: moving mods never
// touches the load order, and changing the load order never moves a mod.
func TestModOrderAndLoadOrderAreIndependent(t *testing.T) {
	p := newProfile(t, "a", "b")
	if err := p.SetLoadOrder([]plugin.Name{"x.esp", "y.esp"}, t0); err != nil {
		t.Fatal(err)
	}
	if err := p.Move([]Entry{{Mod: "b"}}, 0, nil, t0); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(p.LoadOrder(), []plugin.Name{"x.esp", "y.esp"}) {
		t.Fatal("moving a mod changed the load order")
	}
	if err := p.SetLoadOrder([]plugin.Name{"y.esp", "x.esp"}, t0); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(p.Mods(), []mod.ID{"b", "a"}) {
		t.Fatal("changing the load order moved a mod")
	}
}
