package deployment

import (
	"context"
	"slices"
	"strconv"

	"modorchestrator/internal/core/domain/deployplan"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/operation"
)

// viewLimit bounds the items listed per group of a plan view; counts are
// always complete.
const viewLimit = 500

// PlanView is the plan as the deploy dialog shows it (DLG-14): counts per
// action and what needs a decision (DLG-15 rows).
type PlanView struct {
	Instance  game.InstanceID
	Operation operation.ID
	Kind      operation.Kind
	Summary   deployplan.Summary
	// Changes lists external changes to managed files first, then the
	// generated files found around them.
	Changes   []ChangeView
	Blocked   []BlockedView
	Fallbacks []FallbackView
	// Totals before truncation. ChangeCount counts managed changes (they
	// need a decision); NewFileCount the generated files (they never stop
	// the run, D080).
	ChangeCount, BlockedCount, NewFileCount int
	// Empty: nothing to do (INV-DEP-04).
	Empty bool
}

// BlockedView is a location that cannot be written now.
type BlockedView struct {
	Location game.Location
	Reason   deployplan.BlockReason
}

// FallbackView is a group of locations waiting for a method decision.
type FallbackView struct {
	Key      string
	Target   game.TargetID
	From, To game.DeploymentMethod
	Count    int
	Sample   []game.Location
}

func (s *Service) planView(r *run) PlanView {
	v := PlanView{Instance: r.inst.ID, Operation: r.t.ID(), Kind: r.kind, Summary: r.plan.Summary, Empty: r.plan.Empty(),
		ChangeCount: len(r.plan.Changes), BlockedCount: len(r.plan.Blocked), NewFileCount: len(r.unexpected)}
	return s.fillView(v, r)
}

func (s *Service) fillView(v PlanView, r *run) PlanView {
	p := r.plan
	v.Changes = s.views(p.Changes, r.unexpected, r.in)
	for i, b := range p.Blocked {
		if i == viewLimit {
			break
		}
		v.Blocked = append(v.Blocked, BlockedView{Location: b.Location, Reason: b.Reason})
	}
	for _, f := range p.Fallbacks {
		fv := FallbackView{Key: f.Key(), Target: f.Target, From: f.From, To: f.To, Count: len(f.Locations)}
		for i, l := range f.Locations {
			if i == 20 {
				break
			}
			fv.Sample = append(fv.Sample, l)
		}
		v.Fallbacks = append(v.Fallbacks, fv)
	}
	return v
}

// waiting is a deploy stopped at await_decision.
type waiting struct {
	view  PlanView
	reply chan reply
}

type reply struct {
	accepted  map[string]bool
	decisions []DecisionInput
	cancel    bool
}

// awaitDecision stops the run when the plan needs a decision (core/04 §5).
// Decisions given in advance (review outside a deploy, automatic restore
// of missing files) are applied first. Auto-deploy ends here as blocked
// without writing anything (INV-DEP-06). The user's answer carries one
// action per external change (DLG-15) and the accepted fallback groups;
// whatever stays undecided is left untouched in this run.
func (s *Service) awaitDecision(ctx context.Context, r *run) error {
	if r.plan.NeedsDecision() || len(r.pre) > 0 {
		if pre := slices.Concat(r.pre, s.autoRestore(ctx, r)); len(pre) > 0 {
			source := "review"
			if len(r.pre) == 0 {
				source = "auto"
			}
			if err := s.applyDecisions(ctx, r, pre, false, source); err != nil {
				e := opError(err)
				e.Step = StepAwaitDecision
				return e
			}
		}
	}
	if !r.plan.NeedsDecision() {
		s.mu.Lock()
		delete(s.needsDecision, r.inst.ID)
		s.mu.Unlock()
		if r.inline || len(r.pre) == 0 {
			return r.skipStep(ctx, StepAwaitDecision)
		}
		if err := r.t.BeginStep(ctx, StepAwaitDecision); err != nil {
			return err
		}
		return r.t.CompleteStep(ctx, StepAwaitDecision)
	}
	if r.inline {
		return fail(CodePurgeIncomplete, nil, "changes", strconv.Itoa(len(r.plan.Changes)), "blocked", strconv.Itoa(len(r.plan.Blocked)))
	}
	if r.auto {
		s.mu.Lock()
		s.needsDecision[r.inst.ID] = true
		s.mu.Unlock()
		if err := r.t.BeginStep(ctx, StepAwaitDecision); err != nil {
			return err
		}
		return &operation.Error{Code: CodeNeedsDecision, Message: "the plan needs a decision", Step: StepAwaitDecision,
			Params: map[string]string{"changes": strconv.Itoa(len(r.plan.Changes)), "blocked": strconv.Itoa(len(r.plan.Blocked)), "fallbacks": strconv.Itoa(len(r.plan.Fallbacks))}}
	}
	if err := r.t.BeginStep(ctx, StepAwaitDecision); err != nil {
		return err
	}
	w := &waiting{view: s.planView(r), reply: make(chan reply, 1)}
	s.mu.Lock()
	s.decisions[r.inst.ID] = w
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		if s.decisions[r.inst.ID] == w {
			delete(s.decisions, r.inst.ID)
		}
		s.mu.Unlock()
	}()
	var got reply
	select {
	case got = <-w.reply:
	case <-ctx.Done():
		return ctx.Err()
	}
	if got.cancel {
		return context.Canceled
	}
	r.accepted = got.accepted
	if err := s.applyDecisions(ctx, r, got.decisions, true, "user"); err != nil {
		e := opError(err)
		e.Step = StepAwaitDecision
		return e
	}
	s.mu.Lock()
	delete(s.needsDecision, r.inst.ID)
	s.mu.Unlock()
	return r.t.CompleteStep(ctx, StepAwaitDecision)
}

