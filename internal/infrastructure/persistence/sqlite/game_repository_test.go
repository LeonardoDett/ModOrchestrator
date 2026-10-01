package sqlite

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/profile"
)

func sampleInstance(id, name string) game.Instance {
	return game.Instance{
		ID: game.InstanceID(id), Game: "skyrimse", Adapter: "skyrimse", AdapterVersion: "1", DisplayName: name,
		Root: `C:\Games\Skyrim`, Staging: `C:\MO\s\staging`, ArchiveStore: `C:\MO\s\archives`, BackupStore: `C:\MO\s\backups`,
		Targets:         []game.Target{{ID: "data", Path: `C:\Games\Skyrim\Data`}, {ID: "root", Path: `C:\Games\Skyrim`}},
		PreferredMethod: game.MethodHardlink, Store: "steam", Executable: "SkyrimSE.exe",
	}
}

func TestInstanceAndProfileRoundTripAcrossReopen(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "state.db")
	db, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	insts, profs, state := NewGameInstanceRepository(db), NewProfileRepository(db), NewAppState(db)

	in := sampleInstance("i1", "Main")
	in.Hidden = true
	if err := insts.Save(ctx, in); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC)
	p, _ := profile.New("p1", "i1", "Default", now)
	if err := p.AddMod(mod.ID("m1"), true, now); err != nil {
		t.Fatal(err)
	}
	if err := profs.Save(ctx, p); err != nil {
		t.Fatal(err)
	}
	if err := profs.SetActive(ctx, "i1", "p1"); err != nil {
		t.Fatal(err)
	}
	if err := state.Set(ctx, "games.activeInstance", "i1"); err != nil {
		t.Fatal(err)
	}
	db.Close()

	db, err = Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	insts, profs, state = NewGameInstanceRepository(db), NewProfileRepository(db), NewAppState(db)

	got, err := insts.Get(ctx, "i1")
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Targets) != 2 || got.Targets[0].ID != "data" || got.Targets[1].ID != "root" || !got.Hidden || got.Executable != "SkyrimSE.exe" {
		t.Fatalf("instance = %+v", got)
	}
	got.Targets, in.Targets = nil, nil
	if !reflect.DeepEqual(got, in) {
		t.Fatalf("round trip differs:\n got %+v\nwant %+v", got, in)
	}
	p2, err := profs.Get(ctx, "p1")
	if err != nil || !p2.IsEnabled("m1") || p2.Name() != "Default" {
		t.Fatalf("profile = %+v, %v", p2, err)
	}
	if id, err := profs.Active(ctx, "i1"); err != nil || id != "p1" {
		t.Fatalf("active = %q, %v", id, err)
	}
	if v, _ := state.Get(ctx, "games.activeInstance"); v != "i1" {
		t.Fatalf("state = %q", v)
	}
}

