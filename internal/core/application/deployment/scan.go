package deployment

import (
	"context"
	"sync"

	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/deployplan"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/relpath"
)

// scanWorkers bounds concurrent stats; identity reads open a handle per
// file, so a few workers hide the latency without flooding the disk.
const scanWorkers = 8

// observe reads one path (observed state, D033). A failure to read is never
// treated as absence (core/09 §2, `permission`).
func (s *Service) observe(ctx context.Context, path string) deployment.Observation {
	if path == "" {
		return deployment.Observation{Unreadable: true}
	}
	fi, err := s.FS.Stat(ctx, path)
	switch {
	case err != nil:
		return deployment.Observation{Unreadable: true}
	case !fi.Exists:
		return deployment.Observation{}
	case fi.IsDir && !fi.IsSymlink:
		return deployment.Observation{Exists: true, IsDir: true}
	}
	return deployment.Observation{Exists: true, Evidence: deployment.Evidence{
		FileID: fi.FileID, LinkTarget: fi.LinkTarget, Size: fi.Size, ModTime: fi.ModTime,
	}}
}

// scanned is the observed state relevant to one plan.
type scanned struct {
	files   map[string]deployment.Observation
	dirs    map[string]deployment.Observation
	blocked map[game.TargetID]bool
}

// scan observes every location of the desired and applied states, the
// folders new files need, and whether each target can be written
// (core/04 §5 `scan`; hashes are not read: identity, size and time
// decide).
func (s *Service) scan(ctx context.Context, inst game.Instance, d deployplan.Desired, applied *deployment.Manifest) (scanned, error) {
	out := scanned{files: map[string]deployment.Observation{}, dirs: map[string]deployment.Observation{}, blocked: map[game.TargetID]bool{}}
	for _, t := range inst.Targets {
		if obs := s.observe(ctx, t.Path); !obs.Exists || !obs.IsDir {
			out.blocked[t.ID] = true
		}
	}
	locs := map[string]game.Location{}
	dirs := map[string]game.Location{}
	for _, f := range d.Files {
		locs[f.Location.Key()] = f.Location
		for _, a := range deployplan.Ancestors(f.Location) {
			dirs[a.Key()] = a
		}
	}
	if applied != nil {
		for _, e := range applied.Entries() {
			if e.Kind == deployment.KindDir {
				dirs[e.Location.Key()] = e.Location
			} else {
				locs[e.Location.Key()] = e.Location
			}
		}
	}
	files, err := s.observeAll(ctx, inst, locs, out.blocked)
	if err != nil {
		return out, err
	}
	out.files = files
	if out.dirs, err = s.observeAll(ctx, inst, dirs, out.blocked); err != nil {
		return out, err
	}
	return out, nil
}

func (s *Service) observeAll(ctx context.Context, inst game.Instance, locs map[string]game.Location, blocked map[game.TargetID]bool) (map[string]deployment.Observation, error) {
	type job struct {
		key string
		loc game.Location
	}
	jobs := make(chan job)
	out := make(map[string]deployment.Observation, len(locs))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for range scanWorkers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range jobs {
				obs := deployment.Observation{Unreadable: true}
				if !blocked[j.loc.Target] {
					obs = s.observe(ctx, targetPath(inst, j.loc))
				}
				mu.Lock()
				out[j.key] = obs
				mu.Unlock()
			}
		}()
	}
	for k, l := range locs {
		if ctx.Err() != nil {
			break
		}
		jobs <- job{k, l}
	}
	close(jobs)
	wg.Wait()
	return out, ctx.Err()
}

// after observes the state once a journal ran (deployment.After).
type after struct {
	s    *Service
	ctx  context.Context
	inst game.Instance
}

func (a after) At(loc game.Location) deployment.Observation {
	return a.s.observe(a.ctx, targetPath(a.inst, loc))
}

func (a after) Backup(p relpath.Path) deployment.Observation {
	return a.s.observe(a.ctx, backupFile(a.inst, p))
}

// Expected is what a correct link of e looks like: the same file as the
// staging (hardlink), a link to its absolute path (symlink), or a copy with
// its size and time (copy keeps the time of the source).
func (a after) Expected(e deployment.Entry) (deployment.Evidence, bool) {
	src := sourcePath(a.inst, e)
	switch e.Method {
	case game.MethodSymlink:
		return deployment.Evidence{LinkTarget: src, Hash: e.Evidence.Hash}, true
	case game.MethodHardlink, game.MethodCopy:
		obs := a.s.observe(a.ctx, src)
		if !obs.Exists || obs.IsDir {
			return deployment.Evidence{}, false
		}
		ev := obs.Evidence
		ev.Hash = e.Evidence.Hash
		if e.Method == game.MethodHardlink && ev.FileID == "" {
			return deployment.Evidence{}, false
		}
		return ev, true
	}
	return deployment.Evidence{}, false
}
