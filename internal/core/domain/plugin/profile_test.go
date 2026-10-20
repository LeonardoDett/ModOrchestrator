package plugin

import (
	"errors"
	"slices"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/profile"
)

var t0 = time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)

func TestProfileStateAndLocks(t *testing.T) {
	st := NewProfileState()
	_ = st.SetEnabled("A.esp", true)
	_ = st.SetEnabled("a.ESP", false)
	if on, known := st.Enabled("a.esp"); !known || on {
		t.Fatal("plugin state is case-insensitive and last write wins")
	}
	if err := st.SetLoadOrder([]Name{"a.esp", "A.esp"}); !errors.Is(err, ErrDuplicate) {
		t.Fatal("duplicate plugin in load order must be rejected")
	}
	_ = st.SetIndexLock("a.esp", 0)
	if err := st.SetIndexLock("b.esp", 0); !errors.Is(err, ErrDuplicate) {
		t.Fatal("two locks on one index must be rejected")
	}
	if l := st.IndexLocks(); len(l) != 1 || l[0].Item != "a.esp" {
		t.Fatalf("locks = %v", l)
	}
}

// D133: the state lives in the plugins section of the profile and comes
// back as it was; a profile without the section has an empty state.
func TestProfileStateRoundTripsThroughTheSection(t *testing.T) {
	p, err := profile.New("p1", "i1", "Default", t0)
	if err != nil {
		t.Fatal(err)
	}
	if st, err := StateOf(p); err != nil || len(st.LoadOrder()) != 0 || len(st.Active()) != 0 {
		t.Fatalf("no section: %+v, %v", st, err)
	}
	st := NewProfileState()
	_ = st.SetEnabled("B.esp", true)
	_ = st.SetLoadOrder([]Name{"A.esp", "B.esp"})
	_ = st.SetIndexLock("B.esp", 1)
	if err := st.Store(p, t0); err != nil {
		t.Fatal(err)
	}
	back, err := StateOf(p)
	if err != nil {
		t.Fatal(err)
	}
	if on, _ := back.Enabled("b.esp"); !on || !slices.Equal(back.LoadOrder(), []Name{"A.esp", "B.esp"}) || len(back.IndexLocks()) != 1 {
		t.Fatalf("back = %+v", back)
	}
	_ = p.SetSection(SectionID, profile.Section{Version: 9, Doc: []byte(`{}`)}, t0)
	if _, err := StateOf(p); !errors.Is(err, ErrInvalid) {
		t.Fatalf("unknown version: %v", err)
	}
	_ = p.SetSection(SectionID, profile.Section{Version: 1, Doc: []byte(`{"loadOrder":["a","A"]}`)}, t0)
	if _, err := StateOf(p); !errors.Is(err, ErrDuplicate) {
		t.Fatalf("a stored duplicate is refused: %v", err)
	}
}

func TestCompareStates(t *testing.T) {
	a, b := NewProfileState(), NewProfileState()
	_ = a.SetEnabled("x.esp", true)
	_ = a.SetEnabled("y.esp", true)
	_ = b.SetEnabled("y.esp", true)
	_ = b.SetEnabled("z.esp", true)
	_ = a.SetLoadOrder([]Name{"x.esp", "y.esp"})
	_ = b.SetLoadOrder([]Name{"y.esp", "x.esp"})
	d := Compare(a, b)
	if !slices.Equal(d.OnlyA, []Name{"x.esp"}) || !slices.Equal(d.OnlyB, []Name{"z.esp"}) || len(d.Moved) != 2 || d.Moved[0] != (PositionChange{Plugin: "x.esp", A: 1, B: 2}) {
		t.Fatalf("diff = %+v", d)
	}
}
