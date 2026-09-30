package mod

import (
	"errors"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/relpath"
)

var t0 = time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

func loc(p string) game.Location {
	return game.Location{Target: "data", Path: relpath.MustParse(p)}
}

func newMod(t *testing.T) *Mod {
	t.Helper()
	m, err := New("m1", "i1", "Mod", Source{Kind: SourceManualFile, Ref: "mod.zip"}, t0)
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func newInstallation(t *testing.T, id InstallationID) *Installation {
	t.Helper()
	inst, err := NewInstallation(id, "m1", "i1", "archive-as-is", nil,
		[]File{{Source: relpath.MustParse("a.esp"), Dest: loc("a.esp"), Size: 1}}, t0)
	if err != nil {
		t.Fatal(err)
	}
	return inst
}

func TestNewValidates(t *testing.T) {
	if _, err := New("", "i1", "x", Source{Kind: SourceManualFile}, t0); !errors.Is(err, ErrInvalid) {
		t.Fatal("empty id must be rejected")
	}
	if _, err := New("m", "i1", "x", Source{}, t0); !errors.Is(err, ErrInvalid) {
		t.Fatal("missing source must be rejected")
	}
	if m := newMod(t); m.State != StateImported {
		t.Fatalf("new mod state = %s", m.State)
	}
}

func TestInstallLifecycle(t *testing.T) {
	m := newMod(t)
	if err := m.CompleteInstall(newInstallation(t, "inst-1"), t0); !errors.Is(err, ErrInvalidTransition) {
		t.Fatal("cannot complete an install that did not begin")
	}
	_ = m.BeginInstall(t0)
	if err := m.Remove(t0); !errors.Is(err, ErrInvalidTransition) {
		t.Fatal("cannot remove while installing")
	}
	if err := m.CompleteInstall(newInstallation(t, "inst-1"), t0); err != nil {
		t.Fatal(err)
	}
	if m.State != StateInstalled || m.Installation != "inst-1" {
		t.Fatalf("unexpected state %+v", m)
	}
}

func TestFailedInstallIsNeverPartiallyInstalled(t *testing.T) {
	m := newMod(t)
	_ = m.BeginInstall(t0)
	_ = m.AbortInstall(t0)
	if m.State != StateImported || m.Installation != "" {
		t.Fatalf("first install failure must return to imported, got %+v", m)
	}

	_ = m.BeginInstall(t0)
	_ = m.CompleteInstall(newInstallation(t, "inst-1"), t0)
	_ = m.BeginInstall(t0) // reinstall
	if m.Installation != "inst-1" {
		t.Fatal("previous installation must stay current while reinstalling")
	}
	_ = m.AbortInstall(t0)
	if m.State != StateInstalled || m.Installation != "inst-1" {
		t.Fatalf("failed reinstall must keep the previous installation, got %+v", m)
	}
}

func TestCompleteInstallRejectsForeignInstallation(t *testing.T) {
	m := newMod(t)
	_ = m.BeginInstall(t0)
	other := newInstallation(t, "x")
	other.Mod = "m2"
	if err := m.CompleteInstall(other, t0); !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected ErrInvalid, got %v", err)
	}
}

func TestRemovedIsTerminal(t *testing.T) {
	m := newMod(t)
	_ = m.Remove(t0)
	if err := m.BeginInstall(t0); !errors.Is(err, ErrInvalidTransition) {
		t.Fatal("removed mod must not be installed again")
	}
}

func TestInstallationInvariants(t *testing.T) {
	file := File{Source: relpath.MustParse("a"), Dest: loc("a")}
	cases := map[string][]File{
		"no files":         nil,
		"duplicate target": {file, {Source: relpath.MustParse("b"), Dest: loc("A")}},
		"no source":        {{Dest: loc("a")}},
		"invalid dest":     {{Source: relpath.MustParse("a"), Dest: game.Location{Target: "data"}}},
		"negative size":    {{Source: relpath.MustParse("a"), Dest: loc("a"), Size: -1}},
	}
	for name, files := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := NewInstallation("x", "m1", "i1", "inst", nil, files, t0); !errors.Is(err, ErrInvalid) {
				t.Fatalf("expected ErrInvalid, got %v", err)
			}
		})
	}
	if _, err := NewInstallation("x", "m1", "i1", "", nil, []File{file}, t0); !errors.Is(err, ErrInvalid) {
		t.Fatal("installer is required")
	}
}

func TestFootprintIsSortedAndCopied(t *testing.T) {
	files := []File{
		{Source: relpath.MustParse("z"), Dest: loc("z.dds")},
		{Source: relpath.MustParse("a"), Dest: loc("a.dds")},
	}
	inst, err := NewInstallation("x", "m1", "i1", "inst", nil, files, t0)
	if err != nil {
		t.Fatal(err)
	}
	files[0].Size = 99
	if inst.Files[0].Size != 0 {
		t.Fatal("installation must not alias caller slice")
	}
	fp := inst.Footprint()
	if fp[0].Path.String() != "a.dds" || fp[1].Path.String() != "z.dds" {
		t.Fatalf("footprint = %v", fp)
	}
	if _, ok := inst.FileAt(loc("Z.DDS")); !ok {
		t.Fatal("FileAt must use location identity")
	}
}
