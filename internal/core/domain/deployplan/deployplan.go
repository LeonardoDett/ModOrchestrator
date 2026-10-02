// Package deployplan derives the desired state of an instance and the plan
// that reconciles it with the applied and observed states (D033, core/04
// §2–4). State category: calculated. It never touches the filesystem: the
// application layer scans (observed), executes the plan through the journal
// and records verified entries in a new manifest.
package deployplan

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"slices"
	"strings"

	"modorchestrator/internal/core/domain/conflict"
	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/externalchange"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/relpath"
)

// DesiredFile is one location of the desired state.
type DesiredFile struct {
	Location     game.Location
	Mod          mod.ID
	Installation mod.InstallationID
	Source       relpath.Path
	Method       game.DeploymentMethod
	// Size and Hash come from the installation (estimates and copy
	// evidence).
	Size int64
	Hash string
	// FallbackFrom is set when the preferred method cannot be used for
	// this file and Method is only the proposed alternative: the location
	// waits for a decision (core/04 §3, method_fallback).
	FallbackFrom game.DeploymentMethod
}

// Desired is the desired file state of the active profile. It is never
// persisted as truth (anti-pattern 13); only its fingerprint is recorded in
// the manifest to tell whether a deploy is pending.
type Desired struct {
	Profile     deployment.ProfileID
	Files       []DesiredFile
	Fingerprint deployment.Fingerprint
}

// Method is the resolved deployment method of a mod's files.
type Method struct {
	Method game.DeploymentMethod
	// FallbackFrom is the preferred method when it is not possible and
	// Method is the alternative proposed to the user.
	FallbackFrom game.DeploymentMethod
}

// MethodFor resolves the deployment method of a mod's files for a target:
// the instance's preferred method restricted by the mod type and by what
// the target supports (core/04 §3). Resolved by the application layer.
type MethodFor func(m mod.ID, target game.TargetID) Method

// BuildDesired turns the winners of the conflict calculation into the
// desired state. The fingerprint is computed by the caller from the inputs
// (InputFingerprint), so the status never needs the full calculation.
func BuildDesired(profile deployment.ProfileID, fp deployment.Fingerprint, winners []conflict.Winner, method MethodFor) Desired {
	d := Desired{Profile: profile, Fingerprint: fp}
	for _, w := range winners {
		m := method(w.Mod, w.Location.Target)
		d.Files = append(d.Files, DesiredFile{
			Location: w.Location, Mod: w.Mod, Installation: w.Installation, Source: w.File.Source,
			Method: m.Method, FallbackFrom: m.FallbackFrom, Size: w.File.Size, Hash: w.File.Hash,
		})
	}
	slices.SortFunc(d.Files, func(a, b DesiredFile) int { return strings.Compare(a.Location.Key(), b.Location.Key()) })
	return d
}

// InputFingerprint hashes the inputs of the desired state, in a canonical
// order chosen by the caller: same inputs, same desired state (D078). The
// fingerprint of the applied desired state is stored in the manifest; a
// different one means a deploy is pending.
func InputFingerprint(profile deployment.ProfileID, lines []string) deployment.Fingerprint {
	h := sha256.New()
	fmt.Fprintf(h, "desired/v2 %q\n", profile)
	for _, l := range lines {
		fmt.Fprintf(h, "%q\n", l)
	}
	return deployment.Fingerprint("sha256:" + hex.EncodeToString(h.Sum(nil)))
}

// BlockReason explains a location that cannot be deployed now.
type BlockReason string

const (
	// BlockTargetUnavailable: the target folder is missing or unreadable.
	BlockTargetUnavailable BlockReason = "target_unavailable"
	// BlockOccupied: the manifest keeps the original of the location in
	// the BackupStore and another unmanaged file now sits there.
	BlockOccupied BlockReason = "occupied"
)

// Blocked is a location the plan cannot touch until the cause is resolved
// outside the app (core/04 §4, `blocked`).
type Blocked struct {
	Location game.Location
	Reason   BlockReason
}

// Fallback is a group of locations whose preferred method is impossible.
type Fallback struct {
	Target    game.TargetID
	From, To  game.DeploymentMethod
	Locations []game.Location
}

