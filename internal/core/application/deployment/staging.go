package deployment

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strconv"
	"strings"

	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/operation"
)

// stateMoves is the app_state key of staging moves in flight: a move is
// valid at its origin until the instance is saved with the destination;
// recovery discards whichever side lost (core/04 §10).
const stateMoves = "deployment.stagingMoves"

type moveRecord struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// StagingPreview is what DLG-18 shows before moving the staging.
type StagingPreview struct {
	From, To string
	// Bytes is the size of the installed mods to move.
	Bytes int64
	Free  int64
	// Deployed: a purge runs first and a deploy after.
	Deployed bool
	// SameVolume: files are moved as hardlinks (no extra space).
	SameVolume bool
	// HardlinkAfter: hardlink deploy is possible from the destination.
	HardlinkAfter bool
	// Problem is the code that refuses the move ("" when none).
	Problem string
	Reason  string
}

// PreviewMoveStaging validates a new staging folder and estimates the move.
func (s *Service) PreviewMoveStaging(ctx context.Context, instance game.InstanceID, to string) (StagingPreview, error) {
	inst, err := s.instance(ctx, instance)
	if err != nil {
		return StagingPreview{}, err
	}
	p := StagingPreview{From: inst.Staging, To: cleanFolder(to)}
	if code, reason := s.checkNewStaging(ctx, inst, p.To); code != "" {
		p.Problem, p.Reason = code, reason
	}
	sums, err := s.Installations.Summaries(ctx, instance)
	if err != nil {
		return StagingPreview{}, err
	}
	for _, sm := range sums {
		p.Bytes += sm.Size
	}
	if h, err := s.Manifests.Header(ctx, instance); err == nil {
		p.Deployed = h.Entries > 0
	}
	p.SameVolume, _ = s.FS.SameVolume(ctx, inst.Staging, p.To)
	p.Free, _ = s.FS.FreeSpace(ctx, p.To)
	moved := inst
	moved.Staging = p.To
	for _, m := range s.methodsFor(ctx, moved, p.To) {
		if m.Method == game.MethodHardlink {
			p.HardlinkAfter = m.Available
		}
	}
	if p.Problem == "" && !p.SameVolume && p.Free < p.Bytes {
		p.Problem, p.Reason = CodeDiskFull, ""
	}
	return p, nil
}

