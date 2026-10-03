package backups

import (
	"context"
	"errors"
	"testing"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/testutil/memfs"
)

type clock struct{ t time.Time }

func (c *clock) Now() time.Time { return c.t }

type state map[string]string

func (s state) Get(_ context.Context, k string) (string, error) {
	v, ok := s[k]
	if !ok {
		return "", ports.ErrNotFound
	}
	return v, nil
}
func (s state) Set(_ context.Context, k, v string) error { s[k] = v; return nil }
func (s state) Delete(_ context.Context, k string) error { delete(s, k); return nil }

// store writes a file for each backup and counts changes by hand.
type store struct {
	fs      *memfs.FS
	changes int64
	fail    bool
	invalid map[string]bool
}

func (s *store) Create(_ context.Context, dst string) error {
	if s.fail {
		return errors.New("disk full")
	}
	s.fs.AddFile(dst, "db")
	return nil
}
func (s *store) Changes(context.Context) (int64, error) { return s.changes, nil }
func (s *store) Inspect(_ context.Context, path string) (int, error) {
	if s.invalid[path] || !s.fs.Exists(path) {
		return 0, errors.New("not a database")
	}
	return 8, nil
}
func (s *store) CopyFile(_ context.Context, src, dst string) error {
	c, _ := s.fs.Content(src)
	s.fs.AddFile(dst, c)
	return nil
}

func newService() (*Service, *store, *clock, state) {
	fs := memfs.New(`C:\`)
	st := &store{fs: fs, invalid: map[string]bool{}}
	c := &clock{t: time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)}
	app := state{}
	svc := NewService(Deps{Store: st, FS: fs, State: app, Clock: c, Dir: `C:\data\backups`, Pending: `C:\data\restore-pending.db`})
	return svc, st, c, app
}

func TestAutomaticBackupOnlyWithChanges(t *testing.T) {
	ctx := context.Background()
	svc, st, c, _ := newService()
	if made, _ := svc.AutoIfChanged(ctx); made {
		t.Fatal("no change, no backup")
	}
	st.changes = 3
	if made, err := svc.AutoIfChanged(ctx); !made || err != nil {
		t.Fatalf("changed: %v %v", made, err)
	}
	c.t = c.t.Add(time.Hour)
	if made, _ := svc.AutoIfChanged(ctx); made {
		t.Fatal("nothing changed since the last backup")
	}
	list, _ := svc.List(ctx)
	if len(list) != 1 || list[0].Kind != KindAuto {
		t.Fatalf("list: %+v", list)
	}
}

func TestRetention(t *testing.T) {
	now := time.Date(2026, 10, 3, 12, 0, 0, 0, time.Local)
	var list []Backup
	// 30 hourly automatic backups today and yesterday, one per day before.
	for i := 0; i < 30; i++ {
		list = append(list, Backup{ID: "a", Kind: KindAuto, At: now.Add(-time.Duration(i) * time.Hour)})
	}
	for d := 2; d <= 10; d++ {
		list = append(list, Backup{ID: "d", Kind: KindAuto, At: now.AddDate(0, 0, -d)})
	}
	for i := 0; i < 5; i++ {
		list = append(list, Backup{Kind: KindPreMigration, At: now.Add(-time.Duration(i) * time.Minute)},
			Backup{Kind: KindStartup, At: now.Add(-time.Duration(i) * time.Minute)},
			Backup{Kind: KindManual, At: now.AddDate(-1, 0, -i)})
	}
	count := map[Kind]int{}
	for _, b := range Expired(sortNewest(list), now) {
		count[b.Kind]++
	}
	// auto: 39 kept as 24 newest + days 2..6 (one each) = 29 kept → 10 gone.
	if count[KindAuto] != 10 || count[KindPreMigration] != 2 || count[KindStartup] != 4 || count[KindManual] != 0 {
		t.Fatalf("expired: %v", count)
	}
}

func sortNewest(l []Backup) []Backup {
	out := append([]Backup(nil), l...)
	for i := range out {
		for j := i + 1; j < len(out); j++ {
			if out[j].At.After(out[i].At) {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out
}

func TestFailureIsRecordedAndCleared(t *testing.T) {
	ctx := context.Background()
	svc, st, _, _ := newService()
	st.fail = true
	if _, err := svc.Create(ctx, KindManual); err == nil {
		t.Fatal("expected failure")
	}
	if f := svc.LastFailure(ctx); f == nil || f.Kind != KindManual {
		t.Fatalf("failure: %+v", f)
	}
	st.fail = false
	if _, err := svc.Create(ctx, KindManual); err != nil {
		t.Fatal(err)
	}
	if svc.LastFailure(ctx) != nil {
		t.Fatal("success clears the failure")
	}
}

func TestRestoreBacksUpCurrentStateFirst(t *testing.T) {
	ctx := context.Background()
	svc, st, c, _ := newService()
	b, err := svc.Create(ctx, KindManual)
	if err != nil {
		t.Fatal(err)
	}
	c.t = c.t.Add(time.Minute)
	if err := svc.Restore(ctx, `..\state.db`); err == nil {
		t.Fatal("ids outside the folder are refused")
	}
	if err := svc.Restore(ctx, b.ID); err != nil {
		t.Fatal(err)
	}
	if !st.fs.Exists(svc.Pending) {
		t.Fatal("pending copy missing")
	}
	status, _ := svc.Status(ctx)
	if status.RestorePending != b.ID {
		t.Fatalf("status: %+v", status)
	}
	list, _ := svc.List(ctx)
	if len(list) != 2 || list[0].Kind != KindPreRestore {
		t.Fatalf("pre-restore backup first: %+v", list)
	}
	if err := svc.CancelRestore(ctx); err != nil || st.fs.Exists(svc.Pending) {
		t.Fatalf("cancel: %v", err)
	}
	st.invalid[`C:\x.db`] = true
	st.fs.AddFile(`C:\x.db`, "junk")
	if err := svc.RestoreFromFile(ctx, `C:\x.db`); err == nil {
		t.Fatal("invalid file refused")
	}
}