// Key identifies the fallback group in a decision.
func (f Fallback) Key() string { return FallbackKey(f.Target, f.From, f.To) }

// FallbackKey builds the key of a fallback group.
func FallbackKey(t game.TargetID, from, to game.DeploymentMethod) string {
	return string(t) + "|" + string(from) + "|" + string(to)
}

// Summary counts the plan for the deploy dialog and the topbar.
type Summary struct {
	Create, Keep, Replace, Remove, BackupAndCreate, RestoreBackup, Mkdir, RemoveDir int
	// ExtraBytes estimates the space copies take (backups are moves inside
	// the volume and take none).
	ExtraBytes int64
	// Decisions counts what the user must decide: external changes, method
	// fallbacks and blocked locations.
	Decisions int
}

// Plan is the reconciliation of desired, applied and observed states.
type Plan struct {
	Actions []deployment.Action
	// Changes are external changes on locations the plan touches; those
	// locations get no action until the user decides (INV-EXT-01).
	Changes   []externalchange.Change
	Blocked   []Blocked
	Fallbacks []Fallback
	// Skipped are locations left untouched by a decision of this run.
	Skipped []game.Location
	Summary Summary
}

// NeedsDecision reports whether the plan must stop at await_decision. Auto
// deploy never executes such a plan (INV-DEP-06).
func (p Plan) NeedsDecision() bool {
	return len(p.Changes) > 0 || len(p.Blocked) > 0 || len(p.Fallbacks) > 0
}

// Empty reports whether applying the plan would change nothing
// (INV-DEP-04).
func (p Plan) Empty() bool {
	return !p.NeedsDecision() && !slices.ContainsFunc(p.Actions, func(a deployment.Action) bool { return a.Kind != deployment.ActionKeep })
}

// Complete reports whether executing the plan reaches the desired state:
// nothing waits for a decision and nothing was skipped.
func (p Plan) Complete() bool { return !p.NeedsDecision() && len(p.Skipped) == 0 }

// Input gathers what the plan is computed from.
type Input struct {
	Desired Desired
	// Applied is nil when the instance was never deployed.
	Applied *deployment.Manifest
	// Observed is keyed by Location.Key and must cover every file location
	// of Desired and Applied; a missing key means "not observed" and is
	// treated as a permission problem, never as absence.
	Observed map[string]deployment.Observation
	// Dirs observes the ancestor folders of the desired locations (same
	// key); a missing key means "absent".
	Dirs map[string]deployment.Observation
	// BlockedTargets are targets that cannot be written now.
	BlockedTargets map[game.TargetID]bool
	// Skip lists location keys the user chose to leave untouched in this
	// run (external changes, blocked locations, refused fallbacks).
	Skip map[string]bool
	// AcceptedFallbacks lists fallback groups (FallbackKey) the user
	// accepted: their locations use the proposed method.
	AcceptedFallbacks map[string]bool
	// CleanDirs removes folders the manager created that the desired state
	// no longer needs (setting deploy.cleanEmptyDirs; always on for purge).
	CleanDirs bool
	// BackupPath returns where the original of loc goes in the BackupStore.
	BackupPath func(loc game.Location) relpath.Path
	// Resolve carries the user's decisions about external changes of this
	// run, by location key (core/09 §4). A location without one keeps
	// waiting for a decision (or is skipped).
	Resolve map[string]Resolution
}

// ResolutionKind is how a decided external change enters the plan.
type ResolutionKind string

const (
	// ResolveForget: the file at the location is not the manager's any
	// more; the location is planned as if it had no link (restore of a
	// missing file, accepted removal).
	ResolveForget ResolutionKind = "forget"
	// ResolveAdopt: the observed file is the manager's as it is now (kept
	// hardlink edit, copy or file saved to the mod); with Relink the
	// staged file is put back over it (revert of an edited copy, file
	// saved to the mod that must become a link again).
	ResolveAdopt ResolutionKind = "adopt"
	// ResolveSetAside: the observed file is someone else's; it moves to the
	// BackupStore (recorded as the original when none is kept yet) and the
	// location gets the desired state (revert of a replaced file).
	ResolveSetAside ResolutionKind = "set_aside"
)