func TestInstanceSaveValidatesAndListOrdersByName(t *testing.T) {
	ctx := context.Background()
	db, _ := Open(ctx, ":memory:")
	defer db.Close()
	insts := NewGameInstanceRepository(db)

	bad := sampleInstance("x", "Bad")
	bad.Staging = bad.Root // INV-LIB-03
	if err := insts.Save(ctx, bad); !errors.Is(err, game.ErrInvalid) {
		t.Fatalf("invalid instance saved: %v", err)
	}
	for _, n := range []string{"beta", "Alpha", "gamma"} {
		i := sampleInstance("id-"+n, n)
		i.Root = `C:\Games\` + n
		i.Targets = []game.Target{{ID: "data", Path: i.Root + `\Data`}}
		if err := insts.Save(ctx, i); err != nil {
			t.Fatal(err)
		}
	}
	list, err := insts.List(ctx)
	if err != nil || len(list) != 3 || list[0].DisplayName != "Alpha" || list[2].DisplayName != "gamma" || len(list[0].Targets) != 1 {
		t.Fatalf("list = %+v, %v", list, err)
	}
	if _, err := insts.Get(ctx, "nope"); !errors.Is(err, ports.ErrNotFound) {
		t.Fatal("unknown instance")
	}
	if err := insts.Delete(ctx, "nope"); !errors.Is(err, ports.ErrNotFound) {
		t.Fatal("delete unknown")
	}
}

func TestDeletingAnInstanceRemovesEverythingOfIt(t *testing.T) {
	ctx := context.Background()
	db, _ := Open(ctx, ":memory:")
	defer db.Close()
	insts, profs := NewGameInstanceRepository(db), NewProfileRepository(db)

	if err := insts.Save(ctx, sampleInstance("i1", "Main")); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	p, _ := profile.New("p1", "i1", "Default", now)
	if err := profs.Save(ctx, p); err != nil {
		t.Fatal(err)
	}
	if err := profs.SetActive(ctx, "i1", "p1"); err != nil {
		t.Fatal(err)
	}
	snap, _ := p.TakeSnapshot("s1", profile.SnapshotManual, now)
	if err := profs.SaveSnapshot(ctx, snap); err != nil {
		t.Fatal(err)
	}
	if got, err := profs.Snapshots(ctx, "p1"); err != nil || len(got) != 1 || got[0].Reason != profile.SnapshotManual {
		t.Fatalf("snapshots = %+v, %v", got, err)
	}
	if err := insts.Delete(ctx, "i1"); err != nil {
		t.Fatal(err)
	}
	if _, err := profs.Get(ctx, "p1"); !errors.Is(err, ports.ErrNotFound) {
		t.Fatal("profile must go with its instance")
	}
	if _, err := profs.Active(ctx, "i1"); !errors.Is(err, ports.ErrNotFound) {
		t.Fatal("active profile must go with its instance")
	}
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM profile_snapshots`).Scan(&n)
	if n != 0 {
		t.Fatal("snapshots must go with the profile")
	}
}

func TestProfileNeedsItsInstanceAndActiveMustBelongToIt(t *testing.T) {
	ctx := context.Background()
	db, _ := Open(ctx, ":memory:")
	defer db.Close()
	insts, profs := NewGameInstanceRepository(db), NewProfileRepository(db)

	now := time.Now().UTC()
	orphan, _ := profile.New("p0", "ghost", "Default", now)
	if err := profs.Save(ctx, orphan); err == nil {
		t.Fatal("a profile without instance must be refused")
	}
	insts.Save(ctx, sampleInstance("i1", "A"))
	other := sampleInstance("i2", "B")
	other.Root = `C:\Games\B`
	other.Targets = []game.Target{{ID: "data", Path: `C:\Games\B\Data`}}
	insts.Save(ctx, other)
	p, _ := profile.New("p1", "i1", "Default", now)
	profs.Save(ctx, p)
	if err := profs.SetActive(ctx, "i2", "p1"); err == nil {
		t.Fatal("active profile must belong to the instance")
	}
}

func TestDeploymentStateAndAppState(t *testing.T) {
	ctx := context.Background()
	db, _ := Open(ctx, ":memory:")
	defer db.Close()
	NewGameInstanceRepository(db).Save(ctx, sampleInstance("i1", "Main"))
	dep := NewDeploymentState(db)

	if ok, err := dep.Deployed(ctx, "i1"); err != nil || ok {
		t.Fatalf("never deployed: %v %v", ok, err)
	}
	db.Exec(`INSERT INTO deployment_manifests (instance_id, profile_id, fingerprint, operation_id, applied_at, entry_count) VALUES ('i1', 'p1', 'abc', 'op', 'now', 1)`)
	if ok, _ := dep.Deployed(ctx, "i1"); !ok {
		t.Fatal("manifest with fingerprint means deployed")
	}
	db.Exec(`UPDATE deployment_manifests SET fingerprint = '', entry_count = 0`)
	if ok, _ := dep.Deployed(ctx, "i1"); ok {
		t.Fatal("a purge manifest means not deployed")
	}

	st := NewAppState(db)
	if _, err := st.Get(ctx, "k"); !errors.Is(err, ports.ErrNotFound) {
		t.Fatal("unset key")
	}
	st.Set(ctx, "k", "1")
	st.Set(ctx, "k", "2")
	if v, _ := st.Get(ctx, "k"); v != "2" {
		t.Fatalf("v = %q", v)
	}
	st.Delete(ctx, "k")
	if _, err := st.Get(ctx, "k"); !errors.Is(err, ports.ErrNotFound) {
		t.Fatal("deleted key")
	}
}
