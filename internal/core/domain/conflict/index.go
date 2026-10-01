package conflict

import (
	"slices"
	"strings"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/override"
)

// Index keeps the footprint of every installed mod of an instance by
// location, so that evaluating a profile only visits the locations provided
// by two or more mods (core/05 §5.1, performance goal of
// 00-visao-e-escopo.md). It is a calculation cache: it can be dropped and
// rebuilt from the installations at any time (INV-CON-04) and is never read
// as truth by another module.
//
// Updating is incremental: Put and Remove touch only the locations of one
// installation, and a mod whose installation did not change is skipped.
type Index struct {
	mods      map[mod.ID]*mod.Installation
	byLoc     map[string]*slot
	contested map[string]struct{}
}

type slot struct {
	loc       game.Location
	providers []provided
}

type provided struct {
	mod  mod.ID
	file mod.File
}

// NewIndex creates an empty index.
func NewIndex() *Index {
	return &Index{mods: map[mod.ID]*mod.Installation{}, byLoc: map[string]*slot{}, contested: map[string]struct{}{}}
}

// Installation returns the installation indexed for m.
func (x *Index) Installation(m mod.ID) (mod.InstallationID, bool) {
	inst, ok := x.mods[m]
	if !ok {
		return "", false
	}
	return inst.ID, true
}

// Mods returns the indexed mods, ordered.
func (x *Index) Mods() []mod.ID {
	out := make([]mod.ID, 0, len(x.mods))
	for m := range x.mods {
		out = append(out, m)
	}
	slices.Sort(out)
	return out
}

// Files returns the files of the installation indexed for m.
func (x *Index) Files(m mod.ID) []mod.File {
	if inst, ok := x.mods[m]; ok {
		return inst.Files
	}
	return nil
}

// Put indexes the current installation of its mod, replacing the previous
// one. Indexing the same installation again does nothing.
func (x *Index) Put(inst *mod.Installation) {
	if old, ok := x.mods[inst.Mod]; ok {
		if old.ID == inst.ID {
			return
		}
		x.Remove(inst.Mod)
	}
	x.mods[inst.Mod] = inst
	for _, f := range inst.Files {
		k := f.Dest.Key()
		s := x.byLoc[k]
		if s == nil {
			s = &slot{loc: f.Dest}
			x.byLoc[k] = s
		}
		s.providers = append(s.providers, provided{mod: inst.Mod, file: f})
		if len(s.providers) > 1 {
			x.contested[k] = struct{}{}
		}
	}
}

// Remove forgets the installation of m.
func (x *Index) Remove(m mod.ID) {
	inst, ok := x.mods[m]
	if !ok {
		return
	}
	delete(x.mods, m)
	for _, f := range inst.Files {
		k := f.Dest.Key()
		s := x.byLoc[k]
		if s == nil {
			continue
		}
		s.providers = slices.DeleteFunc(s.providers, func(p provided) bool { return p.mod == m })
		switch len(s.providers) {
		case 0:
			delete(x.byLoc, k)
			delete(x.contested, k)
		case 1:
			delete(x.contested, k)
		}
	}
}

// Slot is one mod of the profile's ModOrder.
type Slot struct {
	Mod     mod.ID
	Enabled bool
}

// EvalInput is what evaluating one profile needs.
type EvalInput struct {
	// Order lists every mod of the profile in priority order, lowest first.
	Order []Slot
	// IncludeDisabled adds disabled mods as providers ("potential
	// conflicts" of the Conflicts screen). Winners, staleness and provided
	// counts always consider enabled mods only.
	IncludeDisabled bool
	Intent          *override.Set
	RuleEdges       []ordering.Edge
	// Hash returns the known content hash of a file of m; ok is false when
	// it was not computed yet. Files with Hash set use it directly.
	Hash func(m mod.ID, f mod.File) (string, bool)
}

// HashRequest is a file whose hash would decide redundancy.
type HashRequest struct {
	Mod  mod.ID
	File mod.File
}

// StaleExclusion is a FileExclusion that no longer applies: the mod is gone
// or no longer provides the location. It is reported, never removed
// silently (core/05 §5.3).
type StaleExclusion struct {
	Exclusion override.FileExclusion
	Reason    StaleReason
}

// StaleMissing: the mod of an override or exclusion is not installed.
const StaleMissing StaleReason = "missing"

// Evaluation is the calculated conflict state of one profile.
type Evaluation struct {
	// Conflicts are ordered by location.
	Conflicts       []FileConflict
	Stale           []StaleOverride
	StaleExclusions []StaleExclusion
	// Provided counts, per mod of the order, the locations it provides
	// after exclusions.
	Provided map[mod.ID]int
	// NeedHash lists files of same-size providers whose hash is unknown;
	// once known they may turn a conflict redundant.
	NeedHash []HashRequest
}