// Resolution is the decision about one external change.
type Resolution struct {
	Kind ResolutionKind
	// Relink re-materialises the staged file after adopting (wanted
	// locations only).
	Relink bool
}

// Build computes the plan.
func Build(in Input) Plan {
	var p Plan
	want := make(map[string]DesiredFile, len(in.Desired.Files))
	keys := map[string]game.Location{}
	fallbacks := map[string]*Fallback{}
	for _, f := range in.Desired.Files {
		k := f.Location.Key()
		if f.FallbackFrom != "" && !in.AcceptedFallbacks[FallbackKey(f.Location.Target, f.FallbackFrom, f.Method)] && !in.Skip[k] {
			fk := FallbackKey(f.Location.Target, f.FallbackFrom, f.Method)
			g := fallbacks[fk]
			if g == nil {
				g = &Fallback{Target: f.Location.Target, From: f.FallbackFrom, To: f.Method}
				fallbacks[fk] = g
			}
			g.Locations = append(g.Locations, f.Location)
		}
		want[k] = f
		keys[k] = f.Location
	}
	if in.Applied != nil {
		for _, e := range in.Applied.Entries() {
			if e.Kind != deployment.KindDir {
				keys[e.Location.Key()] = e.Location
			}
		}
	}
	sorted := make([]string, 0, len(keys))
	for k := range keys {
		sorted = append(sorted, k)
	}
	slices.Sort(sorted)

	add := func(a deployment.Action) { p.Actions = append(p.Actions, a) }
	creating := map[string]DesiredFile{} // locations that get a new file
	for _, k := range sorted {
		loc := keys[k]
		d, isWanted := want[k]
		if in.Skip[k] {
			p.Skipped = append(p.Skipped, loc)
			continue
		}
		if isWanted && d.FallbackFrom != "" && !in.AcceptedFallbacks[FallbackKey(loc.Target, d.FallbackFrom, d.Method)] {
			continue // waits for the fallback decision
		}
		if in.BlockedTargets[loc.Target] {
			p.Blocked = append(p.Blocked, Blocked{Location: loc, Reason: BlockTargetUnavailable})
			continue
		}
		obs, seen := in.Observed[k]
		if !seen {
			obs = deployment.Observation{Unreadable: true}
		}
		var link, backup *deployment.Entry
		if in.Applied != nil {
			if e, ok := in.Applied.Owns(loc); ok {
				link = &e
			}
			if e, ok := in.Applied.Backup(loc); ok {
				backup = &e
			}
		}
		if res, ok := in.Resolve[k]; ok && link != nil {
			var done bool
			if link, done = p.resolve(in, res, loc, link, backup, obs, d, isWanted, creating); done {
				continue
			}
		}
		if link != nil {
			c, changed := externalchange.Classify(*link, obs)
			if changed && c.Kind == externalchange.KindMissing && !isWanted {
				// The manager wanted the file gone anyway: nothing to decide
				// and nothing written there; the original comes back.
				add(deployment.Action{Kind: deployment.ActionRemoveManaged, Location: loc, Current: link})
				if backup != nil {
					add(deployment.Action{Kind: deployment.ActionRestoreBackup, Location: loc, Current: backup})
				}
				continue
			}
			if changed {
				c.Wanted = isWanted
				p.Changes = append(p.Changes, c)
				continue
			}
			switch {
			case isWanted && sameFile(d, *link):
				add(deployment.Action{Kind: deployment.ActionKeep, Location: loc, Current: link})
			case isWanted:
				add(deployment.Action{Kind: deployment.ActionReplaceManaged, Location: loc, Desired: entryOf(d), Current: link})
				creating[k] = d
			default:
				add(deployment.Action{Kind: deployment.ActionRemoveManaged, Location: loc, Current: link})
				if backup != nil {
					add(deployment.Action{Kind: deployment.ActionRestoreBackup, Location: loc, Current: backup})
				}
			}
			continue
		}
		if !isWanted {
			// Only the backup of an original is left (its link was removed
			// outside or by a reconciliation): put the original back.
			if backup != nil {
				switch {
				case obs.Unreadable:
					p.Changes = append(p.Changes, externalchange.Change{Location: loc, Kind: externalchange.KindPermission, Observed: obs})
				case obs.Exists:
					p.Blocked = append(p.Blocked, Blocked{Location: loc, Reason: BlockOccupied})
				default:
					add(deployment.Action{Kind: deployment.ActionRestoreBackup, Location: loc, Current: backup})
				}
			}
			continue
		}
		switch {
		case obs.Unreadable:
			p.Changes = append(p.Changes, externalchange.Change{Location: loc, Kind: externalchange.KindPermission, Observed: obs})
		case !obs.Exists:
			add(deployment.Action{Kind: deployment.ActionCreate, Location: loc, Desired: entryOf(d)})
			creating[k] = d
		case backup != nil || obs.IsDir:
			// The original is already kept (a second unmanaged file must
			// not overwrite that backup), or a folder sits where a file
			// must go.
			p.Blocked = append(p.Blocked, Blocked{Location: loc, Reason: BlockOccupied})
		default:
			// Unmanaged file where a mod file must go: preserved (D034).
			b := &deployment.Entry{Location: loc, Kind: deployment.KindBackup, BackupPath: in.backupPath(loc), Evidence: obs.Evidence}
			add(deployment.Action{Kind: deployment.ActionBackupAndCreate, Location: loc, Desired: entryOf(d), Backup: b})
			creating[k] = d
		}
	}

	p.planDirs(in, want, creating)
	for _, k := range sortedKeys(fallbacks) {
		p.Fallbacks = append(p.Fallbacks, *fallbacks[k])
	}
	p.Actions = deployment.SortForApply(p.Actions)
	p.Summary = summarize(p, want)
	return p
}