func cleanFolder(p string) string {
	p = strings.ReplaceAll(strings.TrimSpace(p), "/", `\`)
	return strings.TrimRight(p, `\`)
}

// checkNewStaging applies the folder rules of D058 and INV-LIB-03 to a new
// staging: absolute, different, not overlapping the game, its targets, the
// other folders of the instance or of other instances; missing or empty.
func (s *Service) checkNewStaging(ctx context.Context, inst game.Instance, to string) (code, reason string) {
	if game.Volume(to) == "" {
		return CodeFolderInvalid, "not_absolute"
	}
	if game.SamePath(to, inst.Staging) {
		return CodeStagingSame, ""
	}
	moved := inst
	moved.Staging = to
	if err := moved.Validate(); err != nil {
		return CodeFolderInvalid, "overlap"
	}
	if game.Overlaps(to, inst.Staging) {
		return CodeFolderInvalid, "overlap"
	}
	all, err := s.Instances.List(ctx)
	if err != nil {
		return CodeFolderInvalid, "unknown"
	}
	for _, o := range all {
		if o.ID == inst.ID {
			continue
		}
		for _, f := range []string{o.Staging, o.ArchiveStore, o.BackupStore, o.Root} {
			if game.Overlaps(to, f) {
				return CodeFolderInvalid, "other_instance"
			}
		}
	}
	obs := s.observe(ctx, to)
	switch {
	case obs.Unreadable:
		return CodeStagingForeign, "unreadable"
	case obs.Exists && !obs.IsDir:
		return CodeFolderInvalid, "not_directory"
	case obs.Exists:
		entries, err := s.FS.ReadDir(ctx, to)
		if err != nil {
			return CodeStagingForeign, "unreadable"
		}
		if len(entries) > 0 {
			return CodeStagingForeign, "not_empty"
		}
	}
	return "", ""
}

// MoveStaging moves the staging folder (core/04 §10): purge if deployed,
// copy folder by folder with verification (hardlinks on the same volume),
// save the instance, remove the old folder, and deploy again if it was
// deployed. Interrupted, the staging stays valid at its origin.
func (s *Service) MoveStaging(ctx context.Context, instance game.InstanceID, to string) (operation.ID, error) {
	inst, err := s.instance(ctx, instance)
	if err != nil {
		return "", err
	}
	to = cleanFolder(to)
	if code, reason := s.checkNewStaging(ctx, inst, to); code != "" {
		return "", fail(code, nil, "folder", to, "reason", reason)
	}
	return s.startMaintenance(ctx, inst, KindMoveStaging, holderMove, []string{StepValidate, StepPurge, StepCopy, StepSave, StepCleanup},
		func(ctx context.Context, t *operations.Tracker, deployed bool) error {
			return s.moveStaging(ctx, t, inst, to, deployed)
		})
}

// ChangeMethod switches the preferred deployment method of an instance:
// purge with the old method, save, deploy with the new one (core/04 §6).
func (s *Service) ChangeMethod(ctx context.Context, instance game.InstanceID, m game.DeploymentMethod) (operation.ID, error) {
	inst, err := s.instance(ctx, instance)
	if err != nil {
		return "", err
	}
	if !m.Valid() {
		return "", fail(CodeMethodUnavail, nil, "method", string(m), "reason", "unsupported")
	}
	if m == inst.PreferredMethod {
		return "", fail(CodeMethodSame, nil, "method", string(m))
	}
	for _, st := range s.methodsFor(ctx, inst, inst.Staging) {
		if st.Method == m && !st.Available {
			return "", fail(CodeMethodUnavail, nil, "method", string(m), "reason", st.Reason)
		}
	}
	return s.startMaintenance(ctx, inst, KindChangeMethod, holderMethod, []string{StepValidate, StepPurge, StepSave},
		func(ctx context.Context, t *operations.Tracker, _ bool) error {
			if err := t.BeginStep(ctx, StepSave); err != nil {
				return err
			}
			cur, err := s.instance(ctx, inst.ID)
			if err != nil {
				return err
			}
			old := cur.PreferredMethod
			cur.PreferredMethod = m
			if err := s.Instances.Save(ctx, cur); err != nil {
				return err
			}
			if err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
				tx.Emit(s.newEvent(EventMethodChanged, inst.ID, t.ID(), map[string]string{"from": string(old), "to": string(m)}))
				return nil
			}); err != nil {
				return err
			}
			return t.CompleteStep(ctx, StepSave)
		})
}

// startMaintenance runs an operation that needs the game purged first and
// deploys again afterwards (as its own operation, so a decision can be
// asked in the usual dialog).
func (s *Service) startMaintenance(ctx context.Context, inst game.Instance, kind operation.Kind, holder string, steps []string,
	body func(ctx context.Context, t *operations.Tracker, deployed bool) error) (operation.ID, error) {
	release, err := s.Locks.Acquire(inst.ID, holder)
	if err != nil {
		return "", err
	}
	if _, err := s.Journals.Pending(ctx, inst.ID); err == nil {
		release()
		return "", fail(CodeInterrupted, nil, "instance", inst.DisplayName)
	}
	deployed := false
	if h, err := s.Manifests.Header(ctx, inst.ID); err == nil {
		deployed = h.Entries > 0
	}
	t, err := s.Ops.Enqueue(ctx, operations.Spec{Kind: kind, Subject: event.EntityRef{Kind: subjectInstance, ID: string(inst.ID)}, Steps: steps})
	if err != nil {
		release()
		return "", err
	}
	s.running.Add(1)
	go func() {
		defer s.running.Done()
		bg := context.WithoutCancel(ctx)
		err := s.Ops.Execute(bg, t, func(ctx context.Context, t *operations.Tracker) error {
			if err := t.BeginStep(ctx, StepValidate); err != nil {
				return err
			}
			if err := t.CompleteStep(ctx, StepValidate); err != nil {
				return err
			}
			if err := s.inlinePurge(ctx, t, inst, deployed); err != nil {
				return err
			}
			return body(ctx, t, deployed)
		})
		release()
		if err == nil && deployed {
			if _, err := s.Deploy(bg, inst.ID); err != nil {
				s.mu.Lock()
				s.needsDecision[inst.ID] = true
				s.mu.Unlock()
			}
		}
	}()
	return t.ID(), nil
}

// inlinePurge runs the purge pipeline inside a maintenance operation; it
// refuses to continue if anything stays in the game (external changes are
// never resolved silently).
func (s *Service) inlinePurge(ctx context.Context, t *operations.Tracker, inst game.Instance, deployed bool) error {
	if !deployed {
		return t.SkipStep(ctx, StepPurge)
	}
	if err := t.BeginStep(ctx, StepPurge); err != nil {
		return err
	}
	r := &run{inst: inst, kind: KindPurge, t: t, inline: true}
	if err := s.pipeline(ctx, r); err != nil {
		e := opError(err)
		e.Step = StepPurge
		return e
	}
	if h, err := s.Manifests.Header(ctx, inst.ID); err == nil && h.Entries > 0 {
		return &operation.Error{Code: CodePurgeIncomplete, Step: StepPurge, Message: "files remain in the game", Params: map[string]string{"count": strconv.Itoa(h.Entries)}}
	}
	return t.CompleteStep(ctx, StepPurge)
}

func (s *Service) moveStaging(ctx context.Context, t *operations.Tracker, inst game.Instance, to string, _ bool) error {
	if err := t.BeginStep(ctx, StepCopy); err != nil {
		return err
	}
	if err := s.recordMove(ctx, inst.ID, &moveRecord{From: inst.Staging, To: to}); err != nil {
		return err
	}
	if err := s.FS.MkdirAll(ctx, to); err != nil {
		return fail(fileErrorCode(err), err, "folder", to)
	}
	if err := s.FS.WriteFile(ctx, game.JoinPath(to, game.StagingMarker), game.NewFolderMarker("staging", inst.ID)); err != nil {
		return fail(fileErrorCode(err), err, "folder", to)
	}
	same, _ := s.FS.SameVolume(ctx, inst.Staging, to)
	var files []string
	if err := s.walk(ctx, inst.Staging, "", &files); err != nil {
		return err
	}
	for i, rel := range files {
		if ctx.Err() != nil {
			return ctx.Err() // the origin is still the staging; recovery discards the copy
		}
		if err := s.copyVerified(ctx, game.JoinPath(inst.Staging, rel), game.JoinPath(to, rel), same); err != nil {
			return fail(fileErrorCode(err), err, "path", rel)
		}
		if i%markBatch == 0 {
			_ = t.Progress(ctx, int64(i), int64(len(files)))
		}
	}
	if err := t.CompleteStep(ctx, StepCopy); err != nil {
		return err
	}
	// Commit point: from now on the destination is the staging.
	if err := t.BeginStep(ctx, StepSave); err != nil {
		return err
	}
	cur, err := s.instance(ctx, inst.ID)
	if err != nil {
		return err
	}
	cur.Staging = to
	if err := s.Instances.Save(ctx, cur); err != nil {
		return err
	}
	if err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		tx.Emit(s.newEvent(EventStagingMoved, inst.ID, t.ID(), map[string]string{"from": inst.Staging, "to": to, "files": strconv.Itoa(len(files))}))
		return nil
	}); err != nil {
		return err
	}
	if err := t.CompleteStep(ctx, StepSave); err != nil {
		return err
	}
	if err := t.BeginStep(ctx, StepCleanup); err != nil {
		return err
	}
	s.discardFolder(ctx, inst.ID, inst.Staging)
	if err := s.recordMove(ctx, inst.ID, nil); err != nil {
		return err
	}
	return t.CompleteStep(ctx, StepCleanup)
}

// walk lists the files below dir (relative paths), skipping the marker and
// leftovers of interrupted imports, which belong to the old place.
func (s *Service) walk(ctx context.Context, root, rel string, out *[]string) error {
	dir := root
	if rel != "" {
		dir = game.JoinPath(root, rel)
	}
	entries, err := s.FS.ReadDir(ctx, dir)
	if err != nil {
		return fail(CodeStagingMissing, err, "folder", dir)
	}
	for _, e := range entries {
		name := e.Name
		if rel == "" && (strings.EqualFold(name, game.StagingMarker) || name == ".tmp" || strings.HasSuffix(name, ".installing") || strings.HasPrefix(name, ".modorchestrator-probe-")) {
			continue
		}
		child := name
		if rel != "" {
			child = rel + `\` + name
		}
		if e.IsDir {
			if err := s.walk(ctx, root, child, out); err != nil {
				return err
			}
			continue
		}
		*out = append(*out, child)
	}
	return nil
}

func (s *Service) copyVerified(ctx context.Context, src, dst string, same bool) error {
	if err := s.FS.MkdirAll(ctx, parentPath(dst)); err != nil {
		return err
	}
	if obs := s.observe(ctx, dst); obs.Exists {
		if err := s.FS.Remove(ctx, dst); err != nil { // left by a failed attempt inside our own new folder
			return err
		}
	}
	a := s.observe(ctx, src)
	var err error
	if same {
		err = s.FS.Hardlink(ctx, src, dst)
	} else {
		err = s.FS.Copy(ctx, src, dst)
	}
	if err != nil {
		return err
	}
	b := s.observe(ctx, dst)
	if !b.Exists || b.Evidence.Size != a.Evidence.Size || (same && a.Evidence.FileID != b.Evidence.FileID) {
		return fail(CodeVerifyFailed, nil, "path", dst)
	}
	return nil
}

// discardFolder removes a staging folder only if its marker proves it is
// the instance's (D058).
func (s *Service) discardFolder(ctx context.Context, instance game.InstanceID, dir string) {
	if owner, ok := s.markerOwner(ctx, game.JoinPath(dir, game.StagingMarker)); ok && owner == instance {
		_ = s.FS.RemoveAll(ctx, dir)
	}
}

func (s *Service) moves(ctx context.Context) (map[string]moveRecord, error) {
	raw, err := s.State.Get(ctx, stateMoves)
	if errors.Is(err, ports.ErrNotFound) {
		return map[string]moveRecord{}, nil
	}
	if err != nil {
		return nil, err
	}
	out := map[string]moveRecord{}
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return map[string]moveRecord{}, nil
	}
	return out, nil
}

func (s *Service) recordMove(ctx context.Context, instance game.InstanceID, rec *moveRecord) error {
	all, err := s.moves(ctx)
	if err != nil {
		return err
	}
	if rec == nil {
		delete(all, string(instance))
	} else {
		all[string(instance)] = *rec
	}
	if len(all) == 0 {
		err := s.State.Delete(ctx, stateMoves)
		if errors.Is(err, ports.ErrNotFound) {
			return nil
		}
		return err
	}
	body, _ := json.Marshal(all)
	return s.State.Set(ctx, stateMoves, string(body))
}

// Recover finishes or discards staging moves interrupted by a previous
// process: before the instance was saved the copy is discarded, after it
// the old folder is. Only folders whose marker proves ownership are
// removed. Interrupted captures of generated files are finished (the user
// decided them, core/09 §5). Deploy journals are not touched: they wait
// for the user's "Reconcile now" (core/14 §5).
func (s *Service) Recover(ctx context.Context) error {
	if err := s.recoverCaptures(ctx); err != nil {
		return err
	}
	all, err := s.moves(ctx)
	if err != nil {
		return err
	}
	ids := make([]string, 0, len(all))
	for id := range all {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	for _, id := range ids {
		rec := all[id]
		inst, err := s.Instances.Get(ctx, game.InstanceID(id))
		switch {
		case errors.Is(err, ports.ErrNotFound):
		case err != nil:
			return err
		case game.SamePath(inst.Staging, rec.To):
			s.discardFolder(ctx, inst.ID, rec.From)
		default:
			s.discardFolder(ctx, inst.ID, rec.To)
		}
		if err := s.recordMove(ctx, game.InstanceID(id), nil); err != nil {
			return err
		}
	}
	return nil
}
