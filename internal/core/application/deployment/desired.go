package deployment

import (
	"context"
	"errors"
	"slices"
	"strconv"
	"strings"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/conflict"
	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/deployplan"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/override"
	"modorchestrator/internal/core/domain/profile"
	"modorchestrator/internal/core/domain/rules"
)

// inputs are the facts the desired state is derived from (docs-ia/03):
// active profile, installed mods, instance intent and mod types.
type inputs struct {
	inst    game.Instance
	def     game.Definition
	profile *profile.Profile
	mods    map[mod.ID]*mod.Mod
	// enabled lists the enabled installed mods, lowest priority first.
	enabled     []mod.ID
	rules       *rules.Set
	intent      *override.Set
	fingerprint deployment.Fingerprint
}

// loadInputs reads the inputs without loading any installation, so the
// status can compare fingerprints cheaply.
func (s *Service) loadInputs(ctx context.Context, instance game.InstanceID) (*inputs, error) {
	inst, err := s.instance(ctx, instance)
	if err != nil {
		return nil, err
	}
	def, err := s.definition(inst)
	if err != nil {
		return nil, err
	}
	pid, err := s.Profiles.Active(ctx, instance)
	if err != nil {
		return nil, err
	}
	p, err := s.Profiles.Get(ctx, pid)
	if err != nil {
		return nil, err
	}
	list, err := s.Mods.ListByInstance(ctx, instance)
	if err != nil {
		return nil, err
	}
	set, err := s.Rules.Get(ctx, instance)
	if errors.Is(err, ports.ErrNotFound) {
		set, err = rules.New(instance)
	}
	if err != nil {
		return nil, err
	}
	intent, err := s.Overrides.Get(ctx, instance)
	if errors.Is(err, ports.ErrNotFound) {
		intent, err = override.New(instance)
	}
	if err != nil {
		return nil, err
	}
	in := &inputs{inst: inst, def: def, profile: p, mods: map[mod.ID]*mod.Mod{}, rules: set, intent: intent}
	for _, m := range list {
		if m.State == mod.StateInstalled && m.Installation != "" {
			in.mods[m.ID] = m
		}
	}
	lines := []string{
		"method " + string(inst.PreferredMethod),
		"staging " + game.CleanAbs(inst.Staging),
	}
	for _, t := range inst.Targets {
		lines = append(lines, "target "+string(t.ID)+" "+game.CleanAbs(t.Path))
	}
	for _, id := range p.Mods() {
		m, ok := in.mods[id]
		if !ok || !p.IsEnabled(id) {
			continue
		}
		in.enabled = append(in.enabled, id)
		lines = append(lines, "mod "+string(id)+" "+string(m.Installation)+" "+string(m.Type))
	}
	for _, o := range intent.Overrides() {
		lines = append(lines, "override "+o.Location.Key()+" "+string(o.Winner))
	}
	var excl []string
	for _, x := range intent.Exclusions() {
		excl = append(excl, "exclude "+string(x.Mod)+" "+x.Location.Key())
	}
	slices.Sort(excl)
	lines = append(lines, excl...)
	in.fingerprint = deployplan.InputFingerprint(deployment.ProfileID(p.ID()), lines)
	return in, nil
}

// installation reads an installation through the cache (installations are
// immutable once saved).
func (s *Service) installation(ctx context.Context, id mod.InstallationID) (*mod.Installation, error) {
	s.mu.Lock()
	inst, ok := s.installations[id]
	s.mu.Unlock()
	if ok {
		return inst, nil
	}
	inst, err := s.Installations.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.installations[id] = inst
	s.mu.Unlock()
	return inst, nil
}

// desired derives the desired state: the winner of every location
// (INV-CON-01) and the method of each file.
func (s *Service) desired(ctx context.Context, in *inputs, avail availability) (deployplan.Desired, error) {
	installs := make(map[mod.ID]*mod.Installation, len(in.enabled))
	for _, id := range in.enabled {
		inst, err := s.installation(ctx, in.mods[id].Installation)
		if errors.Is(err, ports.ErrNotFound) {
			continue // integrity problem of the staging, reported elsewhere
		}
		if err != nil {
			return deployplan.Desired{}, err
		}
		installs[id] = inst
	}
	res := conflict.Calculate(conflict.Input{Enabled: in.enabled, Installations: installs, Intent: in.intent, RuleEdges: in.rules.OrderEdges()})
	// Locations of targets the instance does not have are never deployed.
	winners := slices.DeleteFunc(res.Winners, func(w conflict.Winner) bool { return !in.inst.HasTarget(w.Location.Target) })
	return deployplan.BuildDesired(deployment.ProfileID(in.profile.ID()), in.fingerprint, winners, s.methodFor(in, avail)), nil
}