// resolve plans a decided external change. It returns the link the normal
// planning continues with, or done when the location is fully planned.
func (p *Plan) resolve(in Input, res Resolution, loc game.Location, link, backup *deployment.Entry, obs deployment.Observation,
	d DesiredFile, wanted bool, creating map[string]DesiredFile) (*deployment.Entry, bool) {
	add := func(a deployment.Action) { p.Actions = append(p.Actions, a) }
	switch res.Kind {
	case ResolveForget:
		if !wanted || obs.Exists || obs.Unreadable {
			// Not wanted: a missing link is simply dropped below.
			return link, false
		}
		return nil, false
	case ResolveAdopt:
		if !obs.Exists || obs.IsDir || obs.Unreadable {
			return link, false // nothing to adopt: classified again
		}
		adopted := *link
		adopted.Evidence = obs.Evidence
		if adopted.Evidence.Hash == "" && obs.Evidence.Size == link.Evidence.Size {
			adopted.Evidence.Hash = link.Evidence.Hash
		}
		if res.Relink && wanted {
			add(deployment.Action{Kind: deployment.ActionReplaceManaged, Location: loc, Desired: entryOf(d), Current: &adopted})
			creating[loc.Key()] = d
			return nil, true
		}
		return &adopted, false
	case ResolveSetAside:
		if !obs.Exists || obs.IsDir || obs.Unreadable {
			return link, false
		}
		aside := &deployment.Entry{Location: loc, Kind: deployment.KindBackup, BackupPath: in.backupPath(loc), Evidence: obs.Evidence}
		switch {
		case wanted && backup == nil:
			// No original is kept: the found file becomes it (D034).
			add(deployment.Action{Kind: deployment.ActionBackupAndCreate, Location: loc, Desired: entryOf(d), Backup: aside})
			creating[loc.Key()] = d
		case wanted:
			add(deployment.Action{Kind: deployment.ActionSetAside, Location: loc, Current: link, Backup: aside})
			add(deployment.Action{Kind: deployment.ActionCreate, Location: loc, Desired: entryOf(d)})
			creating[loc.Key()] = d
		default:
			add(deployment.Action{Kind: deployment.ActionSetAside, Location: loc, Current: link, Backup: aside})
			if backup != nil {
				add(deployment.Action{Kind: deployment.ActionRestoreBackup, Location: loc, Current: backup})
			}
		}
		return nil, true
	}
	return link, false
}

