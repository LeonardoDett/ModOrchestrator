package deployment

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"slices"
	"strconv"
	"strings"

	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/deployplan"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/relpath"
)

// markBatch is how many journal marks are written per transaction (core/04
// §5 "marca como concluída no journal em lotes"); cancellation is honoured
// between batches.
const markBatch = 256

// failureParamLimit bounds the locations carried by an operation error.
const failureParamLimit = 50

// run is the state of one deploy or purge.
type run struct {
	inst      game.Instance
	kind      operation.Kind
	auto      bool
	reconcile bool
	t         *operations.Tracker
	in        *inputs
	desired   deployplan.Desired
	applied   *deployment.Manifest
	scanned   scanned
	plan      deployplan.Plan
	skip      map[string]bool
	accepted  map[string]bool
	journal   *deployment.Journal
	failures  []Failure
	raced     int
	// untouched counts external changes left as they are by the decision
	// of this run: they still diverge after it.
	untouched int
	cancelled bool
	before    string // status before the run
	// inline runs inside another operation (move staging, change method):
	// no steps of its own are reported.
	inline bool
}

func (r *run) skipStep(ctx context.Context, name string) error {
	if r.inline {
		return nil
	}
	return r.t.SkipStep(ctx, name)
}

func (r *run) progress(ctx context.Context, cur, total int64) {
	if !r.inline {
		_ = r.t.Progress(ctx, cur, total)
	}
}

// Deploy starts a deploy of the active profile. It returns the operation at
// once; the UI follows it through operation events and opens the plan
// dialog if it stops at await_decision.
func (s *Service) Deploy(ctx context.Context, instance game.InstanceID) (operation.ID, error) {
	return s.start(ctx, instance, KindDeploy, false, false)
}

// AutoDeploy is the deploy triggered by a change of the desired state
// (D036): it never waits for a decision and never writes when one is
// needed (INV-DEP-06).
func (s *Service) AutoDeploy(ctx context.Context, instance game.InstanceID) (operation.ID, error) {
	return s.start(ctx, instance, KindDeploy, true, false)
}

// Reconcile recovers an interrupted deploy or purge: it records what the
// journal observably did (never a blind undo, D035) and then runs the same
// operation again from the observed state.
func (s *Service) Reconcile(ctx context.Context, instance game.InstanceID) (operation.ID, error) {
	if _, err := s.Journals.Pending(ctx, instance); errors.Is(err, ports.ErrNotFound) {
		return "", fail(CodeNoJournal, nil, "instance", string(instance))
	} else if err != nil {
		return "", err
	}
	return s.start(ctx, instance, KindDeploy, false, true)
}

// Purge removes from the game everything the manifest records and puts the
// originals back (core/04 §6). Mods stay installed.
func (s *Service) Purge(ctx context.Context, instance game.InstanceID) (operation.ID, error) {
	h, err := s.Manifests.Header(ctx, instance)
	if errors.Is(err, ports.ErrNotFound) || (err == nil && h.Purged()) {
		return "", fail(CodeNothingToPurge, nil, "instance", string(instance))
	}
	if err != nil {
		return "", err
	}
	return s.start(ctx, instance, KindPurge, false, false)
}

func (s *Service) start(ctx context.Context, instance game.InstanceID, kind operation.Kind, auto, reconcile bool) (operation.ID, error) {
	inst, err := s.instance(ctx, instance)
	if err != nil {
		return "", err
	}
	holder := holderDeploy
	if kind == KindPurge {
		holder = holderPurge
	}
	release, err := s.Locks.Acquire(instance, holder)
	if err != nil {
		return "", err
	}
	if !reconcile {
		if _, err := s.Journals.Pending(ctx, instance); err == nil {
			release()
			return "", fail(CodeInterrupted, nil, "instance", inst.DisplayName)
		} else if !errors.Is(err, ports.ErrNotFound) {
			release()
			return "", err
		}
	}
	t, err := s.Ops.Enqueue(ctx, operations.Spec{Kind: kind, Subject: event.EntityRef{Kind: subjectInstance, ID: string(instance)}, Steps: pipelineSteps})
	if err != nil {
		release()
		return "", err
	}
	r := &run{inst: inst, kind: kind, auto: auto, reconcile: reconcile, t: t}
	runCtx, cancel := context.WithCancel(context.WithoutCancel(ctx))
	s.running.Add(1)
	go func() {
		defer s.running.Done()
		defer release()
		defer cancel()
		s.mu.Lock()
		s.cancelFns[instance] = cancel
		s.mu.Unlock()
		_ = s.Ops.Execute(runCtx, t, func(ctx context.Context, t *operations.Tracker) error {
			return s.pipeline(ctx, r)
		})
		s.mu.Lock()
		delete(s.cancelFns, instance)
		s.mu.Unlock()
	}()
	return t.ID(), nil
}

