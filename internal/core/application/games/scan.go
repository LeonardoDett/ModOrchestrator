package games

import (
	"context"
	"errors"
	"slices"
	"strings"

	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/operation"
)

// Operation kinds and steps of the games module.
const (
	KindScan       operation.Kind = "games.scan"
	KindManage     operation.Kind = "games.manage"
	KindUnmanage   operation.Kind = "games.unmanage"
	KindRelocate   operation.Kind = "games.relocate"
	stepStores                    = "stores"
	stepDrives                    = "drives"
	stepValidate                  = "validate"
	stepFolders                   = "folders"
	stepRegister                  = "register"
	stepDeleteData                = "delete_files"
	stepSave                      = "save"
)

// Limits of the full search: how deep it looks below a drive root and how
// many folders it visits between progress reports.
const (
	scanMaxDepth      = 6
	scanProgressEvery = 500
)

// skipped folders of the full search: system areas and trees that never hold
// a game.
var skippedDirs = []string{
	"windows", "$recycle.bin", "system volume information", "recovery", "$windows.~bt",
	"node_modules", ".git", "appdata", "programdata",
}

// ScanQuick asks the stores and the registry for installations and keeps
// the ones an adapter recognises. It is read-only, fast and safe to run at
// startup (core/11 §3). Nothing is managed by it.
func (s *Service) ScanQuick(ctx context.Context) (int, error) {
	stores, err := s.Stores.Scan(ctx, s.Registry.hints())
	if err != nil {
		return 0, err
	}
	var found []ports.Candidate
	for _, a := range s.Registry.Adapters() {
		cands, err := a.Detect(ctx, stores, s.FS)
		if err != nil {
			return 0, err
		}
		for _, c := range cands {
			c.Root = cleanRoot(c.Root)
			if adapter, ok := s.Registry.Adapter(c.Game); ok {
				c.Version = s.version(ctx, adapter, c.Game, c.Root)
			}
			found = append(found, c)
		}
	}
	s.mu.Lock()
	s.found = mergeCandidates(s.found, found)
	s.scanned = true
	s.mu.Unlock()
	return len(found), nil
}

// StartFullScan runs the full search as a cancellable operation and returns
// its id at once; progress and the end are reported by operation events.
func (s *Service) StartFullScan(ctx context.Context) (operation.ID, error) {
	t, err := s.Ops.Start(ctx, operations.Spec{
		Kind:  KindScan,
		Steps: []string{stepStores, stepDrives},
	})
	if err != nil {
		return "", err
	}
	runCtx, cancel := context.WithCancel(context.Background())
	id := string(t.ID())
	s.mu.Lock()
	s.cancels[id] = cancel
	s.mu.Unlock()
	go func() {
		defer func() {
			cancel()
			s.mu.Lock()
			delete(s.cancels, id)
			s.mu.Unlock()
		}()
		s.finish(t, s.fullScan(runCtx, t))
	}()
	return t.ID(), nil
}

// CancelOperation cancels a running cancellable operation (today: the full
// search). It reports whether there was something to cancel.
func (s *Service) CancelOperation(id string) bool {
	s.mu.Lock()
	cancel, ok := s.cancels[id]
	s.mu.Unlock()
	if ok {
		cancel()
	}
	return ok
}

func (s *Service) finish(t *operations.Tracker, err error) {
	ctx := context.Background()
	switch {
	case err == nil:
		_ = t.Succeed(ctx)
	case errors.Is(err, context.Canceled):
		_ = t.Cancel(ctx)
	default:
		_ = t.Fail(ctx, opError(err))
	}
}

func opError(err error) operation.Error {
	if code, _, ok := CodeOf(err); ok {
		return operation.Error{Code: code, Message: err.Error()}
	}
	return operation.Error{Code: "internal", Message: err.Error()}
}

func (s *Service) fullScan(ctx context.Context, t *operations.Tracker) error {
	if err := t.BeginStep(ctx, stepStores); err != nil {
		return err
	}
	if _, err := s.ScanQuick(ctx); err != nil {
		return err
	}
	if err := t.CompleteStep(ctx, stepStores); err != nil {
		return err
	}
	if err := t.BeginStep(ctx, stepDrives); err != nil {
		return err
	}
	drives, err := s.Drives.Drives(ctx)
	if err != nil {
		return err
	}
	w := &walker{s: s, t: t, markers: s.markers()}
	for _, d := range drives {
		if err := w.walk(ctx, d, 0); err != nil {
			return err
		}
	}
	s.mu.Lock()
	s.found = mergeCandidates(s.found, w.found)
	s.scanned = true
	s.mu.Unlock()
	return t.CompleteStep(ctx, stepDrives)
}

// markers maps lower-case marker file names to the games they identify.
func (s *Service) markers() map[string][]game.ID {
	out := map[string][]game.ID{}
	for _, d := range s.Registry.Definitions() {
		a, _ := s.Registry.Adapter(d.ID)
		for _, m := range a.Markers(d.ID) {
			out[strings.ToLower(m)] = append(out[strings.ToLower(m)], d.ID)
		}
	}
	return out
}

type walker struct {
	s       *Service
	t       *operations.Tracker
	markers map[string][]game.ID
	found   []ports.Candidate
	visited int64
}

func (w *walker) walk(ctx context.Context, dir string, depth int) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	w.visited++
	if w.visited%scanProgressEvery == 0 {
		if err := w.t.Progress(ctx, w.visited, 0); err != nil {
			return err
		}
	}
	entries, err := w.s.FS.ReadDir(ctx, dir)
	if err != nil {
		return nil // unreadable folders are skipped, not fatal
	}
	for _, e := range entries {
		if e.IsDir {
			continue
		}
		for _, id := range w.markers[strings.ToLower(e.Name)] {
			a, _ := w.s.Registry.Adapter(id)
			if a.ValidateRoot(ctx, w.s.FS, id, dir) != nil {
				continue
			}
			c := ports.Candidate{Game: id, Root: dir, Store: "scan"}
			c.Version = w.s.version(ctx, a, id, dir)
			w.found = append(w.found, c)
			return nil // a game folder holds no other game
		}
	}
	if depth >= scanMaxDepth {
		return nil
	}
	for _, e := range entries {
		if !e.IsDir || slices.Contains(skippedDirs, strings.ToLower(e.Name)) {
			continue
		}
		if err := w.walk(ctx, game.JoinPath(dir, e.Name), depth+1); err != nil {
			return err
		}
	}
	return nil
}

// mergeCandidates adds new candidates to old ones by folder; a newer
// finding replaces an older one for the same folder and game.
func mergeCandidates(old, found []ports.Candidate) []ports.Candidate {
	out := slices.Clone(old)
	for _, c := range found {
		i := slices.IndexFunc(out, func(o ports.Candidate) bool {
			return o.Game == c.Game && game.SamePath(o.Root, c.Root)
		})
		if i >= 0 {
			// The same folder found twice keeps the source that knows the game
			// best (a store over the registry over a drive search).
			if storeRank(c.Store) >= storeRank(out[i].Store) {
				out[i] = c
			}
		} else {
			out = append(out, c)
		}
	}
	return out
}

func storeRank(store string) int {
	switch store {
	case "steam", "gog", "epic":
		return 3
	case "registry":
		return 2
	}
	return 1
}

// subject builds the operation subject for an instance.
func subject(id game.InstanceID) event.EntityRef {
	return event.EntityRef{Kind: "instance", ID: string(id)}
}