// planDirs adds the folders new files need and the cleanup of folders the
// manager created that nothing needs any more (INV-DEP-09: removal happens
// only if the folder is empty at that moment).
func (p *Plan) planDirs(in Input, want map[string]DesiredFile, creating map[string]DesiredFile) {
	managed := map[string]bool{}
	if in.Applied != nil {
		for _, d := range in.Applied.Dirs() {
			managed[d.Location.Key()] = true
		}
	}
	made := map[string]bool{}
	for _, f := range creating {
		for _, dir := range ancestors(f.Location) {
			k := dir.Key()
			if made[k] {
				continue
			}
			if obs, ok := in.Dirs[k]; ok && obs.Exists {
				continue
			}
			made[k] = true
			p.Actions = append(p.Actions, deployment.Action{Kind: deployment.ActionMkdir, Location: dir})
		}
	}
	if in.Applied == nil || !in.CleanDirs {
		return
	}
	needed := map[string]bool{}
	for _, f := range want {
		for _, dir := range ancestors(f.Location) {
			needed[dir.Key()] = true
		}
	}
	for _, loc := range p.Skipped {
		for _, dir := range ancestors(loc) {
			needed[dir.Key()] = true
		}
	}
	for _, dir := range in.Applied.Dirs() {
		if !needed[dir.Location.Key()] && !made[dir.Location.Key()] {
			e := dir
			p.Actions = append(p.Actions, deployment.Action{Kind: deployment.ActionRemoveDir, Location: dir.Location, Current: &e})
		}
	}
}

func (in Input) backupPath(loc game.Location) relpath.Path {
	if in.BackupPath != nil {
		return in.BackupPath(loc)
	}
	return relpath.MustParse(string(loc.Target) + "/" + loc.Path.String())
}

// PurgeInput turns a deploy input into the purge of everything the
// manifest records (core/04 §6): an empty desired state that keeps the
// profile, and folder cleanup always on.
func PurgeInput(in Input) Input {
	in.Desired = Desired{Profile: in.Desired.Profile}
	in.CleanDirs = true
	in.AcceptedFallbacks = nil
	return in
}

func sameFile(d DesiredFile, e deployment.Entry) bool {
	return d.Mod == e.Mod && d.Installation == e.Installation && d.Source.Key() == e.Source.Key() && d.Method == e.Method
}

func entryOf(d DesiredFile) *deployment.Entry {
	return &deployment.Entry{
		Location: d.Location, Kind: deployment.KindLink, Mod: d.Mod, Installation: d.Installation, Source: d.Source, Method: d.Method,
		Evidence: deployment.Evidence{Size: d.Size, Hash: d.Hash},
	}
}

// Ancestors returns the folders above a location, outermost first.
func Ancestors(loc game.Location) []game.Location { return ancestors(loc) }

func ancestors(loc game.Location) []game.Location {
	segs := strings.Split(loc.Path.String(), "/")
	out := make([]game.Location, 0, len(segs)-1)
	for i := 1; i < len(segs); i++ {
		out = append(out, game.Location{Target: loc.Target, Path: relpath.MustParse(strings.Join(segs[:i], "/"))})
	}
	return out
}

func sortedKeys[V any](m map[string]V) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	slices.Sort(out)
	return out
}

func summarize(p Plan, want map[string]DesiredFile) Summary {
	s := Summary{Decisions: len(p.Changes) + len(p.Blocked)}
	for _, f := range p.Fallbacks {
		s.Decisions += len(f.Locations)
	}
	for _, a := range p.Actions {
		switch a.Kind {
		case deployment.ActionCreate:
			s.Create++
		case deployment.ActionKeep:
			s.Keep++
		case deployment.ActionReplaceManaged:
			s.Replace++
		case deployment.ActionRemoveManaged:
			s.Remove++
		case deployment.ActionBackupAndCreate:
			s.BackupAndCreate++
		case deployment.ActionRestoreBackup:
			s.RestoreBackup++
		case deployment.ActionMkdir:
			s.Mkdir++
		case deployment.ActionRemoveDir:
			s.RemoveDir++
		}
		if a.Desired != nil && a.Desired.Method == game.MethodCopy {
			s.ExtraBytes += want[a.Location.Key()].Size
		}
	}
	return s
}
