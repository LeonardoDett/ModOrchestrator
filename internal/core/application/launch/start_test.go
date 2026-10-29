package launch

import (
	"context"
	"errors"
	"testing"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
)

// files answers Stat from a set of files and folders.
type files struct {
	ports.FileReader
	dirs, files map[string]bool
}

func (f files) Stat(_ context.Context, p string) (ports.FileInfo, error) {
	switch {
	case f.dirs[p]:
		return ports.FileInfo{Exists: true, IsDir: true}, nil
	case f.files[p]:
		return ports.FileInfo{Exists: true}, nil
	}
	return ports.FileInfo{}, nil
}

type launcher struct {
	started, elevated, uris []string
	err                     error
}

func (l *launcher) Start(_ context.Context, exe string, _ []string, _ string) error {
	if l.err != nil {
		return l.err
	}
	l.started = append(l.started, exe)
	return nil
}
func (l *launcher) StartElevated(_ context.Context, exe string, _ []string, _ string) error {
	l.elevated = append(l.elevated, exe)
	return nil
}
func (l *launcher) OpenURI(_ context.Context, uri string) error {
	l.uris = append(l.uris, uri)
	return nil
}

type clients map[string]bool

func (c clients) ClientRunning(_ context.Context, store string) (bool, error) { return c[store], nil }

func code(err error) string {
	var e *Error
	if errors.As(err, &e) {
		return e.Code()
	}
	return ""
}

// D150: the optional store fields of a launch option, the checks before a
// start and the remembered refusal for lack of administrator rights.
func TestPrepareAndStart(t *testing.T) {
	root := `C:\Games\G`
	inst := game.Instance{ID: "i", Root: root}
	fs := files{dirs: map[string]bool{root: true, root + `\bin`: true}, files: map[string]bool{root + `\bin\g.exe`: true}}
	l := &launcher{}
	s := NewService(Deps{FS: fs, Launcher: l, Clients: clients{game.StoreSteam: false, game.StoreGOG: true}})

	direct := Option{ID: "game", Exe: "bin/g.exe", WorkDir: "bin"}
	exe, work, err := s.prepare(context.Background(), inst, direct)
	if err != nil || exe != root+`\bin\g.exe` || work != root+`\bin` {
		t.Fatalf("direct = %q %q %v", exe, work, err)
	}
	if _, _, err := s.prepare(context.Background(), inst, Option{ID: "x", Exe: "missing.exe"}); code(err) != CodeExeMissing {
		t.Fatalf("missing exe: %v", err)
	}
	if _, _, err := s.prepare(context.Background(), inst, Option{ID: "x", Exe: "bin/g.exe", WorkDir: "nope"}); code(err) != CodeWorkDirMissing {
		t.Fatalf("missing work dir: %v", err)
	}
	if _, _, err := s.prepare(context.Background(), inst, Option{ID: "x", Exe: "bin/g.exe", RequiresClient: game.StoreSteam}); code(err) != CodeClientClosed {
		t.Fatalf("closed client: %v", err)
	}

	// A store launch opens the URI; the executable need not be checked.
	store := Option{ID: "store", Exe: "absent.exe", StoreURI: "goggalaxy://openGameView/1", RequiresClient: game.StoreGOG}
	exe, work, err = s.prepare(context.Background(), inst, store)
	if err != nil {
		t.Fatalf("store prepare: %v", err)
	}
	if err := s.start(context.Background(), inst.ID, store, exe, work, true); err != nil || len(l.uris) != 1 || len(l.elevated) != 0 {
		t.Fatalf("store start: %v uris %v elevated %v", err, l.uris, l.elevated)
	}

	// Without a clients port the requirement is not checked.
	s2 := NewService(Deps{FS: fs, Launcher: l})
	if _, _, err := s2.prepare(context.Background(), inst, Option{ID: "x", Exe: "bin/g.exe", RequiresClient: game.StoreSteam}); err != nil {
		t.Fatalf("no clients port: %v", err)
	}

	l.err = errors.Join(errors.New("start"), ports.ErrElevationRequired)
	if err := s.start(context.Background(), inst.ID, direct, root+`\bin\g.exe`, root+`\bin`, false); code(err) != CodeNeedsElevation {
		t.Fatalf("740: %v", err)
	}
	if !s.needsElevation(inst.ID, "game") || s.needsElevation(inst.ID, "store") {
		t.Fatal("refusal not remembered for the option alone")
	}
	l.err = errors.Join(errors.New("start"), ports.ErrElevationCancelled)
	if err := s.start(context.Background(), inst.ID, direct, "", "", false); code(err) != CodeElevationCancelled {
		t.Fatalf("cancelled: %v", err)
	}
	l.err = errors.New("boom")
	if err := s.start(context.Background(), inst.ID, direct, "", "", false); code(err) != CodeStartFailed {
		t.Fatalf("other failure: %v", err)
	}
}
