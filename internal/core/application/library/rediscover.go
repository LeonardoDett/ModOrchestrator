package library

import (
	"context"
	"slices"
	"strconv"
	"strings"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/relpath"
)

// Rediscovery of the library from the staging (D145, core/14 §5).
const (
	// InstallerRecovered names the installations rebuilt from a folder.
	InstallerRecovered = "recovered"
	EventModRecovered  = event.Type("mod.recovered")
	holderRecover      = "recover_mods"
)

// OrphanFolder is a folder of the staging that is not a mod of the library.
type OrphanFolder struct {
	Name string
	// Metadata: the folder has a valid metadata file.
	Metadata bool
}

// RecoverResult is what RecoverOrphanFolders did.
type RecoverResult struct {
	Recovered []mod.ID
	// Skipped counts folders that could not become mods (no files, or a
	// path that cannot be installed).
	Skipped int
}

// OrphanFolders lists the folders of the staging whose name is not a mod of
// the instance (staging_orphan_folders). Hidden names, temporary work
// (.tmp, *.installing, *.replaced) and empty folders are not listed, and
// nothing is listed when the staging marker is not the instance's (D058).
func (s *Service) OrphanFolders(ctx context.Context, instance game.InstanceID) ([]OrphanFolder, error) {
	e, err := s.env(ctx, instance)
	if err != nil {
		return nil, err
	}
	names, err := s.orphanNames(ctx, e)
	if err != nil {
		return nil, err
	}
	out := make([]OrphanFolder, 0, len(names))
	for _, n := range names {
		_, ok := s.readMetadata(ctx, game.JoinPath(e.inst.Staging, n), n)
		out = append(out, OrphanFolder{Name: n, Metadata: ok})
	}
	return out, nil
}

func (s *Service) orphanNames(ctx context.Context, e env) ([]string, error) {
	if !s.ownsFolder(ctx, e.inst.Staging, game.StagingMarker, e.inst.ID) {
		return nil, nil
	}
	list, err := s.Mods.ListByInstance(ctx, e.inst.ID)
	if err != nil {
		return nil, err
	}
	known := make(map[string]bool, len(list))
	for _, m := range list {
		known[strings.ToLower(string(m.ID))] = true
	}
	entries, err := s.FS.ReadDir(ctx, e.inst.Staging)
	if err != nil {
		return nil, nil // staging_missing tells about it
	}
	var out []string
	for _, en := range entries {
		n := en.Name
		switch {
		case !en.IsDir, strings.HasPrefix(n, "."), strings.HasSuffix(n, ".installing"), strings.HasSuffix(n, ".replaced"),
			known[strings.ToLower(n)]:
			continue
		}
		if _, err := relpath.Parse(n); err != nil {
			continue
		}
		inside, err := s.FS.ReadDir(ctx, game.JoinPath(e.inst.Staging, n))
		if err != nil || !slices.ContainsFunc(inside, func(d ports.DirEntry) bool { return !game.IsModMetadataFile(d.Name) }) {
			continue
		}
		out = append(out, n)
	}
	slices.Sort(out)
	return out, nil
}

