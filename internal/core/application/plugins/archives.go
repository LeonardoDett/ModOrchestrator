package plugins

import (
	"context"
	"errors"
	"sync"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/conflict"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/gamearchive"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/core/domain/relpath"
)

// GameArchives answers conflicts.ArchiveSource (D133, D147): the archives
// the game loads with the desired load order of the active profile, each
// with its index, in the order the game reads them. ok is false for a game
// without the plugins capability or whose adapter does not read archives
// (ports.ArchiveIndex).
func (s *Service) GameArchives(ctx context.Context, instance game.InstanceID) (gamearchive.Loaded, bool, error) {
	if !s.Supported(ctx, instance) {
		return gamearchive.Loaded{}, false, nil
	}
	st, err := s.load(ctx, instance)
	if err != nil {
		return gamearchive.Loaded{}, false, err
	}
	ai, ok := st.ps.(ports.ArchiveIndex)
	if !ok {
		return gamearchive.Loaded{}, false, nil
	}
	out := gamearchive.Loaded{Target: st.ps.PluginTarget(st.inst.Game)}
	if len(st.roots.Enabled) == 0 {
		return out, true, nil
	}
	var active []plugin.Name
	for _, n := range st.arrange(st.settings.autoSort).order {
		if p, ok := st.plugin(n); ok && st.enabled(p) {
			active = append(active, p.Name)
		}
	}
	// The top files the desired state deploys, each from the mod that wins
	// its location.
	winners := map[string]conflict.Winner{}
	var names []string
	for _, w := range conflict.Calculate(st.roots).Winners {
		winners[w.Location.Path.Key()] = w
		names = append(names, w.Location.Path.String())
	}
	for _, name := range ai.LoadedArchives(st.inst.Game, names, active) {
		p, err := relpath.Parse(name)
		if err != nil {
			continue
		}
		w, ok := winners[p.Key()]
		if !ok {
			continue
		}
		a := gamearchive.Archive{Name: w.Location.Path.String(), Mod: w.Mod}
		a.Files, a.Unread, err = s.archives.index(ctx, func(ctx context.Context) ([]string, error) {
			path := game.JoinPath(game.JoinPath(st.inst.Staging, string(w.Mod)), w.File.Source.String())
			return ai.ReadArchiveIndex(ctx, s.FS, st.inst.Game, path)
		}, w.Installation, w.File)
		if err != nil {
			return gamearchive.Loaded{}, false, err
		}
		out.Archives = append(out.Archives, a)
	}
	return out, true, nil
}

// archiveIndexes caches the index of each archive file of an installation;
// installations are immutable, so a reinstall is a new key.
type archiveIndexes struct {
	mu   sync.Mutex
	byID map[string]archiveIndex
}

type archiveIndex struct {
	files  []relpath.Path
	unread bool
}

// index returns the paths inside the archive, reading them once. An
// archive the adapter does not read, or a file missing from the staging
// (reported by the staging check, core/10), is unread; paths that are not
// valid relative paths are skipped.
func (c *archiveIndexes) index(ctx context.Context, read func(context.Context) ([]string, error), id mod.InstallationID, f mod.File) ([]relpath.Path, bool, error) {
	key := string(id) + "|" + f.Source.Key()
	c.mu.Lock()
	got, ok := c.byID[key]
	c.mu.Unlock()
	if ok {
		return got.files, got.unread, nil
	}
	raw, err := read(ctx)
	if err != nil {
		if ctx.Err() != nil {
			return nil, false, err
		}
		// A file missing from the staging is not cached: it may come back.
		if !errors.Is(err, ports.ErrArchiveUnreadable) {
			return nil, true, nil
		}
		got = archiveIndex{unread: true}
	}
	for _, r := range raw {
		if p, err := relpath.Parse(r); err == nil {
			got.files = append(got.files, p)
		}
	}
	c.mu.Lock()
	if c.byID == nil {
		c.byID = map[string]archiveIndex{}
	}
	c.byID[key] = got
	c.mu.Unlock()
	return got.files, got.unread, nil
}
