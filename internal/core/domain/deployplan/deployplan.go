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
}

// Desired is the desired file state of the active profile. It is never
// persisted as truth (anti-pattern 13); only its fingerprint is recorded in
// the manifest to tell whether a deploy is pending.
type Desired struct {
	Profile     deployment.ProfileID
	Files       []DesiredFile
	Fingerprint deployment.Fingerprint
}

// MethodFor resolves the deployment method of a mod's files: the instance's
// preferred method restricted by the mod type (core/04 §3). Resolved by the
// application layer, which knows the definition and the mods.
type MethodFor func(mod.ID) game.DeploymentMethod

// BuildDesired turns the winners of the conflict calculation into the
// desired state.
func BuildDesired(profile deployment.ProfileID, winners []conflict.Winner, method MethodFor) Desired {
	d := Desired{Profile: profile}
	for _, w := range winners {
		d.Files = append(d.Files, DesiredFile{Location: w.Location, Mod: w.Mod, Installation: w.Installation, Source: w.File.Source, Method: method(w.Mod)})
	}
	slices.SortFunc(d.Files, func(a, b DesiredFile) int { return strings.Compare(a.Location.Key(), b.Location.Key()) })
	h := sha256.New()
	fmt.Fprintf(h, "desired/v1 %q\n", profile)
	for _, f := range d.Files {
		fmt.Fprintf(h, "%q %q %q %q %q\n", f.Location.Key(), f.Mod, f.Installation, f.Source.Key(), f.Method)
	}
	d.Fingerprint = deployment.Fingerprint("sha256:" + hex.EncodeToString(h.Sum(nil)))
	return d
}

// Summary counts the plan for the deploy dialog and the topbar.
type Summary struct {
	Create, Keep, Replace, Remove, BackupAndCreate, RestoreBackup, RemoveDir int
	// Decisions counts external changes the user must triage.
	Decisions int
}

// Plan is the reconciliation of desired, applied and observed states.
type Plan struct {
	Actions []deployment.Action
	// Changes are external changes on locations the plan touches; those
	// locations get no action until the user decides (INV-EXT-01).
	Changes []externalchange.Change
	Summary Summary
}

// NeedsDecision reports whether the plan must stop at await_decision. Auto
// deploy never executes such a plan (INV-DEP-06).
func (p Plan) NeedsDecision() bool { return len(p.Changes) > 0 }

// Empty reports whether applying the plan would change nothing
// (INV-DEP-04).
func (p Plan) Empty() bool {
	return !p.NeedsDecision() && !slices.ContainsFunc(p.Actions, func(a deployment.Action) bool { return a.Kind != deployment.ActionKeep })
}

// Build computes the plan. applied is nil when the instance was never
// deployed. observed is keyed by Location.Key and must cover every location
// of desired and applied; a missing key means "not observed" and is treated
// as a permission problem, never as absence.
func Build(desired Desired, applied *deployment.Manifest, observed map[string]deployment.Observation) Plan {
	want := make(map[string]DesiredFile, len(desired.Files))
	for _, f := range desired.Files {
		want[f.Location.Key()] = f
	}
	keys := map[string]game.Location{}
	for _, f := range desired.Files {
		keys[f.Location.Key()] = f.Location
	}
	if applied != nil {
		for _, e := range applied.Entries() {
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

	var p Plan
	add := func(a deployment.Action) { p.Actions = append(p.Actions, a) }
	for _, k := range sorted {
		loc := keys[k]
		d, isWanted := want[k]
		obs, seen := observed[k]
		if !seen {
			obs = deployment.Observation{Unreadable: true}
		}
		var link, backup *deployment.Entry
		if applied != nil {
			if e, ok := applied.Owns(loc); ok {
				link = &e
			}
			if e, ok := applied.Backup(loc); ok {
				backup = &e
			}
		}
		if link != nil {
			recorded := mod.File{Size: link.Evidence.Size, Hash: link.Evidence.Hash}
			if c, changed := externalchange.Classify(*link, obs, recorded); changed {
				p.Changes = append(p.Changes, c)
				continue
			}
			switch {
			case isWanted && sameFile(d, *link):
				add(deployment.Action{Kind: deployment.ActionKeep, Location: loc, Current: link})
			case isWanted:
				add(deployment.Action{Kind: deployment.ActionReplaceManaged, Location: loc, Desired: entryOf(d), Current: link})
			default:
				add(deployment.Action{Kind: deployment.ActionRemoveManaged, Location: loc, Current: link})
				if backup != nil {
					add(deployment.Action{Kind: deployment.ActionRestoreBackup, Location: loc, Current: backup})
				}
			}
			continue
		}
		if !isWanted {
			continue // only a backup without link: resolved when the link comes back or by purge
		}
		switch {
		case obs.Unreadable:
			p.Changes = append(p.Changes, externalchange.Change{Location: loc, Kind: externalchange.KindPermission, Observed: obs})
		case !obs.Exists:
			add(deployment.Action{Kind: deployment.ActionCreate, Location: loc, Desired: entryOf(d)})
		default:
			// Unmanaged file where a mod file must go: preserved (D034).
			add(deployment.Action{Kind: deployment.ActionBackupAndCreate, Location: loc, Desired: entryOf(d)})
		}
	}
	if applied != nil {
		needed := neededDirs(desired.Files)
		for _, dir := range applied.Dirs() {
			if !needed[dir.Location.Key()] {
				e := dir
				add(deployment.Action{Kind: deployment.ActionRemoveDir, Location: dir.Location, Current: &e})
			}
		}
	}
	p.Actions = deployment.SortForApply(p.Actions)
	p.Summary = summarize(p)
	return p
}

// BuildPurge plans the removal of everything the manifest records (core/04
// §6): an empty desired state for the same instance.
func BuildPurge(applied *deployment.Manifest, observed map[string]deployment.Observation) Plan {
	return Build(Desired{}, applied, observed)
}

func sameFile(d DesiredFile, e deployment.Entry) bool {
	return d.Mod == e.Mod && d.Installation == e.Installation && d.Source.Key() == e.Source.Key() && d.Method == e.Method
}

func entryOf(d DesiredFile) *deployment.Entry {
	return &deployment.Entry{Location: d.Location, Kind: deployment.KindLink, Mod: d.Mod, Installation: d.Installation, Source: d.Source, Method: d.Method}
}

// neededDirs returns every ancestor folder of the desired locations.
func neededDirs(files []DesiredFile) map[string]bool {
	out := map[string]bool{}
	for _, f := range files {
		segs := strings.Split(f.Location.Path.String(), "/")
		for i := 1; i < len(segs); i++ {
			dir := game.Location{Target: f.Location.Target, Path: relpath.MustParse(strings.Join(segs[:i], "/"))}
			out[dir.Key()] = true
		}
	}
	return out
}

func summarize(p Plan) Summary {
	s := Summary{Decisions: len(p.Changes)}
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
		case deployment.ActionRemoveDir:
			s.RemoveDir++
		}
	}
	return s
}