// RecoverOrphanFolders turns every orphan folder of the staging into a mod
// again ("Recuperar mods", D145). The mod id is the folder name. A valid
// metadata file gives the name, attributes, type, origin, variant, package
// and dates; without one the name is the folder name and the type is the one
// the footprint indicates. The installation is always rebuilt from the
// folder and the content detected by the adapter. A recovered mod enters
// every profile at the end of the ModOrder, disabled: order and enabled
// state were lost, and turning mods on would change the game behind the
// user's back.
func (s *Service) RecoverOrphanFolders(ctx context.Context, instance game.InstanceID) (RecoverResult, error) {
	e, err := s.env(ctx, instance)
	if err != nil {
		return RecoverResult{}, err
	}
	release, err := s.Locks.Acquire(instance, holderRecover)
	if err != nil {
		return RecoverResult{}, err
	}
	defer release()
	names, err := s.orphanNames(ctx, e)
	if err != nil {
		return RecoverResult{}, err
	}
	var res RecoverResult
	var found []recovered
	for _, n := range names {
		r, ok, err := s.readOrphan(ctx, e, n)
		if err != nil {
			return res, err
		}
		if !ok {
			res.Skipped++
			continue
		}
		found = append(found, r)
	}
	if len(found) == 0 {
		return res, nil
	}
	tree, err := s.categoryTree(ctx, instance)
	if err != nil {
		return res, err
	}
	cats := map[string]mod.CategoryID{} // resolved category per metadata id
	for _, r := range found {
		if r.md.Category == nil {
			continue
		}
		c := r.md.Category
		if _, done := cats[string(c.ID)]; done {
			continue
		}
		id, err := s.categoryFor(ctx, instance, tree, *c)
		if err != nil {
			return res, err
		}
		cats[string(c.ID)] = id
		if tree, err = s.categoryTree(ctx, instance); err != nil {
			return res, err
		}
	}
	active, _ := s.Profiles.Active(ctx, instance)
	edges := s.orderEdges(ctx, instance)
	ownsArchives := s.ownsFolder(ctx, e.inst.ArchiveStore, game.ArchivesMarker, instance)
	now := s.Clock.Now()
	err = s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		res.Recovered = res.Recovered[:0]
		existing, err := tx.Mods().ListByInstance(ctx, instance)
		if err != nil {
			return err
		}
		present := map[mod.ID]bool{}
		for _, m := range existing {
			if m.State != mod.StateRemoved {
				present[m.ID] = true
			}
		}
		for _, r := range found {
			present[r.id] = true
		}
		for _, r := range found {
			m, err := s.recoveredMod(ctx, tx, e, r, cats, present, ownsArchives, now)
			if err != nil {
				return err
			}
			if err := tx.Installations().Save(ctx, r.inst); err != nil {
				return err
			}
			if err := tx.Mods().Save(ctx, m); err != nil {
				return err
			}
			if err := addToProfiles(ctx, tx, m, active, false, edges, now); err != nil {
				return err
			}
			tx.Emit(s.newEvent(EventModRecovered, subjectMod, string(m.ID), "", map[string]string{
				"name": m.DisplayName(), "files": strconv.Itoa(len(r.inst.Files)), "metadata": strconv.FormatBool(r.hasMD),
			}))
			res.Recovered = append(res.Recovered, m.ID)
		}
		return nil
	})
	if err != nil {
		return RecoverResult{}, err
	}
	return res, nil
}

// recovered is one orphan folder read from disk.
type recovered struct {
	id    mod.ID
	md    mod.Metadata
	hasMD bool
	typ   game.ModType
	inst  *mod.Installation
}

// readOrphan reads one folder: its metadata and its files. ok is false when
// the folder cannot become a mod (no files, or a path that is not valid).
func (s *Service) readOrphan(ctx context.Context, e env, name string) (recovered, bool, error) {
	folder := game.JoinPath(e.inst.Staging, name)
	r := recovered{id: mod.ID(name)}
	r.md, r.hasMD = s.readMetadata(ctx, folder, name)
	var files []stagedFile
	if err := s.walkMod(ctx, folder, "", &files); err != nil {
		return r, false, err
	}
	if len(files) == 0 {
		return r, false, nil
	}
	paths := make([]string, len(files))
	for i, f := range files {
		paths[i] = f.path.String()
	}
	mt, ok := e.def.ModType(r.md.Type)
	if !r.hasMD || !ok {
		mt, ok = e.def.ModType(e.def.DetectModType(paths))
		if !ok {
			mt, _ = e.def.ModType(game.DefaultModType)
		}
	}
	r.typ = mt
	out := make([]mod.File, len(files))
	for i, f := range files {
		dest, err := mod.Place(mt, r.id, f.path)
		if err != nil {
			return r, false, nil
		}
		out[i] = mod.File{Source: f.path, Dest: dest, Size: f.size}
	}
	inst, err := mod.NewInstallation(mod.InstallationID(s.IDs.NewID()), r.id, e.inst.ID, InstallerRecovered, nil, out, s.Clock.Now())
	if err != nil {
		return r, false, nil
	}
	r.inst = inst
	return r, true, nil
}

type stagedFile struct {
	path relpath.Path
	size int64
}

// walkMod lists the files of a mod folder, without the metadata file and the
// other files of the app at its root.
func (s *Service) walkMod(ctx context.Context, root, rel string, out *[]stagedFile) error {
	dir := root
	if rel != "" {
		dir = game.JoinPath(root, rel)
	}
	entries, err := s.FS.ReadDir(ctx, dir)
	if err != nil {
		return err
	}
	for _, en := range entries {
		if err := ctx.Err(); err != nil {
			return err
		}
		if rel == "" && strings.HasPrefix(strings.ToLower(en.Name), ".modorchestrator-") {
			continue
		}
		child := en.Name
		if rel != "" {
			child = rel + "/" + en.Name
		}
		if en.IsDir {
			if err := s.walkMod(ctx, root, child, out); err != nil {
				return err
			}
			continue
		}
		p, err := relpath.Parse(child)
		if err != nil {
			continue
		}
		info, err := s.FS.Stat(ctx, game.JoinPath(root, child))
		if err != nil || !info.Exists || info.IsDir || info.IsSymlink {
			continue
		}
		*out = append(*out, stagedFile{path: p, size: info.Size})
	}
	return nil
}