// RunSync runs a deploy (or purge) and waits for it (tests, launch).
func (s *Service) RunSync(ctx context.Context, instance game.InstanceID, kind operation.Kind) (operation.ID, error) {
	var id operation.ID
	var err error
	if kind == KindPurge {
		id, err = s.Purge(ctx, instance)
	} else {
		id, err = s.Deploy(ctx, instance)
	}
	if err != nil {
		return "", err
	}
	s.Wait()
	return id, nil
}

func (s *Service) pipeline(ctx context.Context, r *run) error {
	r.before = s.statusKey(ctx, r.inst.ID)
	if err := s.stepReconcile(ctx, r); err != nil {
		return err
	}
	if err := s.step(ctx, r, StepPreflight, func() error { return s.preflight(ctx, r) }); err != nil {
		return err
	}
	if err := s.step(ctx, r, StepScan, func() error { return s.scanStep(ctx, r) }); err != nil {
		return err
	}
	if err := s.step(ctx, r, StepPlan, func() error { return s.planStep(ctx, r) }); err != nil {
		return err
	}
	if err := s.awaitDecision(ctx, r); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err // cancelled before anything was written
	}
	work := slices.ContainsFunc(r.plan.Actions, func(a deployment.Action) bool { return a.Kind != deployment.ActionKeep })
	if work {
		if err := s.step(ctx, r, StepJournal, func() error { return s.journalStep(ctx, r) }); err != nil {
			return err
		}
		// From here the run always reaches commit: what was done is
		// recorded even if the user cancels between batches.
		if err := s.step(context.WithoutCancel(ctx), r, StepApply, func() error { return s.applyStep(ctx, r) }); err != nil {
			return err
		}
	} else {
		for _, st := range []string{StepJournal, StepApply} {
			if err := r.skipStep(ctx, st); err != nil {
				return err
			}
		}
	}
	final := context.WithoutCancel(ctx)
	var entries []deployment.Entry
	if err := s.step(final, r, StepVerify, func() error {
		entries = s.verify(final, r)
		return nil
	}); err != nil {
		return err
	}
	if err := s.step(final, r, StepCommit, func() error { return s.commitStep(final, r, entries) }); err != nil {
		return err
	}
	if err := s.step(final, r, StepPost, func() error { return s.post(final, r) }); err != nil {
		return err
	}
	return s.result(r)
}

func (s *Service) step(ctx context.Context, r *run, name string, fn func() error) error {
	if r.inline {
		return fn()
	}
	if err := r.t.BeginStep(ctx, name); err != nil {
		return err
	}
	if err := fn(); err != nil {
		e := opError(err)
		e.Step = name
		return e
	}
	return r.t.CompleteStep(ctx, name)
}

// stepReconcile settles an interrupted journal before planning (core/04 §5
// "Retomada após crash").
func (s *Service) stepReconcile(ctx context.Context, r *run) error {
	if !r.reconcile {
		return r.skipStep(ctx, StepReconcile)
	}
	return s.step(ctx, r, StepReconcile, func() error {
		j, err := s.Journals.Pending(ctx, r.inst.ID)
		if errors.Is(err, ports.ErrNotFound) {
			return nil
		}
		if err != nil {
			return err
		}
		if j.Kind == deployment.JournalPurge {
			r.kind = KindPurge
		}
		return s.settleJournal(ctx, r.inst, j, r.t.ID())
	})
}