// PendingDecision returns the plan of a deploy waiting for a decision.
func (s *Service) PendingDecision(instance game.InstanceID) (PlanView, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	w, ok := s.decisions[instance]
	if !ok {
		return PlanView{}, false
	}
	return w.view, true
}

// ResolveDecision continues a waiting deploy: the listed fallback groups use
// the proposed method and each external change gets the chosen action
// (DLG-15); everything else that needed a decision is left untouched in
// this run.
func (s *Service) ResolveDecision(instance game.InstanceID, op operation.ID, acceptFallbacks []string, decisions []DecisionInput) error {
	accepted := map[string]bool{}
	for _, k := range acceptFallbacks {
		accepted[k] = true
	}
	return s.answer(instance, op, reply{accepted: accepted, decisions: decisions})
}

// CancelDecision cancels a waiting deploy; nothing was written.
func (s *Service) CancelDecision(instance game.InstanceID, op operation.ID) error {
	return s.answer(instance, op, reply{cancel: true})
}

func (s *Service) answer(instance game.InstanceID, op operation.ID, r reply) error {
	s.mu.Lock()
	w, ok := s.decisions[instance]
	if ok && w.view.Operation == op {
		delete(s.decisions, instance)
	}
	s.mu.Unlock()
	if !ok || w.view.Operation != op {
		return fail(CodeDecisionGone, nil, "operation", string(op))
	}
	w.reply <- r
	return nil
}

// Cancel stops the running deploy or purge of an instance: before the
// journal nothing was written; during apply the run stops between batches
// and records what was done.
func (s *Service) Cancel(instance game.InstanceID) bool {
	s.mu.Lock()
	cancel, ok := s.cancelFns[instance]
	s.mu.Unlock()
	if ok {
		cancel()
	}
	return ok
}

// Preview computes the plan without running anything (popover "see what
// the deploy will do", DLG-14 without decisions). It only reads.
func (s *Service) Preview(ctx context.Context, instance game.InstanceID, purge bool) (PlanView, error) {
	inst, err := s.instance(ctx, instance)
	if err != nil {
		return PlanView{}, err
	}
	r := &run{inst: inst, kind: KindDeploy}
	if purge {
		r.kind = KindPurge
	}
	if code, reason := s.stagingProblem(ctx, inst); code != "" {
		return PlanView{}, fail(code, nil, "folder", inst.Staging, "reason", reason)
	}
	if r.applied, err = s.current(ctx, instance); err != nil {
		return PlanView{}, err
	}
	if r.in, err = s.loadInputs(ctx, instance); err != nil {
		return PlanView{}, err
	}
	if err := s.scanStep(ctx, r); err != nil {
		return PlanView{}, err
	}
	r.plan = deployplan.Build(s.planInput(ctx, r))
	s.enrich(ctx, r.inst, r.in, r.applied, r.plan.Changes)
	s.mu.Lock()
	s.changes[instance] = len(r.plan.Changes)
	s.newFiles[instance] = len(r.unexpected)
	s.mu.Unlock()
	v := PlanView{Instance: instance, Kind: r.kind, Summary: r.plan.Summary, Empty: r.plan.Empty(),
		ChangeCount: len(r.plan.Changes), BlockedCount: len(r.plan.Blocked), NewFileCount: len(r.unexpected)}
	return s.fillView(v, r), nil
}
