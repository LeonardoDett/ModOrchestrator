package library

import (
	"context"
	"slices"
	"strings"
	"time"

	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
)

// ModRow is one line of the Mods table (ui/telas/mods.md §5), built by the
// backend so the UI only shows it (core/00 §6).
type ModRow struct {
	ID           mod.ID
	Name         string
	DetectedName string
	Version      string
	Author       string
	Category     mod.CategoryID
	CategoryPath []string
	State        mod.State
	// Enabled is the state in the active profile.
	Enabled   bool
	EnabledAt time.Time
	Size      int64
	Files     int
	Type      game.ModTypeID
	TypeName  string
	Content   []mod.ContentFlag
	Installer string
	// Source is the original archive name.
	Source       string
	InstalledAt  time.Time
	VariantOf    mod.ID
	VariantLabel string
	Highlight    mod.Highlight
	HasNotes     bool
	// Queued means an operation of the queue refers to this mod.
	Queued bool
}

// ModList returns every mod of the instance that was not removed.
func (s *Service) ModList(ctx context.Context, instance game.InstanceID) ([]ModRow, error) {
	e, err := s.env(ctx, instance)
	if err != nil {
		return nil, err
	}
	mods, err := s.Mods.ListByInstance(ctx, instance)
	if err != nil {
		return nil, err
	}
	sums, err := s.Installations.Summaries(ctx, instance)
	if err != nil {
		return nil, err
	}
	tree, err := s.categoryTree(ctx, instance)
	if err != nil {
		return nil, err
	}
	active, _ := s.Profiles.Active(ctx, instance)
	var states map[mod.ID]bool
	var enabledAt map[mod.ID]time.Time
	if p, err := s.Profiles.Get(ctx, active); err == nil {
		states, enabledAt = map[mod.ID]bool{}, map[mod.ID]time.Time{}
		for _, id := range p.Mods() {
			st, _ := p.ModState(id)
			states[id], enabledAt[id] = st.Enabled, st.EnabledAt
		}
	}
	queued := map[mod.ID]bool{}
	s.mu.Lock()
	if q := s.queues[instance]; q != nil {
		for _, j := range q.jobs {
			if j.mod != "" && !j.cancelled {
				queued[j.mod] = true
			}
		}
	}
	s.mu.Unlock()
	archives := map[mod.ArchiveID]string{}
	out := make([]ModRow, 0, len(mods))
	for _, m := range mods {
		if m.State == mod.StateRemoved {
			continue
		}
		row := s.row(e, m, tree)
		sum := sums[m.Installation]
		row.Size, row.Files, row.Installer = sum.Size, sum.Files, sum.Installer
		row.Enabled, row.EnabledAt = states[m.ID], enabledAt[m.ID]
		row.Queued = queued[m.ID]
		if m.Archive != "" {
			if _, ok := archives[m.Archive]; !ok {
				archives[m.Archive] = m.Source.Ref
				if a, err := s.Archives.Get(ctx, m.Archive); err == nil {
					archives[m.Archive] = a.OriginalName
				}
			}
			row.Source = archives[m.Archive]
		}
		out = append(out, row)
	}
	slices.SortFunc(out, func(a, b ModRow) int { return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name)) })
	return out, nil
}

func (s *Service) row(e env, m *mod.Mod, tree mod.CategoryTree) ModRow {
	r := ModRow{
		ID: m.ID, Name: m.DisplayName(), DetectedName: m.Name, Version: m.Attributes.Version, Author: m.Attributes.Author,
		Category: m.Category, State: m.State, Type: m.Type, Content: slices.Clone(m.Content), Source: m.Source.Ref,
		InstalledAt: m.InstalledAt, VariantOf: m.VariantOf, VariantLabel: m.VariantLabel, Highlight: m.Attributes.Highlight,
		HasNotes: strings.TrimSpace(m.Attributes.Notes) != "",
	}
	if p, ok := tree.Path(m.Category); ok {
		r.CategoryPath = p
	}
	if mt, ok := e.def.ModType(m.Type); ok {
		r.TypeName = mt.Name
	}
	return r
}

// ArchiveInfo describes the source archive of a mod.
type ArchiveInfo struct {
	Name     string
	Kind     mod.ArchiveKind
	Size     int64
	Hash     string
	Retained bool
}

// InstallationInfo describes the current installation (Inspector ›
// Instalação).
type InstallationInfo struct {
	ID        mod.InstallationID
	Installer string
	Options   map[string]string
	Files     int
	Size      int64
	CreatedAt time.Time
}

// ModTypeOption is a mod type the user may pick (Advanced).
type ModTypeOption struct {
	ID     game.ModTypeID
	Name   string
	Target game.TargetID
}

// ModDetails is the Inspector of one mod (ui/telas/mods.md §6).
type ModDetails struct {
	ModRow
	Description   string
	Notes         string
	Tags          []string
	VariantOfName string
	Archive       *ArchiveInfo
	Installation  *InstallationInfo
	ModTypes      []ModTypeOption
}