// settleJournal records the observable effect of an interrupted journal,
// removes the temporary files it provably left and deletes it, in one
// transaction with the new manifest (INV-DEP-05).
func (s *Service) settleJournal(ctx context.Context, inst game.Instance, j *deployment.Journal, op operation.ID) error {
	prev, err := s.current(ctx, inst.ID)
	if err != nil {
		return err
	}
	for _, a := range j.Actions {
		if a.Kind == deployment.ActionReplaceManaged {
			if dst := targetPath(inst, a.Location); dst != "" {
				_ = s.clearTemp(ctx, inst, *a.Desired, tempPath(dst))
			}
		}
	}
	var prevEntries []deployment.Entry
	prof := j.Profile
	if prev != nil {
		prevEntries = prev.Entries()
		if prof == "" {
			prof = prev.Profile
		}
	}
	entries, _ := deployment.Settle(prevEntries, j, after{s: s, ctx: ctx, inst: inst})
	fp := deployment.Partial(j.Fingerprint)
	if j.Kind == deployment.JournalPurge {
		fp = deployment.Partial("purge")
	}
	// Folders stay recorded even after a purge journal: the purge that
	// follows removes them when empty.
	m, err := s.manifestOf(inst.ID, prof, fp, op, entries, false)
	if err != nil {
		return err
	}
	if err := s.writeMarkers(ctx, inst, m); err != nil {
		return err
	}
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		if err := tx.Manifests().Save(ctx, m, prev); err != nil {
			return err
		}
		if err := tx.Journals().Delete(ctx, inst.ID); err != nil {
			return err
		}
		tx.Emit(s.newEvent(EventApplied, inst.ID, op, map[string]string{"reconciled": "true", "entries": strconv.Itoa(len(entries))}))
		return nil
	})
}

// manifestOf builds the manifest to save. A purge that removed every file
// records a purge; folders the manager created that still hold someone
// else's files are forgotten then (never removed, INV-DEP-09).
func (s *Service) manifestOf(instance game.InstanceID, prof deployment.ProfileID, fp deployment.Fingerprint, op operation.ID, entries []deployment.Entry, purge bool) (*deployment.Manifest, error) {
	if purge && !slices.ContainsFunc(entries, func(e deployment.Entry) bool { return e.Kind != deployment.KindDir }) {
		return deployment.NewPurged(instance, op, s.Clock.Now())
	}
	if prof == "" {
		prof = "unknown"
	}
	return deployment.NewManifest(instance, prof, fp, op, s.Clock.Now(), entries)
}

func (s *Service) current(ctx context.Context, instance game.InstanceID) (*deployment.Manifest, error) {
	m, err := s.Manifests.Current(ctx, instance)
	if errors.Is(err, ports.ErrNotFound) {
		return nil, nil
	}
	return m, err
}

// preflight checks the global preconditions of core/04 §4.
func (s *Service) preflight(ctx context.Context, r *run) error {
	if code, reason := s.stagingProblem(ctx, r.inst); code != "" {
		return fail(code, nil, "folder", r.inst.Staging, "reason", reason)
	}
	var err error
	if r.applied, err = s.current(ctx, r.inst.ID); err != nil {
		return err
	}
	if r.in, err = s.loadInputs(ctx, r.inst.ID); err != nil {
		return err
	}
	if r.kind == KindPurge {
		return nil
	}
	if found, err := s.Foreign.CheckForeign(ctx, r.inst); err != nil {
		return err
	} else if len(found) > 0 {
		f := found[0]
		return fail(CodeForeign, nil, "kind", string(f.Kind), "target", string(f.Target), "name", f.Name)
	}
	if c, cyclic := r.in.rules.Cycle(); cyclic {
		return fail(CodeRuleCycle, nil, "count", strconv.Itoa(len(c.Items)))
	}
	return nil
}

// stagingProblem reports a staging that is missing or not provably the
// instance's (core/04 §4, D058).
func (s *Service) stagingProblem(ctx context.Context, inst game.Instance) (code, reason string) {
	if obs := s.observe(ctx, inst.Staging); !obs.Exists || !obs.IsDir {
		return CodeStagingMissing, "missing"
	}
	owner, ok := s.markerOwner(ctx, game.JoinPath(inst.Staging, game.StagingMarker))
	switch {
	case !ok:
		return CodeStagingForeign, "unreadable"
	case owner != inst.ID:
		return CodeStagingForeign, "other_instance"
	}
	return "", ""
}

