package library

import (
	"context"
	"errors"
	"strconv"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
)

// StagingCheck is what was found in the staging folder of an installed mod
// (staging_file_missing / staging_file_modified, core/10 §1.1). Modified
// means the size differs from the installation record.
type StagingCheck struct {
	Mod          mod.ID
	Name         string
	Installation mod.InstallationID
	// FolderMissing: the whole folder of the mod is gone.
	FolderMissing bool
	Missing       []game.Location
	Modified      []game.Location
	// Deep is true when every file was checked, false when only the
	// folder was.
	Deep bool
}

// Broken reports whether the staging differs from the installation.
func (c StagingCheck) Broken() bool {
	return c.FolderMissing || len(c.Missing) > 0 || len(c.Modified) > 0
}

// CheckStaging inspects the staging folders of the installed mods. The
// cheap form looks only at the folder of each mod; deep compares every
// file with the installation record ("Verificar agora",
// library.verifyStagingOnStartup). Nothing is changed.
func (s *Service) CheckStaging(ctx context.Context, instance game.InstanceID, deep bool) ([]StagingCheck, error) {
	e, err := s.env(ctx, instance)
	if err != nil {
		return nil, err
	}
	list, err := s.Mods.ListByInstance(ctx, instance)
	if err != nil {
		return nil, err
	}
	var out []StagingCheck
	for _, m := range list {
		if m.State != mod.StateInstalled || m.Installation == "" {
			continue
		}
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		c, err := s.checkMod(ctx, e, m, deep)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, nil
}

func (s *Service) checkMod(ctx context.Context, e env, m *mod.Mod, deep bool) (StagingCheck, error) {
	c := StagingCheck{Mod: m.ID, Name: m.DisplayName(), Installation: m.Installation, Deep: deep}
	folder := e.modFolder(m.ID)
	info, err := s.FS.Stat(ctx, folder)
	if err != nil {
		return c, err
	}
	if !info.Exists || !info.IsDir {
		c.FolderMissing = true
		return c, nil
	}
	if !deep {
		return c, nil
	}
	inst, err := s.Installations.Get(ctx, m.Installation)
	if err != nil {
		return c, err
	}
	for _, f := range inst.Files {
		fi, err := s.FS.Stat(ctx, game.JoinPath(folder, f.Source.String()))
		switch {
		case err != nil:
			return c, err
		case !fi.Exists || fi.IsDir:
			c.Missing = append(c.Missing, f.Dest)
		case fi.Size != f.Size:
			c.Modified = append(c.Modified, f.Dest)
		}
	}
	return c, nil
}

// AcceptStaging records the staging of a mod as it is now ("Aceitar"):
// missing files leave the installation and modified files keep their new
// size (the hash is dropped until computed again). Installations are
// immutable, so the mod gets a new one; nothing on disk changes.
func (s *Service) AcceptStaging(ctx context.Context, instance game.InstanceID, id mod.ID) error {
	e, err := s.env(ctx, instance)
	if err != nil {
		return err
	}
	m, err := s.Mods.Get(ctx, id)
	if errors.Is(err, ports.ErrNotFound) || (err == nil && m.Instance != instance) {
		return fail(CodeModNotFound, err, "mod", string(id))
	}
	if err != nil {
		return err
	}
	if m.State != mod.StateInstalled {
		return fail(CodeModBusy, nil, "mod", m.DisplayName())
	}
	folder := e.modFolder(id)
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		m, err := tx.Mods().Get(ctx, id)
		if err != nil {
			return err
		}
		cur, err := tx.Installations().Get(ctx, m.Installation)
		if err != nil {
			return err
		}
		var (
			files            []mod.File
			missing, changed int
		)
		for _, f := range cur.Files {
			fi, err := s.FS.Stat(ctx, game.JoinPath(folder, f.Source.String()))
			if err != nil {
				return err
			}
			if !fi.Exists || fi.IsDir {
				missing++
				continue
			}
			if fi.Size != f.Size {
				f.Size, f.Hash = fi.Size, ""
				changed++
			}
			files = append(files, f)
		}
		if missing == 0 && changed == 0 {
			return nil
		}
		inst, err := s.replaceInstallation(ctx, tx, m, cur, cur.Installer, files)
		if err != nil {
			return err
		}
		tx.Emit(s.newEvent(EventModFilesUpdated, subjectMod, string(m.ID), "", map[string]string{
			"name": m.DisplayName(), "installation": string(inst.ID), "reason": "staging_accepted",
			"missing": strconv.Itoa(missing), "modified": strconv.Itoa(changed),
		}))
		return nil
	})
}

// ArchiveMissing reports, for the mods whose archive is retained in the
// ArchiveStore, the ones whose file is no longer there (mod_archive_missing).
func (s *Service) ArchiveMissing(ctx context.Context, instance game.InstanceID) ([]*mod.Mod, error) {
	e, err := s.env(ctx, instance)
	if err != nil {
		return nil, err
	}
	list, err := s.Mods.ListByInstance(ctx, instance)
	if err != nil {
		return nil, err
	}
	var out []*mod.Mod
	for _, m := range list {
		if m.State == mod.StateRemoved || m.Archive == "" {
			continue
		}
		a, err := s.archiveOf(ctx, m)
		if errors.Is(err, ports.ErrNotFound) {
			continue
		}
		if err != nil {
			return nil, err
		}
		if !a.Retained() {
			continue
		}
		info, err := s.FS.Stat(ctx, e.archivePath(a))
		if err != nil {
			return nil, err
		}
		if !info.Exists {
			out = append(out, m)
		}
	}
	return out, nil
}
