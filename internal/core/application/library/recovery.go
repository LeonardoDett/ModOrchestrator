package library

import (
	"context"
	"errors"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
)

// Recover brings every instance back to a consistent library after the
// previous process stopped in the middle of an import, reinstall or removal
// (core/02 §3 "Retomada", D064). It never continues from the middle: it
// deletes temporary work and returns mods to their last committed state
// (INV-LIB-01). It runs at startup, after interrupted operations were
// marked, before any command is accepted. It only touches folders whose
// marker proves they belong to the instance (D058).
func (s *Service) Recover(ctx context.Context) error {
	instances, err := s.Instances.List(ctx)
	if err != nil {
		return err
	}
	var errs []error
	for _, inst := range instances {
		if err := s.recoverInstance(ctx, inst); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func (s *Service) recoverInstance(ctx context.Context, inst game.Instance) error {
	mods, err := s.Mods.ListByInstance(ctx, inst.ID)
	if err != nil {
		return err
	}
	byID := map[mod.ID]*mod.Mod{}
	for _, m := range mods {
		byID[m.ID] = m
	}
	if s.ownsFolder(ctx, inst.Staging, game.StagingMarker, inst.ID) {
		_ = s.FS.RemoveAll(ctx, game.JoinPath(inst.Staging, ".tmp"))
		entries, err := s.FS.ReadDir(ctx, inst.Staging)
		if err != nil {
			return err
		}
		names := map[string]bool{}
		for _, e := range entries {
			names[strings.ToLower(e.Name)] = true
		}
		for _, e := range entries {
			if !e.IsDir {
				continue
			}
			path := game.JoinPath(inst.Staging, e.Name)
			switch {
			case strings.HasSuffix(e.Name, ".installing"):
				_ = s.FS.RemoveAll(ctx, path)
			case strings.HasSuffix(e.Name, ".replaced"):
				id := mod.ID(strings.TrimSuffix(e.Name, ".replaced"))
				folder := game.JoinPath(inst.Staging, string(id))
				m := byID[id]
				if m != nil && m.State == mod.StateInstalling {
					// The swap happened but the commit did not: the old
					// content comes back.
					if names[strings.ToLower(string(id))] {
						_ = s.FS.RemoveAll(ctx, folder)
					}
					_ = s.FS.Rename(ctx, path, folder)
				} else {
					_ = s.FS.RemoveAll(ctx, path)
				}
			default:
				m := byID[mod.ID(e.Name)]
				switch {
				case m == nil:
					// Not a mod folder of this library: left alone.
				case m.State == mod.StateRemoved:
					_ = s.FS.RemoveAll(ctx, path)
				case m.State == mod.StateInstalling && m.Installation == "" && !names[strings.ToLower(e.Name)+".replaced"]:
					// First install placed but never committed.
					_ = s.FS.RemoveAll(ctx, path)
				}
			}
		}
	}
	if s.ownsFolder(ctx, inst.ArchiveStore, game.ArchivesMarker, inst.ID) {
		if err := s.recoverArchives(ctx, inst); err != nil {
			return err
		}
	}
	for _, m := range mods {
		if m.State != mod.StateInstalling {
			continue
		}
		err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
			cur, err := tx.Mods().Get(ctx, m.ID)
			if err != nil {
				return err
			}
			if err := cur.AbortInstall(s.Clock.Now()); err != nil {
				return err
			}
			tx.Emit(s.newEvent(EventModInstallAborted, subjectMod, string(m.ID), "", map[string]string{"name": cur.DisplayName(), "reason": "interrupted"}))
			return tx.Mods().Save(ctx, cur)
		})
		if err != nil {
			return err
		}
	}
	return nil
}

// recoverArchives deletes partial copies and the folders of imports that
// were interrupted before their archive was recorded. The folder name is the
// import operation id, which proves the library created it (D064).
func (s *Service) recoverArchives(ctx context.Context, inst game.Instance) error {
	entries, err := s.FS.ReadDir(ctx, inst.ArchiveStore)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if !e.IsDir {
			continue
		}
		path := game.JoinPath(inst.ArchiveStore, e.Name)
		if strings.HasSuffix(e.Name, ".partial") {
			_ = s.FS.RemoveAll(ctx, path)
			continue
		}
		if _, err := s.Archives.Get(ctx, mod.ArchiveID(e.Name)); err == nil || !notFound(err) {
			continue
		}
		op, err := s.Ops.Get(ctx, operation.ID(e.Name))
		if err != nil || op.Kind != KindImport || !op.Status.IsTerminal() {
			continue
		}
		_ = s.FS.RemoveAll(ctx, path)
	}
	return nil
}

// TempResult is what "Limpar arquivos temporários" did.
type TempResult struct {
	// Removed counts the temporary folders removed; Skipped the instances
	// left alone because an operation holds them.
	Removed, Skipped int
}

// CleanTemp removes the temporary work of operations that are not running
// (Settings › Workarounds "Limpar arquivos temporários", core/13): the
// operation folders below <staging>/.tmp and the "*.installing" folders,
// only in stagings whose marker proves they are the instance's (D058).
// Instances an operation holds are skipped, never waited for (D038).
func (s *Service) CleanTemp(ctx context.Context) (TempResult, error) {
	instances, err := s.Instances.List(ctx)
	if err != nil {
		return TempResult{}, err
	}
	var r TempResult
	for _, inst := range instances {
		release, err := s.Locks.Acquire(inst.ID, "clean_temp")
		if err != nil {
			r.Skipped++
			continue
		}
		r.Removed += s.cleanInstanceTemp(ctx, inst)
		release()
	}
	return r, nil
}

func (s *Service) cleanInstanceTemp(ctx context.Context, inst game.Instance) int {
	if !s.ownsFolder(ctx, inst.Staging, game.StagingMarker, inst.ID) {
		return 0
	}
	n := 0
	tmp := game.JoinPath(inst.Staging, ".tmp")
	if entries, err := s.FS.ReadDir(ctx, tmp); err == nil {
		n += len(entries)
		_ = s.FS.RemoveAll(ctx, tmp)
	}
	entries, err := s.FS.ReadDir(ctx, inst.Staging)
	if err != nil {
		return n
	}
	for _, e := range entries {
		if e.IsDir && strings.HasSuffix(e.Name, ".installing") {
			if s.FS.RemoveAll(ctx, game.JoinPath(inst.Staging, e.Name)) == nil {
				n++
			}
		}
	}
	return n
}
