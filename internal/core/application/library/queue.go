package library

import (
	"context"
	"errors"
	"path"
	"slices"
	"strings"

	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/fomod"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/installer"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
)

// Decision kinds of the import queue. Root and FOMOD decisions use the
// installer's kinds (root_ambiguous, root_unrecognized, fomod_script,
// fomod).
const (
	DecisionDuplicateArchive = "duplicate_archive"
	DecisionDuplicateName    = "duplicate_name"
	DecisionSuspiciousRatio  = "suspicious_ratio"
)

// Answer choices.
const (
	ChoiceReinstall = "reinstall"
	ChoiceVariant   = "variant"
	ChoiceReplace   = "replace"
	ChoiceContinue  = "continue"
	ChoiceRoot      = "root"
	ChoiceInstall   = "install"
	ChoiceCancel    = "cancel"
)

// DuplicateMod is a mod the imported archive may duplicate.
type DuplicateMod struct {
	ID      mod.ID
	Name    string
	Version string
}

// Decision is what an import waits for (DLG-04, DLG-05). It lives in memory
// only: if the app closes, the operation becomes interrupted and nothing
// was written beyond what recovery cleans (D064).
type Decision struct {
	Kind string
	// Duplicates and SuggestedLabel serve duplicate decisions.
	Duplicates     []DuplicateMod
	SuggestedLabel string
	// Candidates and Folders serve root decisions ("" is the archive root).
	Candidates []string
	Folders    []string
	// Ratio is the extracted/compressed ratio of a suspicious archive.
	Ratio int64
	// Fomod describes the wizard of a fomod decision (DLG-06); its state is
	// read with FomodState.
	Fomod *FomodDecision
}

// Choices returns the answers the decision accepts.
func (d Decision) Choices() []string {
	switch d.Kind {
	case DecisionDuplicateArchive:
		return []string{ChoiceReinstall, ChoiceVariant, ChoiceCancel}
	case DecisionDuplicateName:
		return []string{ChoiceReplace, ChoiceVariant, ChoiceCancel}
	case DecisionSuspiciousRatio:
		return []string{ChoiceContinue, ChoiceCancel}
	case string(installer.DecisionFomod):
		return []string{ChoiceInstall, ChoiceCancel}
	}
	return []string{ChoiceRoot, ChoiceCancel}
}

// Answer is the user's decision.
type Answer struct {
	Choice string
	// Mod is the existing mod to reinstall or replace.
	Mod mod.ID
	// Label names a new variant.
	Label string
	// Root is the chosen root folder.
	Root string
	// Fomod is the wizard selection (visited groups) and Requirements the
	// detected requirements the user confirmed (files), for "install".
	Fomod        fomod.Selection
	Requirements []string
}

// QueueItem is one entry of the visible install queue (core/00 §5).
type QueueItem struct {
	Operation   operation.ID
	Kind        operation.Kind
	Label       string
	Status      operation.Status
	Step        string
	Decision    *Decision
	Cancellable bool
}

type job struct {
	tracker  *operations.Tracker
	instance game.InstanceID
	kind     operation.Kind
	label    string
	source   string // import: file or folder path
	mod      mod.ID // install/reinstall

	started     bool
	cancelled   bool
	cancel      context.CancelFunc
	cancellable bool
	decision    *Decision
	answer      chan Answer
	// fomod is the wizard session while a fomod decision is pending.
	fomod *fomodSession
}

type queue struct {
	jobs    []*job
	release func()
}

// ImportFiles queues one import per path (files or folders, D048) and
// returns their operation ids. If the queue of the instance is already
// running the items are appended to it (D038's explicit exception); any
// other mutating operation holding the instance refuses with instance_busy.
func (s *Service) ImportFiles(ctx context.Context, instance game.InstanceID, paths []string) ([]operation.ID, error) {
	if _, err := s.Instances.Get(ctx, instance); err != nil {
		return nil, err
	}
	var jobs []*job
	for _, p := range paths {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		jobs = append(jobs, &job{instance: instance, kind: KindImport, label: baseName(p), source: p})
	}
	return s.enqueue(ctx, instance, jobs)
}

// InstallMods installs imported mods (status "not installed") from their
// retained archives.
func (s *Service) InstallMods(ctx context.Context, instance game.InstanceID, ids []mod.ID) ([]operation.ID, error) {
	return s.queueMods(ctx, instance, ids, KindInstall, mod.StateImported)
}

// ReinstallMods reinstalls installed mods from their retained archives,
// repeating the recorded options (core/02 §7).
func (s *Service) ReinstallMods(ctx context.Context, instance game.InstanceID, ids []mod.ID) ([]operation.ID, error) {
	return s.queueMods(ctx, instance, ids, KindReinstall, mod.StateInstalled)
}

func (s *Service) queueMods(ctx context.Context, instance game.InstanceID, ids []mod.ID, kind operation.Kind, want mod.State) ([]operation.ID, error) {
	var jobs []*job
	for _, id := range ids {
		m, err := s.Mods.Get(ctx, id)
		if err != nil {
			return nil, err
		}
		if m.Instance != instance {
			return nil, fail("not_found", nil, "mod", string(id))
		}
		if m.State != want {
			return nil, fail(CodeModBusy, nil, "mod", m.DisplayName())
		}
		if a, err := s.archiveOf(ctx, m); err != nil || !a.Retained() {
			return nil, fail(CodeArchiveMissing, err, "mod", m.DisplayName())
		}
		jobs = append(jobs, &job{instance: instance, kind: kind, label: m.DisplayName(), mod: id})
	}
	return s.enqueue(ctx, instance, jobs)
}