func (s *Service) markerOwner(ctx context.Context, path string) (game.InstanceID, bool) {
	rc, err := s.FS.Open(ctx, path)
	if err != nil {
		return "", false
	}
	defer rc.Close()
	data, err := io.ReadAll(io.LimitReader(rc, 64<<10))
	if err != nil {
		return "", false
	}
	owner, err := game.ParseMarker(data)
	return owner, err == nil
}

func (s *Service) scanStep(ctx context.Context, r *run) error {
	avail := s.availability(ctx, r.inst, r.inst.Staging, r.inst.PreferredMethod == game.MethodSymlink)
	if r.kind == KindPurge {
		r.desired = deployplan.Desired{Profile: deployment.ProfileID(r.in.profile.ID())}
	} else {
		d, err := s.desired(ctx, r.in, avail)
		if err != nil {
			return err
		}
		r.desired = d
	}
	sc, err := s.scan(ctx, r.inst, r.desired, r.applied)
	if err != nil {
		return err
	}
	r.scanned = sc
	return nil
}

func (s *Service) planInput(ctx context.Context, r *run) deployplan.Input {
	in := deployplan.Input{
		Desired: r.desired, Applied: r.applied, Observed: r.scanned.files, Dirs: r.scanned.dirs,
		BlockedTargets: r.scanned.blocked, Skip: r.skip, AcceptedFallbacks: r.accepted,
		CleanDirs:  s.boolSetting(ctx, r.inst.ID, "deploy.cleanEmptyDirs", true),
		BackupPath: s.backupPathFor(ctx, r.inst),
	}
	if r.kind == KindPurge {
		in = deployplan.PurgeInput(in)
	}
	return in
}

// backupPathFor places the original of a location in the BackupStore under
// its target and path, with a numbered suffix if a file already sits there
// (an existing backup is never overwritten).
func (s *Service) backupPathFor(ctx context.Context, inst game.Instance) func(game.Location) relpath.Path {
	return func(loc game.Location) relpath.Path {
		base := string(loc.Target) + "/" + loc.Path.String()
		for n := 0; ; n++ {
			cand := base
			if n > 0 {
				cand = base + ".backup" + strconv.Itoa(n)
			}
			p := relpath.MustParse(cand)
			if obs := s.observe(ctx, backupFile(inst, p)); !obs.Exists && !obs.Unreadable || n > 100 {
				return p
			}
		}
	}
}

func (s *Service) planStep(ctx context.Context, r *run) error {
	r.plan = deployplan.Build(s.planInput(ctx, r))
	s.mu.Lock()
	s.changes[r.inst.ID] = len(r.plan.Changes)
	s.mu.Unlock()
	if extra := r.plan.Summary.ExtraBytes; extra > 0 {
		for _, t := range r.inst.Targets {
			if free, err := s.FS.FreeSpace(ctx, t.Path); err == nil && free < extra {
				return fail(CodeDiskFull, nil, "needed", strconv.FormatInt(extra, 10), "free", strconv.FormatInt(free, 10))
			}
		}
	}
	events := []event.Event{s.newEvent(EventPlanned, r.inst.ID, r.t.ID(), summaryPayload(r.plan.Summary))}
	if n := len(r.plan.Changes); n > 0 {
		events = append(events, s.newEvent(EventExternalChanges, r.inst.ID, r.t.ID(), map[string]string{"count": strconv.Itoa(n), "first": r.plan.Changes[0].Location.String()}))
	}
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		tx.Emit(events...)
		return nil
	})
}

func summaryPayload(sm deployplan.Summary) map[string]string {
	return map[string]string{
		"create": strconv.Itoa(sm.Create), "replace": strconv.Itoa(sm.Replace), "remove": strconv.Itoa(sm.Remove),
		"backup": strconv.Itoa(sm.BackupAndCreate), "restore": strconv.Itoa(sm.RestoreBackup), "keep": strconv.Itoa(sm.Keep),
		"decisions": strconv.Itoa(sm.Decisions),
	}
}

func (s *Service) journalStep(ctx context.Context, r *run) error {
	kind := deployment.JournalDeploy
	if r.kind == KindPurge {
		kind = deployment.JournalPurge
	}
	j, err := deployment.NewJournal(r.inst.ID, r.t.ID(), kind, r.desired.Profile, r.desired.Fingerprint, r.plan.Actions, s.Clock.Now())
	if err != nil {
		return err
	}
	r.journal = j
	// INV-DEP-03: the plan is durable before the first filesystem change.
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error { return tx.Journals().Save(ctx, j) })
}