// Details returns the Inspector data of a mod.
func (s *Service) Details(ctx context.Context, id mod.ID) (ModDetails, error) {
	m, err := s.Mods.Get(ctx, id)
	if err != nil || m.State == mod.StateRemoved {
		return ModDetails{}, fail("not_found", err, "mod", string(id))
	}
	rows, err := s.ModList(ctx, m.Instance)
	if err != nil {
		return ModDetails{}, err
	}
	i := slices.IndexFunc(rows, func(r ModRow) bool { return r.ID == id })
	if i < 0 {
		return ModDetails{}, fail("not_found", nil, "mod", string(id))
	}
	d := ModDetails{ModRow: rows[i], Description: m.Attributes.Description, Notes: m.Attributes.Notes, Tags: slices.Clone(m.Attributes.Tags)}
	if m.VariantOf != "" {
		if o, err := s.Mods.Get(ctx, m.VariantOf); err == nil {
			d.VariantOfName = o.DisplayName()
		}
	}
	if a, err := s.archiveOf(ctx, m); err == nil {
		d.Archive = &ArchiveInfo{Name: a.OriginalName, Kind: a.Kind, Size: a.Size, Hash: a.Hash, Retained: a.Retained()}
	}
	if m.Installation != "" {
		if inst, err := s.Installations.Get(ctx, m.Installation); err == nil {
			info := &InstallationInfo{ID: inst.ID, Installer: inst.Installer, Options: inst.Options, Files: len(inst.Files), CreatedAt: inst.CreatedAt}
			for _, f := range inst.Files {
				info.Size += f.Size
			}
			d.Installation = info
		}
	}
	if e, err := s.env(ctx, m.Instance); err == nil {
		for _, t := range e.def.ModTypes {
			d.ModTypes = append(d.ModTypes, ModTypeOption{ID: t.ID, Name: t.Name, Target: t.Target})
		}
	}
	return d, nil
}

// FileRow is one file of a mod (Inspector › Arquivos).
type FileRow struct {
	Path   string
	Target game.TargetID
	Size   int64
}

// FilesPage is a window of the files of a mod, filtered by the backend
// (core/00 §6: large lists are paged there).
type FilesPage struct {
	Total int
	Files []FileRow
}

// Files returns the files of the current installation matching filter.
func (s *Service) Files(ctx context.Context, id mod.ID, filter string, offset, limit int) (FilesPage, error) {
	m, err := s.Mods.Get(ctx, id)
	if err != nil {
		return FilesPage{}, err
	}
	if m.Installation == "" {
		return FilesPage{Files: []FileRow{}}, nil
	}
	inst, err := s.Installations.Get(ctx, m.Installation)
	if err != nil {
		return FilesPage{}, err
	}
	f := strings.ToLower(strings.TrimSpace(filter))
	var all []FileRow
	for _, file := range inst.Files {
		if f != "" && !strings.Contains(file.Dest.Path.Key(), f) {
			continue
		}
		all = append(all, FileRow{Path: file.Dest.Path.String(), Target: file.Dest.Target, Size: file.Size})
	}
	if limit <= 0 || limit > 5000 {
		limit = 5000
	}
	offset = min(max(offset, 0), len(all))
	end := min(offset+limit, len(all))
	return FilesPage{Total: len(all), Files: append([]FileRow{}, all[offset:end]...)}, nil
}

// History returns the events about a mod, newest first (Inspector ›
// Histórico; the full history projection is F9).
func (s *Service) History(ctx context.Context, id mod.ID, limit int) ([]event.Event, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	return s.Events.BySubject(ctx, event.EntityRef{Kind: subjectMod, ID: string(id)}, limit)
}

// ModFolder returns the staging folder of a mod for "open folder"; the path
// is never taken from the caller.
func (s *Service) ModFolder(ctx context.Context, id mod.ID) (string, error) {
	m, err := s.Mods.Get(ctx, id)
	if err != nil {
		return "", err
	}
	e, err := s.env(ctx, m.Instance)
	if err != nil {
		return "", err
	}
	p := e.modFolder(id)
	if info, err := s.FS.Stat(ctx, p); err != nil || !info.Exists {
		return "", fail(games.CodeFolderMissing, err, "folder", "mod")
	}
	return p, nil
}

// ArchiveFolder returns the ArchiveStore folder of a mod's archive.
func (s *Service) ArchiveFolder(ctx context.Context, id mod.ID) (string, error) {
	m, err := s.Mods.Get(ctx, id)
	if err != nil {
		return "", err
	}
	a, err := s.archiveOf(ctx, m)
	if err != nil || !a.Retained() {
		return "", fail(games.CodeFolderMissing, err, "folder", "archive")
	}
	e, err := s.env(ctx, m.Instance)
	if err != nil {
		return "", err
	}
	p := game.JoinPath(e.inst.ArchiveStore, archiveDir(a))
	if info, err := s.FS.Stat(ctx, p); err != nil || !info.Exists {
		return "", fail(games.CodeFolderMissing, err, "folder", "archive")
	}
	return p, nil
}
