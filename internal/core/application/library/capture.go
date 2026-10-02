package library

import (
	"context"
	"slices"
	"strconv"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
)

// Installer names of installations the library records without an archive
// (core/09 §5).
const InstallerCaptured = "captured"

// Event types of the external change triage (core/09 §4–5).
const (
	EventModCaptured     event.Type = "mod.captured"
	EventModFilesUpdated event.Type = "mod.files_updated"
)

// UpdateInstalledFiles records new content of files that already live in
// the staging of m (a kept hardlink edit, or a file saved to the mod by the
// external change triage): a new installation replaces the files with the
// same destination and keeps the rest. Installations are immutable, so the
// mod points to the new one; the staging is not touched here.
func (s *Service) UpdateInstalledFiles(ctx context.Context, instance game.InstanceID, id mod.ID, files []mod.File) (mod.InstallationID, error) {
	var newID mod.InstallationID
	err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		m, err := tx.Mods().Get(ctx, id)
		if err != nil {
			return err
		}
		if m.Instance != instance || m.State != mod.StateInstalled {
			return fail(CodeModBusy, nil, "mod", m.DisplayName())
		}
		cur, err := tx.Installations().Get(ctx, m.Installation)
		if err != nil {
			return err
		}
		merged := mergeFiles(cur.Files, files)
		inst, err := s.replaceInstallation(ctx, tx, m, cur, cur.Installer, merged)
		if err != nil {
			return err
		}
		newID = inst.ID
		tx.Emit(s.newEvent(EventModFilesUpdated, subjectMod, string(m.ID), "", map[string]string{
			"name": m.DisplayName(), "installation": string(inst.ID), "files": strconv.Itoa(len(files)), "first": files[0].Dest.String(),
		}))
		return nil
	})
	return newID, err
}

// RegisterCapture records generated files the deploy engine moved into the
// staging folder of mod id (core/09 §5, D046). When the mod does not exist
// it is created with the given name, type and category ("Gerados"), the
// installer `captured` and no archive, enabled in the active profile at the
// end of the ModOrder (highest priority: tool outputs must win). Otherwise
// a new installation of the existing mod adds the files. Calling it again
// with files already recorded changes nothing (recovery).
func (s *Service) RegisterCapture(ctx context.Context, instance game.InstanceID, id mod.ID, name string, typ game.ModTypeID, category string, files []mod.File) (mod.InstallationID, error) {
	if len(files) == 0 {
		return "", fail(CodeInstallerFailed, nil, "name", name)
	}
	e, err := s.env(ctx, instance)
	if err != nil {
		return "", err
	}
	existing, err := s.Mods.Get(ctx, id)
	switch {
	case err == nil:
		return s.captureInto(ctx, existing, files)
	case !notFound(err):
		return "", err
	}
	mt, ok := e.def.ModType(typ)
	if !ok {
		return "", fail(CodeModTypeUnknown, nil, "type", string(typ))
	}
	catID, err := s.categoryNamed(ctx, instance, category)
	if err != nil {
		return "", err
	}
	now := s.Clock.Now()
	m, err := mod.New(id, instance, strings.TrimSpace(name), mod.Source{Kind: mod.SourceManualFile, Ref: InstallerCaptured}, now)
	if err != nil {
		return "", fail(CodeNameEmpty, err)
	}
	inst, err := mod.NewInstallation(mod.InstallationID(s.IDs.NewID()), id, instance, InstallerCaptured, nil, files, now)
	if err != nil {
		return "", fail(CodeInstallerFailed, err, "name", name)
	}
	active, _ := s.Profiles.Active(ctx, instance)
	edges := s.orderEdges(ctx, instance)
	err = s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		if err := m.SetType(mt.ID, now); err != nil {
			return err
		}
		if catID != "" {
			if err := m.SetCategory(catID, now); err != nil {
				return err
			}
		}
		m.Content = e.adapter.ContentFlags(e.inst.Game, inst.Footprint())
		if err := m.BeginInstall(now); err != nil {
			return err
		}
		if err := m.CompleteInstall(inst, now); err != nil {
			return err
		}
		if err := tx.Installations().Save(ctx, inst); err != nil {
			return err
		}
		if err := tx.Mods().Save(ctx, m); err != nil {
			return err
		}
		if err := addToProfiles(ctx, tx, m, active, true, edges, now); err != nil {
			return err
		}
		tx.Emit(s.newEvent(EventModCaptured, subjectMod, string(m.ID), "", map[string]string{
			"name": m.DisplayName(), "installation": string(inst.ID), "files": strconv.Itoa(len(files)), "new": "true",
		}))
		return nil
	})
	if err != nil {
		return "", err
	}
	return inst.ID, nil
}