func (s *Service) applyStep(ctx context.Context, r *run) error {
	j := r.journal
	total := int64(len(j.Actions))
	batch := map[int]deployment.ActionState{}
	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		err := s.Journals.Mark(context.WithoutCancel(ctx), r.inst.ID, batch)
		batch = map[int]deployment.ActionState{}
		return err
	}
	for i, a := range j.Actions {
		if i%markBatch == 0 && i > 0 {
			if err := flush(); err != nil {
				return err
			}
			r.progress(context.WithoutCancel(ctx), int64(i), total)
			if ctx.Err() != nil {
				r.cancelled = true
				break
			}
		}
		err := s.execute(context.WithoutCancel(ctx), r.inst, a)
		state := deployment.StateDone
		switch {
		case errors.Is(err, errRaced):
			// Nothing was written: the location stays out of this run.
			state = deployment.StateSkipped
			r.raced++
			r.failures = append(r.failures, Failure{Location: a.Location, Action: a.Kind, Code: CodeRaced})
		case err != nil:
			// Attempted: verify observes whatever it left (never assumed).
			r.failures = append(r.failures, Failure{Location: a.Location, Action: a.Kind, Code: fileErrorCode(err), Detail: err.Error()})
		}
		_ = j.Mark(i, state)
		batch[i] = state
		if s.afterAction != nil {
			s.afterAction(i)
		}
	}
	if err := flush(); err != nil {
		return err
	}
	r.progress(context.WithoutCancel(ctx), total, total)
	return nil
}

// verify confirms every action by observation (core/04 §5 `verify`) and
// derives the entries the manifest will record (INV-DEP-05).
func (s *Service) verify(ctx context.Context, r *run) []deployment.Entry {
	var prev []deployment.Entry
	if r.applied != nil {
		prev = r.applied.Entries()
	}
	if r.journal == nil {
		return prev
	}
	entries, outcomes := deployment.Settle(prev, r.journal, after{s: s, ctx: ctx, inst: r.inst})
	failed := map[int]bool{}
	for _, f := range r.failures {
		for i, a := range r.journal.Actions {
			if a.Location.Key() == f.Location.Key() && a.Kind == f.Action {
				failed[i] = true
			}
		}
	}
	for _, o := range outcomes {
		a := r.journal.Actions[o.Index]
		if o.Done || failed[o.Index] || r.journal.State(o.Index) != deployment.StateDone {
			continue
		}
		switch a.Kind {
		case deployment.ActionRemoveDir:
			continue // a folder that still holds files simply stays
		}
		r.failures = append(r.failures, Failure{Location: a.Location, Action: a.Kind, Code: CodeVerifyFailed})
	}
	return entries
}

func (s *Service) commitStep(ctx context.Context, r *run, entries []deployment.Entry) error {
	purge := r.kind == KindPurge
	complete := r.plan.Complete() && len(r.failures) == 0 && !r.cancelled
	fp := r.desired.Fingerprint
	if purge {
		fp = deployment.Partial("purge")
	}
	if !complete && !purge {
		fp = deployment.Partial(fp)
	}
	switch {
	case purge:
		if r.journal == nil && (r.applied == nil || r.applied.Purged()) {
			return nil
		}
	case r.journal == nil && r.applied != nil && !r.applied.Purged() && r.applied.Profile == r.desired.Profile && r.applied.Fingerprint == fp:
		return nil // nothing changed: INV-DEP-04, no new manifest
	}
	m, err := s.manifestOf(r.inst.ID, r.desired.Profile, fp, r.t.ID(), entries, purge)
	if err != nil {
		return err
	}
	if err := s.writeMarkers(ctx, r.inst, m); err != nil {
		return err
	}
	payload := map[string]string{"entries": strconv.Itoa(len(entries)), "failed": strconv.Itoa(len(r.failures)), "profile": string(r.desired.Profile)}
	for k, v := range summaryPayload(r.plan.Summary) {
		payload[k] = v
	}
	evType := EventApplied
	switch {
	case purge:
		evType = EventPurged
	case len(r.failures) > r.raced:
		evType = EventFailed
	}
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		if err := tx.Manifests().Save(ctx, m, r.applied); err != nil {
			return err
		}
		if r.journal != nil {
			if err := tx.Journals().Delete(ctx, r.inst.ID); err != nil {
				return err
			}
		}
		tx.Emit(s.newEvent(evType, r.inst.ID, r.t.ID(), payload))
		return nil
	})
}