// availability says, per target, which methods can work now.
type availability map[game.TargetID]map[game.DeploymentMethod]string

// ok reports whether m works for t ("" reason).
func (a availability) ok(t game.TargetID, m game.DeploymentMethod) bool {
	r, known := a[t][m]
	return known && r == ""
}

// methodFor resolves the method of a mod's files: the preferred method when
// the mod type allows it and the target supports it; otherwise the first of
// hardlink and copy that does, proposed as a fallback the user decides
// (core/04 §3: never switched silently).
func (s *Service) methodFor(in *inputs, avail availability) deployplan.MethodFor {
	return func(id mod.ID, target game.TargetID) deployplan.Method {
		pref := in.inst.PreferredMethod
		t, ok := in.def.ModType(in.mods[id].Type)
		if !ok {
			t, _ = in.def.ModType(game.DefaultModType)
		}
		if t.Allows(pref) && avail.ok(target, pref) {
			return deployplan.Method{Method: pref}
		}
		for _, alt := range []game.DeploymentMethod{game.MethodHardlink, game.MethodCopy} {
			if alt != pref && t.Allows(alt) && avail.ok(target, alt) {
				return deployplan.Method{Method: alt, FallbackFrom: pref}
			}
		}
		return deployplan.Method{Method: pref}
	}
}

// MethodStatus says whether a deployment method can work for an instance
// and why not (core/04 §3, `method_unavailable` reasons).
type MethodStatus struct {
	Method    game.DeploymentMethod
	Available bool
	// Reason: different_volume, not_ntfs, developer_mode_off, unknown.
	Reason string
	// Preferred marks the method the instance uses.
	Preferred bool
}

// Methods reports the availability of every method for an instance.
func (s *Service) Methods(ctx context.Context, instance game.InstanceID) ([]MethodStatus, error) {
	inst, err := s.instance(ctx, instance)
	if err != nil {
		return nil, err
	}
	return s.methodsFor(ctx, inst, inst.Staging), nil
}

func (s *Service) methodsFor(ctx context.Context, inst game.Instance, staging string) []MethodStatus {
	avail := s.availability(ctx, inst, staging, true)
	out := make([]MethodStatus, 0, 3)
	for _, m := range []game.DeploymentMethod{game.MethodHardlink, game.MethodSymlink, game.MethodCopy} {
		st := MethodStatus{Method: m, Available: true, Preferred: m == inst.PreferredMethod}
		for _, t := range inst.Targets {
			if r := avail[t.ID][m]; r != "" {
				st.Available, st.Reason = false, r
				break
			}
		}
		out = append(out, st)
	}
	return out
}

// availability checks every target: hardlinks need the staging on the same
// NTFS volume; symlinks need the privilege to create them (Windows
// Developer Mode, proven by a real attempt inside the staging, a folder the
// instance owns); copies always work. A deploy probes symlinks only when
// they are the preferred method: symlink is never proposed as a fallback.
func (s *Service) availability(ctx context.Context, inst game.Instance, staging string, probeSymlink bool) availability {
	out := availability{}
	symlink := ""
	if probeSymlink && !s.canSymlink(ctx, staging) {
		symlink = "developer_mode_off"
	}
	for _, t := range inst.Targets {
		hard := ""
		same, err := s.FS.SameVolume(ctx, staging, t.Path)
		switch {
		case err != nil:
			hard = "unknown"
		case !same:
			hard = "different_volume"
		default:
			if f, err := s.FS.VolumeFormat(ctx, t.Path); err == nil && f != "" && !strings.EqualFold(f, "NTFS") {
				hard = "not_ntfs"
			}
		}
		out[t.ID] = map[game.DeploymentMethod]string{game.MethodHardlink: hard, game.MethodSymlink: symlink, game.MethodCopy: ""}
	}
	return out
}

// canSymlink tries to create a symlink inside the staging (a folder the
// instance owns, never the game) and caches the answer for a minute.
func (s *Service) canSymlink(ctx context.Context, staging string) bool {
	key := game.CleanAbs(staging)
	s.mu.Lock()
	r, ok := s.symlinkProbe[key]
	s.mu.Unlock()
	now := s.Clock.Now()
	if ok && now.Sub(r.at) < time.Minute {
		return r.ok
	}
	probe := game.JoinPath(staging, ".modorchestrator-probe-"+strconv.FormatInt(now.UnixNano(), 36))
	err := s.FS.Symlink(ctx, game.JoinPath(staging, game.StagingMarker), probe)
	if err == nil {
		_ = s.FS.Remove(ctx, probe)
	}
	s.mu.Lock()
	s.symlinkProbe[key] = probeResult{ok: err == nil, at: now}
	s.mu.Unlock()
	return err == nil
}