func (s *Service) captureInto(ctx context.Context, m *mod.Mod, files []mod.File) (mod.InstallationID, error) {
	var newID mod.InstallationID
	err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		cur, err := tx.Mods().Get(ctx, m.ID)
		if err != nil {
			return err
		}
		if cur.State != mod.StateInstalled {
			return fail(CodeModBusy, nil, "mod", cur.DisplayName())
		}
		prev, err := tx.Installations().Get(ctx, cur.Installation)
		if err != nil {
			return err
		}
		if !slices.ContainsFunc(files, func(f mod.File) bool {
			old, ok := prev.FileAt(f.Dest)
			return !ok || old != f
		}) {
			newID = prev.ID // already recorded (recovery)
			return nil
		}
		inst, err := s.replaceInstallation(ctx, tx, cur, prev, prev.Installer, mergeFiles(prev.Files, files))
		if err != nil {
			return err
		}
		newID = inst.ID
		tx.Emit(s.newEvent(EventModCaptured, subjectMod, string(cur.ID), "", map[string]string{
			"name": cur.DisplayName(), "installation": string(inst.ID), "files": strconv.Itoa(len(files)), "new": "false",
		}))
		return nil
	})
	return newID, err
}

// replaceInstallation makes a new installation with files current for m.
func (s *Service) replaceInstallation(ctx context.Context, tx ports.Tx, m *mod.Mod, prev *mod.Installation, installerName string, files []mod.File) (*mod.Installation, error) {
	now := s.Clock.Now()
	inst, err := mod.NewInstallation(mod.InstallationID(s.IDs.NewID()), m.ID, m.Instance, installerName, prev.Options, files, now)
	if err != nil {
		return nil, fail(CodeInstallerFailed, err, "name", m.DisplayName())
	}
	if err := m.BeginInstall(now); err != nil {
		return nil, err
	}
	if err := m.CompleteInstall(inst, now); err != nil {
		return nil, err
	}
	if err := tx.Installations().Save(ctx, inst); err != nil {
		return nil, err
	}
	if err := tx.Installations().Delete(ctx, prev.ID); err != nil {
		return nil, err
	}
	return inst, tx.Mods().Save(ctx, m)
}

// mergeFiles replaces the files of base with the same destination and adds
// the others.
func mergeFiles(base, files []mod.File) []mod.File {
	out := slices.Clone(base)
	for _, f := range files {
		if i := slices.IndexFunc(out, func(b mod.File) bool { return b.Dest.Key() == f.Dest.Key() }); i >= 0 {
			out[i] = f
		} else {
			out = append(out, f)
		}
	}
	return out
}

// categoryNamed finds a root category by name (case insensitive) or creates
// it; an empty name means none.
func (s *Service) categoryNamed(ctx context.Context, instance game.InstanceID, name string) (mod.CategoryID, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", nil
	}
	tree, err := s.categoryTree(ctx, instance)
	if err != nil {
		return "", err
	}
	for _, c := range tree.Categories() {
		if c.Parent == "" && strings.EqualFold(c.Name, name) {
			return c.ID, nil
		}
	}
	return s.SaveCategory(ctx, instance, CategoryInput{Name: name, Order: len(tree.Categories())})
}