// deploymentMarker is the content of <target>/.modorchestrator-deployment.json
// (core/04 §11): evidence of ownership, the database stays primary.
type deploymentMarker struct {
	InstanceID string `json:"instanceId"`
	Kind       string `json:"kind"`
	ProfileID  string `json:"profileId"`
	AppliedAt  string `json:"appliedAt"`
	Manifest   string `json:"manifest"`
}

// writeMarkers writes the deployment marker in every target that holds
// entries and removes ours from targets that hold none.
func (s *Service) writeMarkers(ctx context.Context, inst game.Instance, m *deployment.Manifest) error {
	used := map[game.TargetID]bool{}
	for _, t := range m.Targets() {
		used[t] = true
	}
	done := map[string]bool{}
	for _, t := range inst.Targets {
		path := game.JoinPath(t.Path, game.DeploymentMarker)
		if done[game.CleanAbs(path)] {
			continue
		}
		if used[t.ID] {
			done[game.CleanAbs(path)] = true
			body, _ := json.Marshal(deploymentMarker{
				InstanceID: string(inst.ID), Kind: "deployment", ProfileID: string(m.Profile),
				AppliedAt: m.AppliedAt.UTC().Format("2006-01-02T15:04:05Z"), Manifest: string(m.Fingerprint),
			})
			if err := s.FS.WriteFile(ctx, path, body); err != nil {
				return fail(fileErrorCode(err), err, "path", path)
			}
		}
	}
	for _, t := range inst.Targets {
		path := game.JoinPath(t.Path, game.DeploymentMarker)
		if done[game.CleanAbs(path)] {
			continue
		}
		if owner, ok := s.markerOwner(ctx, path); ok && owner == inst.ID {
			if err := s.FS.Remove(ctx, path); err != nil {
				return fail(fileErrorCode(err), err, "path", path)
			}
		}
	}
	return nil
}

func (s *Service) post(ctx context.Context, r *run) error {
	s.mu.Lock()
	if !r.plan.NeedsDecision() || len(r.skip) > 0 {
		delete(s.needsDecision, r.inst.ID)
	}
	var real []Failure
	for _, f := range r.failures {
		if f.Code != CodeRaced {
			real = append(real, f)
		}
	}
	if len(real) > 0 {
		s.failures[r.inst.ID] = real
	} else {
		delete(s.failures, r.inst.ID)
	}
	s.changes[r.inst.ID] = len(r.plan.Changes) + r.raced + r.untouched
	s.mu.Unlock()
	after := s.statusKey(ctx, r.inst.ID)
	if after == r.before {
		return nil
	}
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		tx.Emit(s.newEvent(EventStatusChanged, r.inst.ID, r.t.ID(), map[string]string{"from": r.before, "to": after}))
		return nil
	})
}

// result is the outcome of the operation: failed with the locations when
// some could not be applied (core/04 §5 "Falhas parciais"), cancelled when
// the user stopped it between batches.
func (s *Service) result(r *run) error {
	var real []Failure
	for _, f := range r.failures {
		if f.Code != CodeRaced {
			real = append(real, f)
		}
	}
	if len(real) > 0 {
		locs := make([]string, 0, failureParamLimit)
		codes := make([]string, 0, failureParamLimit)
		for i, f := range real {
			if i == failureParamLimit {
				break
			}
			locs = append(locs, f.Location.String())
			codes = append(codes, f.Code)
		}
		return &operation.Error{
			Code: CodeDeployFailed, Message: "some locations could not be applied", Step: StepApply, Retryable: true,
			Params: map[string]string{"count": strconv.Itoa(len(real)), "first": real[0].Location.String(), "reason": real[0].Code,
				"locations": strings.Join(locs, "\n"), "codes": strings.Join(codes, "\n")},
		}
	}
	if r.cancelled {
		return context.Canceled
	}
	return nil
}
