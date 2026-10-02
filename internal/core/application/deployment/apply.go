package deployment

import (
	"context"
	"errors"
	"path"

	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/game"
)

// errRaced means the location diverged between the scan and the action (a
// tool wrote it in the meantime): the action is skipped and recorded, the
// location is left untouched (core/04 §5 "revalida a evidência").
var errRaced = errors.New("deployment: location changed since the scan")

// execute applies one journal action after checking, right before acting,
// that the location still is what the plan saw (INV-DEP-01, INV-EXT-01).
func (s *Service) execute(ctx context.Context, inst game.Instance, a deployment.Action) error {
	dst := targetPath(inst, a.Location)
	if dst == "" {
		return fail(CodeTargetUnavail, nil, "target", string(a.Location.Target))
	}
	obs := s.observe(ctx, dst)
	if obs.Unreadable {
		return errRaced
	}
	switch a.Kind {
	case deployment.ActionRemoveManaged:
		if !obs.Exists {
			return nil // already gone; verify drops the entry
		}
		if obs.IsDir || !a.Current.Evidence.Matches(obs.Evidence, a.Current.Method) {
			return errRaced
		}
		return s.FS.Remove(ctx, dst)

	case deployment.ActionRestoreBackup:
		if obs.Exists {
			return errRaced // something else sits there: never overwritten
		}
		return s.FS.Rename(ctx, backupFile(inst, a.Current.BackupPath), dst)

	case deployment.ActionMkdir:
		if obs.Exists {
			return errRaced // not created by the manager: never recorded as ours
		}
		return s.FS.MkdirAll(ctx, dst)

	case deployment.ActionBackupAndCreate:
		if !obs.Exists || obs.IsDir || !a.Backup.Evidence.SameOriginal(obs.Evidence) {
			return errRaced
		}
		bp := backupFile(inst, a.Backup.BackupPath)
		if err := s.FS.MkdirAll(ctx, parentPath(bp)); err != nil {
			return err
		}
		if s.observe(ctx, bp).Exists {
			return errRaced // a stale backup is never overwritten
		}
		if err := s.FS.Rename(ctx, dst, bp); err != nil {
			return err
		}
		if err := s.link(ctx, inst, *a.Desired, dst); err != nil {
			// Put the original back so the game never loses the file; if
			// that fails too, it stays safe in the BackupStore and verify
			// records it.
			_ = s.FS.Rename(ctx, bp, dst)
			return err
		}
		return nil

	case deployment.ActionSetAside:
		// Only the file the user saw and decided about moves; it is kept
		// in the BackupStore, never deleted (D046, INV-DEP-01).
		if !obs.Exists || obs.IsDir || !a.Backup.Evidence.SameOriginal(obs.Evidence) {
			return errRaced
		}
		bp := backupFile(inst, a.Backup.BackupPath)
		if err := s.FS.MkdirAll(ctx, parentPath(bp)); err != nil {
			return err
		}
		if s.observe(ctx, bp).Exists {
			return errRaced
		}
		return s.FS.Rename(ctx, dst, bp)

	case deployment.ActionCreate:
		if obs.Exists {
			return errRaced
		}
		return s.link(ctx, inst, *a.Desired, dst)

	case deployment.ActionReplaceManaged:
		if !obs.Exists || obs.IsDir || !a.Current.Evidence.Matches(obs.Evidence, a.Current.Method) {
			return errRaced
		}
		tmp := tempPath(dst)
		if err := s.clearTemp(ctx, inst, *a.Desired, tmp); err != nil {
			return err
		}
		if err := s.link(ctx, inst, *a.Desired, tmp); err != nil {
			return err
		}
		// Renamed over the old file: the location is never empty.
		if err := s.FS.Rename(ctx, tmp, dst); err != nil {
			_ = s.FS.Remove(ctx, tmp)
			return err
		}
		return nil

	case deployment.ActionRemoveDir:
		return s.FS.RemoveEmptyDir(ctx, dst)
	}
	return nil
}

// link materialises a staged file at dst with the entry's method.
func (s *Service) link(ctx context.Context, inst game.Instance, e deployment.Entry, dst string) error {
	src := sourcePath(inst, e)
	switch e.Method {
	case game.MethodHardlink:
		return s.FS.Hardlink(ctx, src, dst)
	case game.MethodSymlink:
		return s.FS.Symlink(ctx, src, dst)
	case game.MethodCopy:
		return s.FS.Copy(ctx, src, dst)
	}
	return fail(CodeMethodUnavail, nil, "method", string(e.Method), "reason", "unsupported")
}

// clearTemp removes a temporary file left by an interrupted replacement,
// only when it provably is the manager's: the planned file itself.
func (s *Service) clearTemp(ctx context.Context, inst game.Instance, want deployment.Entry, tmp string) error {
	obs := s.observe(ctx, tmp)
	if !obs.Exists {
		return nil
	}
	exp, ok := after{s: s, ctx: ctx, inst: inst}.Expected(want)
	if !ok || obs.IsDir || !exp.Matches(obs.Evidence, want.Method) {
		return errRaced
	}
	return s.FS.Remove(ctx, tmp)
}

// parentPath returns the folder of a Windows or slash path.
func parentPath(p string) string {
	for i := len(p) - 1; i >= 0; i-- {
		if p[i] == '\\' || p[i] == '/' {
			return p[:i]
		}
	}
	return path.Dir(p)
}