func (s *Service) enqueue(ctx context.Context, instance game.InstanceID, jobs []*job) ([]operation.ID, error) {
	if len(jobs) == 0 {
		return nil, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	q := s.queues[instance]
	start := false
	if q == nil {
		release, err := s.Locks.Acquire(instance, holderQueue)
		if err != nil {
			return nil, err
		}
		q = &queue{release: release}
		start = true
	}
	var ids []operation.ID
	for _, j := range jobs {
		steps := importSteps
		t, err := s.Ops.Enqueue(ctx, operations.Spec{Kind: j.kind, Subject: j.subject(), Steps: steps})
		if err != nil {
			if start && len(q.jobs) == 0 {
				q.release()
			}
			return ids, err
		}
		j.tracker, j.cancellable, j.answer = t, true, make(chan Answer, 1)
		q.jobs = append(q.jobs, j)
		ids = append(ids, t.ID())
	}
	if start {
		s.queues[instance] = q
		s.workers.Add(1)
		go s.work(instance, q)
	}
	return ids, nil
}

func (j *job) subject() event.EntityRef {
	if j.mod != "" {
		return event.EntityRef{Kind: subjectMod, ID: string(j.mod)}
	}
	return event.EntityRef{Kind: subjectInstance, ID: string(j.instance)}
}

// work processes the queue one item at a time under the instance lock and
// releases the lock when the queue is empty.
func (s *Service) work(instance game.InstanceID, q *queue) {
	defer s.workers.Done()
	for {
		s.mu.Lock()
		var next *job
		for _, j := range q.jobs {
			if !j.started && !j.cancelled {
				next = j
				break
			}
		}
		if next == nil {
			delete(s.queues, instance)
			q.release()
			s.mu.Unlock()
			return
		}
		ctx, cancel := context.WithCancel(context.Background())
		next.started, next.cancel = true, cancel
		s.mu.Unlock()

		_ = s.Ops.Execute(ctx, next.tracker, func(ctx context.Context, t *operations.Tracker) error {
			err := s.runJob(ctx, next)
			if err == nil || errors.Is(err, context.Canceled) {
				return err
			}
			return opError(err)
		})
		cancel()

		s.mu.Lock()
		q.jobs = slices.DeleteFunc(q.jobs, func(j *job) bool { return j == next })
		s.mu.Unlock()
	}
}

// Queue returns the visible install queue of an instance.
func (s *Service) Queue(instance game.InstanceID) []QueueItem {
	s.mu.Lock()
	defer s.mu.Unlock()
	q := s.queues[instance]
	if q == nil {
		return []QueueItem{}
	}
	out := make([]QueueItem, 0, len(q.jobs))
	for _, j := range q.jobs {
		if j.cancelled {
			continue
		}
		it := QueueItem{
			Operation: j.tracker.ID(), Kind: j.kind, Label: j.label, Status: j.tracker.Status(),
			Step: j.tracker.CurrentStep(), Cancellable: j.cancellable,
		}
		if j.decision != nil {
			d := *j.decision
			it.Decision = &d
		}
		out = append(out, it)
	}
	return out
}

// CancelQueued cancels one queue item: a pending item never starts; a
// running one stops if it has not reached stage (core/02 §3). Other items
// are not affected.
func (s *Service) CancelQueued(ctx context.Context, id operation.ID) error {
	s.mu.Lock()
	j := s.findJob(id)
	if j == nil {
		s.mu.Unlock()
		return fail("not_found", nil, "operation", string(id))
	}
	if !j.cancellable {
		s.mu.Unlock()
		return fail(CodeNotCancellable, nil, "operation", string(id))
	}
	if !j.started {
		j.cancelled = true
		s.mu.Unlock()
		return j.tracker.Cancel(ctx)
	}
	cancel := j.cancel
	s.mu.Unlock()
	cancel()
	return nil
}

// Resolve answers the decision an import is waiting for.
func (s *Service) Resolve(id operation.ID, a Answer) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	j := s.findJob(id)
	if j == nil || j.decision == nil {
		return fail(CodeNoDecision, nil, "operation", string(id))
	}
	if !slices.Contains(j.decision.Choices(), a.Choice) {
		return fail(CodeNoDecision, nil, "operation", string(id), "choice", a.Choice)
	}
	j.decision = nil
	j.answer <- a
	return nil
}

func (s *Service) findJob(id operation.ID) *job {
	for _, q := range s.queues {
		for _, j := range q.jobs {
			if j.tracker.ID() == id {
				return j
			}
		}
	}
	return nil
}

// ask publishes a decision and waits for the answer or the cancellation.
func (s *Service) ask(ctx context.Context, j *job, d Decision) (Answer, error) {
	s.mu.Lock()
	j.decision = &d
	s.mu.Unlock()
	// The event is a fact ("the import needs a decision") and the signal the
	// UI uses to reread the queue (D021).
	_ = s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		tx.Emit(s.newEvent(EventDecisionRequired, subjectInstance, string(j.instance), j.tracker.ID(), map[string]string{"kind": d.Kind}))
		return nil
	})
	select {
	case a := <-j.answer:
		if a.Choice == ChoiceCancel {
			return a, context.Canceled
		}
		return a, nil
	case <-ctx.Done():
		s.mu.Lock()
		j.decision = nil
		s.mu.Unlock()
		return Answer{}, ctx.Err()
	}
}

func (s *Service) setCancellable(j *job, v bool) {
	s.mu.Lock()
	j.cancellable = v
	s.mu.Unlock()
}

func baseName(p string) string {
	return path.Base(strings.TrimRight(strings.ReplaceAll(p, `\`, "/"), "/"))
}
