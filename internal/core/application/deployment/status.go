package deployment

import (
	"context"
	"errors"
	"slices"
	"strings"
	"time"

	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/deploystate"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/profile"
	"modorchestrator/internal/core/domain/relpath"
)

// ProfileRef names a profile for the status ("Implantado: A · Ativo: B").
type ProfileRef struct {
	ID   string
	Name string
}

// StatusView is the deployment status of an instance (core/04 §7) with what
// the topbar, the Overview and the plan popover need. It is calculated on
// every read; nothing here is persisted (anti-pattern 13).
type StatusView struct {
	Instance       game.InstanceID
	Status         deploystate.Status
	ActiveProfile  ProfileRef
	AppliedProfile ProfileRef
	AppliedAt      time.Time
	Method         game.DeploymentMethod
	Entries        int
	// Busy names the work holding the instance lock ("" when free).
	Busy string
	// PendingDecision is the deploy waiting at await_decision.
	PendingDecision operation.ID
	ExternalChanges int
	// NewFiles counts generated files found in managed folders (core/09
	// `unexpected`): they need a review but never block (D080).
	NewFiles int
	Foreign  []games.Finding
	Failures []Failure
	// StagingProblem is staging_missing / staging_foreign ("" when fine);
	// JournalPending means a deploy or purge was interrupted (D035).
	StagingProblem string
	JournalPending bool
	// Incompatible names the first pair of enabled incompatible mods.
	Incompatible []string
	// Running lists the game processes running now.
	Running []string
}

// Status derives the deployment status.
func (s *Service) Status(ctx context.Context, instance game.InstanceID) (StatusView, error) {
	in, err := s.loadInputs(ctx, instance)
	if err != nil {
		return StatusView{}, err
	}
	v := StatusView{Instance: instance, Method: in.inst.PreferredMethod, ActiveProfile: ProfileRef{ID: string(in.profile.ID()), Name: in.profile.Name()}}
	input := deploystate.Input{ActiveProfile: deployment.ProfileID(in.profile.ID()), Desired: in.fingerprint, Verified: true}
	h, err := s.Manifests.Header(ctx, instance)
	switch {
	case err == nil:
		input.Applied = &h
		v.AppliedAt, v.Entries = h.AppliedAt, h.Entries
		v.AppliedProfile = ProfileRef{ID: string(h.Profile)}
		if p, err := s.Profiles.Get(ctx, profile.ID(h.Profile)); err == nil {
			v.AppliedProfile.Name = p.Name()
		}
	case !errors.Is(err, ports.ErrNotFound):
		return StatusView{}, err
	}
	journals, err := s.Journals.Instances(ctx)
	if err != nil {
		return StatusView{}, err
	}
	input.JournalPending = slices.Contains(journals, instance)
	v.JournalPending = input.JournalPending
	if v.Foreign, err = s.Foreign.CheckForeign(ctx, in.inst); err != nil {
		return StatusView{}, err
	}
	s.mu.Lock()
	needs := s.needsDecision[instance]
	v.ExternalChanges = s.changes[instance]
	v.NewFiles = s.newFiles[instance]
	v.Failures = slices.Clone(s.failures[instance])
	if w, ok := s.decisions[instance]; ok {
		v.PendingDecision = w.view.Operation
	}
	s.mu.Unlock()
	if holder, busy := s.Locks.Holder(instance); busy {
		v.Busy = holder
	}
	if len(v.Failures) == 0 {
		v.Failures = s.lastFailures(ctx, instance)
	}
	input.LastDeployFailed = len(v.Failures) > 0
	code, _ := s.stagingProblem(ctx, in.inst)
	v.StagingProblem = code
	_, cyclic := in.rules.Cycle()
	a, b, incompatible := in.incompatible()
	if incompatible {
		v.Incompatible = []string{in.mods[a].DisplayName(), in.mods[b].DisplayName()}
	}
	if v.Running, err = s.Foreign.RunningProcesses(ctx, in.inst); err != nil {
		return StatusView{}, err
	}
	switch {
	case len(v.Foreign) > 0:
		input.Blocked = deploystate.ReasonForeignDeployment
	case code == CodeStagingMissing:
		input.Blocked = deploystate.ReasonStagingMissing
	case code == CodeStagingForeign:
		input.Blocked = deploystate.ReasonStagingForeign
	case cyclic:
		input.Blocked = deploystate.ReasonRuleCycle
	case incompatible:
		input.Blocked = deploystate.ReasonModsIncompatible
	case len(v.Running) > 0:
		input.Blocked = deploystate.ReasonGameRunning
	case needs:
		input.Blocked = deploystate.ReasonNeedsDecision
	case v.ExternalChanges > 0:
		input.Blocked = deploystate.ReasonExternalChanges
	}
	v.Status = deploystate.Compute(input)
	return v, nil
}

// lastFailures reads the failed locations of the latest deploy/purge of the
// instance from its operation error, so a failed status survives a restart.
func (s *Service) lastFailures(ctx context.Context, instance game.InstanceID) []Failure {
	ops, err := s.Ops.Recent(ctx, 100)
	if err != nil {
		return nil
	}
	for _, op := range ops {
		if op.Subject.ID != string(instance) || (op.Kind != KindDeploy && op.Kind != KindPurge) {
			continue
		}
		if op.Status != operation.StatusFailed || op.Error == nil || op.Error.Code != CodeDeployFailed {
			return nil
		}
		locs := strings.Split(op.Error.Params["locations"], "\n")
		codes := strings.Split(op.Error.Params["codes"], "\n")
		var out []Failure
		for i, l := range locs {
			loc, ok := parseLocation(l)
			if !ok {
				continue
			}
			f := Failure{Location: loc}
			if i < len(codes) {
				f.Code = codes[i]
			}
			out = append(out, f)
		}
		return out
	}
	return nil
}

func parseLocation(s string) (game.Location, bool) {
	t, p, ok := strings.Cut(s, ":")
	if !ok {
		return game.Location{}, false
	}
	rp, err := relpath.Parse(p)
	if err != nil {
		return game.Location{}, false
	}
	return game.Location{Target: game.TargetID(t), Path: rp}, true
}

// statusKey is kind/reason of the current status ("" when unknown).
func (s *Service) statusKey(ctx context.Context, instance game.InstanceID) string {
	v, err := s.Status(ctx, instance)
	if err != nil {
		return ""
	}
	return string(v.Status.Kind) + "/" + string(v.Status.Reason)
}

// Interrupted lists the instances with a deploy or purge journal left by a
// previous process (diagnostic deploy_interrupted; recovery is the user's
// "Reconcile now", core/14 §5).
func (s *Service) Interrupted(ctx context.Context) ([]game.InstanceID, error) {
	return s.Journals.Instances(ctx)
}
