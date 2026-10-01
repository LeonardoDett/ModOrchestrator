package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/relpath"
)

func depLoc(p string) game.Location { return game.Location{Target: "data", Path: relpath.MustParse(p)} }

func depLink(p, fileID string) deployment.Entry {
	return deployment.Entry{Location: depLoc(p), Kind: deployment.KindLink, Mod: "m1", Installation: "in1", Source: relpath.MustParse(p), Method: game.MethodHardlink, Evidence: deployment.Evidence{FileID: fileID, Size: 3, ModTime: time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)}}
}

func TestManifestRoundTripAndDelta(t *testing.T) {
	ctx := context.Background()
	db := openTestDB(t)
	seedInstance(t, db, "i1")
	repo := NewManifestRepository(db)
	if _, err := repo.Header(ctx, "i1"); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("never deployed: %v", err)
	}
	at := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	backup := deployment.Entry{Location: depLoc("Skyrim.esm"), Kind: deployment.KindBackup, BackupPath: relpath.MustParse("data/Skyrim.esm"), Evidence: deployment.Evidence{FileID: "v:orig"}}
	m1, err := deployment.NewManifest("i1", "p1", "fp1", "op1", at, []deployment.Entry{depLink("a.esp", "v:1"), depLink("Skyrim.esm", "v:2"), backup, {Location: depLoc("meshes"), Kind: deployment.KindDir}})
	if err != nil {
		t.Fatal(err)
	}
	if err := repo.Save(ctx, m1, nil); err != nil {
		t.Fatal(err)
	}
	got, err := repo.Current(ctx, "i1")
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Entries()) != 4 || got.Fingerprint != "fp1" || !got.AppliedAt.Equal(at) {
		t.Fatalf("round trip: %+v", got.Header())
	}
	if e, ok := got.Backup(depLoc("skyrim.ESM")); !ok || e.Evidence.FileID != "v:orig" {
		t.Fatalf("backup evidence kept: %+v", e)
	}
	if e, _ := got.Owns(depLoc("a.esp")); !e.Evidence.ModTime.Equal(depLink("a", "").Evidence.ModTime) {
		t.Fatalf("evidence time kept: %v", e.Evidence.ModTime)
	}
	// Second deploy: one entry changes, one goes away.
	m2, _ := deployment.NewManifest("i1", "p1", "fp2", "op2", at, []deployment.Entry{depLink("a.esp", "v:9"), depLink("Skyrim.esm", "v:2"), backup})
	if err := repo.Save(ctx, m2, got); err != nil {
		t.Fatal(err)
	}
	h, _ := repo.Header(ctx, "i1")
	again, _ := repo.Current(ctx, "i1")
	if h.Entries != 3 || len(again.Entries()) != 3 || len(again.Dirs()) != 0 {
		t.Fatalf("delta save: header %+v, entries %d", h, len(again.Entries()))
	}
	if e, _ := again.Owns(depLoc("a.esp")); e.Evidence.FileID != "v:9" {
		t.Fatal("changed entry updated")
	}
	purged, _ := deployment.NewPurged("i1", "op3", at)
	if err := repo.Save(ctx, purged, again); err != nil {
		t.Fatal(err)
	}
	if p, _ := repo.Current(ctx, "i1"); !p.Purged() || len(p.Entries()) != 0 {
		t.Fatal("purge empties the manifest")
	}
	if deployed, _ := NewDeploymentState(db).Deployed(ctx, "i1"); deployed {
		t.Fatal("purged instance is not deployed")
	}
}

func TestJournalRoundTripAndProgress(t *testing.T) {
	ctx := context.Background()
	db := openTestDB(t)
	seedInstance(t, db, "i1")
	repo := NewJournalRepository(db)
	d := depLink("new", "")
	cur := depLink("old", "v:1")
	b := deployment.Entry{Location: depLoc("base"), Kind: deployment.KindBackup, BackupPath: relpath.MustParse("data/base"), Evidence: deployment.Evidence{FileID: "v:o"}}
	j, err := deployment.NewJournal("i1", "op1", deployment.JournalDeploy, "p1", "fp", []deployment.Action{
		{Kind: deployment.ActionCreate, Location: d.Location, Desired: &d},
		{Kind: deployment.ActionRemoveManaged, Location: cur.Location, Current: &cur},
		{Kind: deployment.ActionBackupAndCreate, Location: b.Location, Desired: &d, Backup: &b},
	}, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if err := repo.Save(ctx, j); err != nil {
		t.Fatal(err)
	}
	if err := repo.Mark(ctx, "i1", map[int]deployment.ActionState{0: deployment.StateDone, 2: deployment.StateSkipped}); err != nil {
		t.Fatal(err)
	}
	got, err := repo.Pending(ctx, "i1")
	if err != nil {
		t.Fatal(err)
	}
	if got.Kind != deployment.JournalDeploy || got.Fingerprint != "fp" || len(got.Actions) != 3 {
		t.Fatalf("journal = %+v", got)
	}
	if got.Actions[0].Kind != deployment.ActionRemoveManaged || got.Actions[0].Current.Evidence.FileID != "v:1" {
		t.Fatalf("apply order and evidence kept: %+v", got.Actions[0])
	}
	if got.Actions[1].Backup == nil || got.Actions[1].Backup.Evidence.FileID != "v:o" {
		t.Fatalf("backup entry kept: %+v", got.Actions[1])
	}
	states := got.States()
	if states[0] != deployment.StateDone || states[1] != deployment.StatePending || states[2] != deployment.StateSkipped {
		t.Fatalf("states = %v", states)
	}
	ids, _ := repo.Instances(ctx)
	if len(ids) != 1 {
		t.Fatalf("instances with journal = %v", ids)
	}
	if err := repo.Delete(ctx, "i1"); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.Pending(ctx, "i1"); !errors.Is(err, ports.ErrNotFound) {
		t.Fatal("journal deleted with its actions")
	}
}

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := Open(context.Background(), ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func seedInstance(t *testing.T, db *sql.DB, id game.InstanceID) {
	t.Helper()
	if err := NewGameInstanceRepository(db).Save(context.Background(), sampleInstance(string(id), "Main")); err != nil {
		t.Fatal(err)
	}
}