// recoveredMod builds the mod of a folder inside the transaction.
func (s *Service) recoveredMod(ctx context.Context, tx ports.Tx, e env, r recovered, cats map[string]mod.CategoryID,
	present map[mod.ID]bool, ownsArchives bool, now time.Time) (*mod.Mod, error) {
	name, source, created := string(r.id), mod.Source{Kind: mod.SourceManualFile, Ref: InstallerRecovered}, now
	if r.hasMD {
		if strings.TrimSpace(r.md.Name) != "" {
			name = strings.TrimSpace(r.md.Name)
		}
		if r.md.Source.Kind != "" {
			source = mod.Source{Kind: r.md.Source.Kind, Ref: r.md.Source.Ref}
		}
		if !r.md.Created.IsZero() {
			created = r.md.Created
		}
	}
	m, err := mod.New(r.id, e.inst.ID, name, source, created)
	if err != nil {
		return nil, err
	}
	if err := m.SetType(r.typ.ID, now); err != nil {
		return nil, err
	}
	if r.hasMD {
		if err := m.SetAttributes(r.md.Attrs(), now); err != nil {
			return nil, err
		}
		if r.md.Category != nil {
			m.Category = cats[string(r.md.Category.ID)]
		}
		if v := r.md.Variant; v != nil && present[v.Of] && v.Of != m.ID {
			_ = m.MarkVariant(v.Of, v.Label, now)
		}
		m.Package = r.md.Package.Clean()
		if a, ok := s.recoveredArchive(ctx, tx, e, r.md, ownsArchives); ok {
			m.Archive = a.ID
		}
	}
	m.Content = e.adapter.ContentFlags(e.inst.Game, r.inst.ContentFootprint())
	if err := m.BeginInstall(now); err != nil {
		return nil, err
	}
	if err := m.CompleteInstall(r.inst, now); err != nil {
		return nil, err
	}
	if r.hasMD && !r.md.Installed.IsZero() {
		m.InstalledAt = r.md.Installed
	}
	return m, nil
}

// recoveredArchive registers the source archive again when the metadata
// describes it and its file is still in the ArchiveStore of the instance.
func (s *Service) recoveredArchive(ctx context.Context, tx ports.Tx, e env, md mod.Metadata, owns bool) (*mod.Archive, bool) {
	a, ok := md.ArchiveFor(e.inst.ID)
	if !ok || !a.Retained() || !owns {
		return nil, false
	}
	if got, err := tx.Archives().Get(ctx, a.ID); err == nil {
		return got, got.Instance == e.inst.ID
	}
	info, err := s.FS.Stat(ctx, e.archivePath(a))
	if err != nil || !info.Exists {
		return nil, false
	}
	if err := tx.Archives().Save(ctx, a); err != nil {
		return nil, false
	}
	return a, true
}

// categoryFor finds the category a metadata file names in the instance: by
// id, else by its path of names; the missing part of the path is created.
func (s *Service) categoryFor(ctx context.Context, instance game.InstanceID, tree mod.CategoryTree, c mod.MetadataCategory) (mod.CategoryID, error) {
	if tree.Has(c.ID) {
		return c.ID, nil
	}
	path := c.Path
	if len(path) == 0 && strings.TrimSpace(c.Name) != "" {
		path = []string{c.Name}
	}
	var parent mod.CategoryID
	for _, n := range path {
		n = strings.TrimSpace(n)
		if n == "" {
			continue
		}
		var next mod.CategoryID
		for _, x := range tree.Categories() {
			if x.Parent == parent && strings.EqualFold(x.Name, n) {
				next = x.ID
				break
			}
		}
		if next == "" {
			id, err := s.SaveCategory(ctx, instance, CategoryInput{Name: n, Parent: parent, Order: len(tree.Categories())})
			if err != nil {
				return "", err
			}
			next = id
			if tree, err = s.categoryTree(ctx, instance); err != nil {
				return "", err
			}
		}
		parent = next
	}
	return parent, nil
}
