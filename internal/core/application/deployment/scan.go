package deployment

import (
	"context"
	"sync"

	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/deployplan"
	"modorchestrator/internal/core/domain/externalchange"
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

// scan observes the locations of the desired and applied states, the
// folders new files need, and whether each target can be written
// (core/04 §5 `scan`; hashes are not read: identity, size and time
// decide). With only set (incremental deploy, D102) it observes those
// locations and the folders above the desired ones among them; every other
// link is taken as the manifest recorded it.
func (s *Service) scan(ctx context.Context, inst game.Instance, d deployplan.Desired, applied *deployment.Manifest, only map[string]bool) (scanned, error) {
	out := scanned{files: map[string]deployment.Observation{}, dirs: map[string]deployment.Observation{}, blocked: map[game.TargetID]bool{}}
	for _, t := range inst.Targets {
		if obs := s.observe(ctx, t.Path); !obs.Exists || !obs.IsDir {
			out.blocked[t.ID] = true
		}
	}
	locs := map[string]game.Location{}
	dirs := map[string]game.Location{}
	assumed := map[string]deployment.Observation{}
	for _, f := range d.Files {
		k := f.Location.Key()
		if only != nil && !only[k] {
			continue
		}
		locs[k] = f.Location
		for _, a := range deployplan.Ancestors(f.Location) {
			dirs[a.Key()] = a
		}
	}
	if applied != nil {
		for _, e := range applied.Entries() {
			k := e.Location.Key()
			switch {
			case e.Kind == deployment.KindDir:
				if only == nil {
					dirs[k] = e.Location
				}
			case only == nil || only[k]:
				locs[k] = e.Location
			case e.Kind == deployment.KindLink:
				assumed[k] = assumedObservation(e)
			}
		}
	}
	files, err := s.observeAll(ctx, inst, locs, out.blocked)
	if err != nil {
		return out, err
	}
	for k, obs := range assumed {
		files[k] = obs
	}
	out.files = files
	if out.dirs, err = s.observeAll(ctx, inst, dirs, out.blocked); err != nil {
		return out, err
	}
	return out, nil
}

// assumedObservation is what an untouched link looks like when it is as
// the manifest recorded it.
func assumedObservation(e deployment.Entry) deployment.Observation {
	return deployment.Observation{Exists: true, Evidence: e.Evidence}
}

// incremental reports whether a deploy may observe only what it touches
// (D102): a normal deploy over a verified manifest. Purge, reconciliation,
// maintenance runs, the review of changes (it may capture generated
// files, which only the full scan finds), a first deploy and a manifest
// restored from a backup (not verified) scan everything.
func (s *Service) incremental(ctx context.Context, r *run) bool {
	return r.kind == KindDeploy && !r.reconcile && !r.inline && len(r.pre) == 0 && r.applied != nil && !r.applied.Purged() &&
		s.verified(ctx, r.inst.ID)
}

// touched lists the locations an incremental deploy observes: every
// desired location that is not already the recorded link, every link that
// is no longer desired, the changes the last scan found, and the locations
// with a decision or a skip in this run. A link whose recorded evidence
// would not pass as itself is observed too.
func (s *Service) touched(r *run) map[string]bool {
	out := map[string]bool{}
	s.mu.Lock()
	if f := s.found[r.inst.ID]; f != nil {
		for k := range f.managed {
			out[k] = true
		}
	}
	s.mu.Unlock()
	for k := range r.resolve {
		out[k] = true
	}
	for k := range r.skip {
		out[k] = true
	}
	want := make(map[string]bool, len(r.desired.Files))
	for _, f := range r.desired.Files {
		k := f.Location.Key()
		want[k] = true
		link, ok := r.applied.Owns(f.Location)
		if !ok || !deployplan.SameFile(f, link) {
			out[k] = true
			continue
		}
		if _, changed := externalchange.Classify(link, assumedObservation(link)); changed {
			out[k] = true
		}
	}
	for _, e := range r.applied.Entries() {
		if k := e.Location.Key(); e.Kind != deployment.KindDir && !want[k] {
			out[k] = true
		}
	}
	return out
}

// newFileCount is the count of generated files the status shows after a
// run: an incremental run did not look for them and keeps what the last
// scan found. Called with s.mu held.
func (s *Service) newFileCount(r *run) int {
	if r.only == nil {
		return len(r.unexpected)
	}
	if f := s.found[r.inst.ID]; f != nil {
		return len(f.unexpected)
	}
	return s.newFiles[r.inst.ID]
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
