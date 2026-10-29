package library

import (
	"context"
	"errors"
	"io"
	"slices"
	"sync"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
)

// metadataReadLimit bounds the metadata file read back from a staging folder.
const metadataReadLimit = 1 << 20

var errMetaEnv = errors.New("library: instance of the mod is not available")

// SavedMods records the mods a transaction saved, so the metadata file of
// each one can follow the database after the commit (D145).
type SavedMods struct {
	ports.Mods
	mu  sync.Mutex
	ids []mod.ID
}

// Save saves m and records it.
func (r *SavedMods) Save(ctx context.Context, m *mod.Mod) error {
	if err := r.Mods.Save(ctx, m); err != nil {
		return err
	}
	r.mu.Lock()
	if !slices.Contains(r.ids, m.ID) {
		r.ids = append(r.ids, m.ID)
	}
	r.mu.Unlock()
	return nil
}

// IDs are the mods saved, in order of first save.
func (r *SavedMods) IDs() []mod.ID {
	if r == nil {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	return slices.Clone(r.ids)
}

type savingTx struct {
	ports.Tx
	mods *SavedMods
}

func (t savingTx) Mods() ports.Mods { return t.mods }

// RecordSaves wraps tx so the mods it saves are recorded. Other modules that
// save mods (import from another manager) use it too.
func RecordSaves(tx ports.Tx) (ports.Tx, *SavedMods) {
	rec := &SavedMods{Mods: tx.Mods()}
	return savingTx{Tx: tx, mods: rec}, rec
}

// WriteMetadata writes the metadata file of each installed mod in ids into
// its staging folder, atomically (D145). It never fails: a mod whose file
// could not be written is recorded for mod_metadata_stale until a later write
// works. Mods that are not installed, or whose folder is gone, are skipped.
func (s *Service) WriteMetadata(ctx context.Context, ids ...mod.ID) {
	envs := map[game.InstanceID]*metaEnv{}
	for _, id := range ids {
		m, err := s.Mods.Get(ctx, id)
		if err != nil {
			continue
		}
		if m.State != mod.StateInstalled || m.Installation == "" {
			if m.State != mod.StateInstalling {
				s.setMetaFailed(id, false)
			}
			continue
		}
		me := envs[m.Instance]
		if me == nil {
			me = s.metaEnv(ctx, m.Instance)
			envs[m.Instance] = me
		}
		s.setMetaFailed(id, s.writeModMetadata(ctx, me, m) != nil)
	}
}

// metaEnv is what writing the metadata of the mods of one instance needs.
type metaEnv struct {
	env  env
	ok   bool
	tree mod.CategoryTree
	cats map[mod.CategoryID]mod.Category
}

func (s *Service) metaEnv(ctx context.Context, instance game.InstanceID) *metaEnv {
	me := &metaEnv{cats: map[mod.CategoryID]mod.Category{}}
	e, err := s.env(ctx, instance)
	if err != nil {
		return me
	}
	me.env, me.ok = e, true
	if cats, err := s.Deps.Categories.List(ctx, instance); err == nil {
		for _, c := range cats {
			me.cats[c.ID] = c
		}
		me.tree, _ = mod.NewCategoryTree(cats)
	}
	return me
}

func (s *Service) writeModMetadata(ctx context.Context, me *metaEnv, m *mod.Mod) error {
	if !me.ok {
		return errMetaEnv
	}
	folder := me.env.modFolder(m.ID)
	info, err := s.FS.Stat(ctx, folder)
	if err != nil {
		return err
	}
	if !info.Exists || !info.IsDir {
		return nil // staging_file_missing tells about the folder
	}
	var cat *mod.Category
	var path []string
	if c, ok := me.cats[m.Category]; ok && m.Category != "" {
		cat = &c
		path, _ = me.tree.Path(c.ID)
	}
	var a *mod.Archive
	if m.Archive != "" {
		if got, err := s.Archives.Get(ctx, m.Archive); err == nil {
			a = got
		}
	}
	data, err := mod.NewMetadata(m, cat, path, a).Encode()
	if err != nil {
		return err
	}
	return s.FS.WriteFile(ctx, game.JoinPath(folder, game.ModMetadataFile), data)
}

func (s *Service) setMetaFailed(id mod.ID, failed bool) {
	s.metaMu.Lock()
	defer s.metaMu.Unlock()
	if failed {
		if s.metaFailed == nil {
			s.metaFailed = map[mod.ID]bool{}
		}
		s.metaFailed[id] = true
		return
	}
	delete(s.metaFailed, id)
}

// writeCategoryMetadata rewrites the metadata of every categorized mod of
// an instance after a category was renamed or moved.
func (s *Service) writeCategoryMetadata(ctx context.Context, instance game.InstanceID) {
	list, err := s.Mods.ListByInstance(ctx, instance)
	if err != nil {
		return
	}
	var ids []mod.ID
	for _, m := range list {
		if m.Category != "" {
			ids = append(ids, m.ID)
		}
	}
	s.WriteMetadata(ctx, ids...)
}

// MetadataStale lists the installed mods of an instance whose metadata file
// is missing or could not be written last time (mod_metadata_stale).
func (s *Service) MetadataStale(ctx context.Context, instance game.InstanceID) ([]mod.ID, error) {
	e, err := s.env(ctx, instance)
	if err != nil {
		return nil, err
	}
	list, err := s.Mods.ListByInstance(ctx, instance)
	if err != nil {
		return nil, err
	}
	s.metaMu.Lock()
	failed := make(map[mod.ID]bool, len(s.metaFailed))
	for id := range s.metaFailed {
		failed[id] = true
	}
	s.metaMu.Unlock()
	var out []mod.ID
	for _, m := range list {
		if m.State != mod.StateInstalled || m.Installation == "" {
			continue
		}
		if failed[m.ID] {
			out = append(out, m.ID)
			continue
		}
		folder := e.modFolder(m.ID)
		if info, err := s.FS.Stat(ctx, folder); err != nil || !info.Exists || !info.IsDir {
			continue // the folder itself is missing: staging_file_missing
		}
		if info, err := s.FS.Stat(ctx, game.JoinPath(folder, game.ModMetadataFile)); err == nil && !info.Exists {
			out = append(out, m.ID)
		}
	}
	return out, nil
}

// RewriteMetadata writes the metadata file of every installed mod of an
// instance again ("Regravar metadados"). It returns how many still fail.
func (s *Service) RewriteMetadata(ctx context.Context, instance game.InstanceID) (int, error) {
	list, err := s.Mods.ListByInstance(ctx, instance)
	if err != nil {
		return 0, err
	}
	ids := make([]mod.ID, 0, len(list))
	for _, m := range list {
		ids = append(ids, m.ID)
	}
	s.WriteMetadata(ctx, ids...)
	stale, err := s.MetadataStale(ctx, instance)
	return len(stale), err
}

// backfillMetadata writes the file of installed mods that have none yet
// (mods installed before D145), at startup.
func (s *Service) backfillMetadata(ctx context.Context, instance game.InstanceID) {
	stale, err := s.MetadataStale(ctx, instance)
	if err != nil || len(stale) == 0 {
		return
	}
	s.WriteMetadata(ctx, stale...)
}

// readMetadata reads the metadata file of a staging folder. ok is false
// when there is none or it is not valid (the caller uses the folder name).
func (s *Service) readMetadata(ctx context.Context, folder, name string) (mod.Metadata, bool) {
	r, err := s.FS.Open(ctx, game.JoinPath(folder, game.ModMetadataFile))
	if err != nil {
		return mod.Metadata{}, false
	}
	defer r.Close()
	data, err := io.ReadAll(io.LimitReader(r, metadataReadLimit))
	if err != nil {
		return mod.Metadata{}, false
	}
	md, err := mod.ParseMetadata(data, name)
	return md, err == nil
}