// Evaluate calculates the conflicts of a profile. The winner follows
// INV-CON-01 exactly as Calculate does; only the contested locations are
// visited.
func (x *Index) Evaluate(in EvalInput) Evaluation {
	priority := make(map[mod.ID]int, len(in.Order))
	enabled := make(map[mod.ID]bool, len(in.Order))
	for i, s := range in.Order {
		priority[s.Mod] = i
		enabled[s.Mod] = s.Enabled
	}
	excluded := func(m mod.ID, loc game.Location) bool { return in.Intent != nil && in.Intent.Excluded(m, loc) }
	hashOf := func(p provided) (string, bool) {
		if p.file.Hash != "" {
			return p.file.Hash, true
		}
		if in.Hash == nil {
			return "", false
		}
		return in.Hash(p.mod, p.file)
	}

	out := Evaluation{Provided: make(map[mod.ID]int, len(in.Order))}
	reach := newReachability(in.RuleEdges)
	keys := make([]string, 0, len(x.contested))
	for k := range x.contested {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	var cand []provided
	for _, k := range keys {
		s := x.byLoc[k]
		cand = cand[:0]
		for _, p := range s.providers {
			if _, inOrder := priority[p.mod]; !inOrder || excluded(p.mod, s.loc) {
				continue
			}
			if enabled[p.mod] || in.IncludeDisabled {
				cand = append(cand, p)
			}
		}
		if len(cand) < 2 {
			continue
		}
		slices.SortFunc(cand, func(a, b provided) int { return priority[a.mod] - priority[b.mod] })
		c := FileConflict{Location: s.loc, Providers: make([]mod.ID, len(cand)), Resolution: ResolutionOrder}
		for i, p := range cand {
			c.Providers[i] = p.mod
			if !enabled[p.mod] {
				c.Potential = true
			}
		}
		c.Winner = c.Providers[len(c.Providers)-1]
		if in.Intent != nil {
			if o, ok := in.Intent.Override(s.loc); ok && slices.Contains(c.Providers, o.Winner) && enabled[o.Winner] {
				c.Winner, c.Resolution = o.Winner, ResolutionOverride
			}
		}
		switch red, need := redundantAmong(cand, hashOf); {
		case red:
			c.Resolution = ResolutionRedundant
		case len(need) > 0:
			out.NeedHash = append(out.NeedHash, need...)
		}
		if c.Resolution == ResolutionOrder && reach.beatsAll(c.Winner, c.Providers) {
			c.Resolution = ResolutionRule
		}
		out.Conflicts = append(out.Conflicts, c)
	}

	if in.Intent != nil {
		for _, o := range in.Intent.Overrides() {
			if reason, stale := x.overrideStale(o, priority, enabled, excluded); stale {
				out.Stale = append(out.Stale, StaleOverride{Override: o, Reason: reason})
			}
		}
	}
	excludedCount := map[mod.ID]int{}
	if in.Intent != nil {
		for _, e := range in.Intent.Exclusions() {
			inst, installed := x.mods[e.Mod]
			_, inOrder := priority[e.Mod]
			switch {
			case !installed || !inOrder:
				out.StaleExclusions = append(out.StaleExclusions, StaleExclusion{Exclusion: e, Reason: StaleMissing})
			case !provides(x.byLoc[e.Location.Key()], inst.Mod):
				out.StaleExclusions = append(out.StaleExclusions, StaleExclusion{Exclusion: e, Reason: StaleNotProvider})
			default:
				excludedCount[e.Mod]++
			}
		}
	}
	for _, s := range in.Order {
		if inst, ok := x.mods[s.Mod]; ok {
			out.Provided[s.Mod] = len(inst.Files) - excludedCount[s.Mod]
		}
	}
	return out
}

// overrideStale applies INV-CON-03: an override is valid only while its
// winner is enabled and still provides the location (after exclusions).
func (x *Index) overrideStale(o override.FileOverride, priority map[mod.ID]int, enabled map[mod.ID]bool, excluded func(mod.ID, game.Location) bool) (StaleReason, bool) {
	_, inOrder := priority[o.Winner]
	_, installed := x.mods[o.Winner]
	switch {
	case !inOrder || !installed:
		return StaleMissing, true
	case !enabled[o.Winner]:
		return StaleDisabled, true
	case !provides(x.byLoc[o.Location.Key()], o.Winner) || excluded(o.Winner, o.Location):
		return StaleNotProvider, true
	}
	return "", false
}

func provides(s *slot, m mod.ID) bool {
	return s != nil && slices.ContainsFunc(s.providers, func(p provided) bool { return p.mod == m })
}

// redundantAmong decides redundancy (core/05 §5.1: same size and same
// hash). Different sizes are never redundant and need no hash; equal sizes
// with an unknown hash return the files to hash.
func redundantAmong(cand []provided, hashOf func(provided) (string, bool)) (bool, []HashRequest) {
	for _, p := range cand[1:] {
		if p.file.Size != cand[0].file.Size {
			return false, nil
		}
	}
	var need []HashRequest
	first := ""
	equal := true
	for _, p := range cand {
		h, ok := hashOf(p)
		if !ok {
			need = append(need, HashRequest{Mod: p.mod, File: p.file})
			continue
		}
		if first == "" {
			first = h
		} else if !strings.EqualFold(h, first) {
			equal = false
		}
	}
	if !equal {
		return false, nil
	}
	return len(need) == 0, need
}
