// Package conflict calculates file disputes between mods (core/05 §5).
// State category: calculated. Results are derived from the profile (enabled
// mods in priority order), the installations and the instance intent
// (overrides, exclusions, order rules) every time they are needed; they are
// never persisted as truth (INV-CON-04) and never turn into rules (D004).
//
// Every location has exactly one winner (INV-CON-01): a valid FileOverride,
// otherwise the provider with the highest priority. There is no
// "unresolved" state (D027): order rules are already reflected in the
// priority, so they only change how a conflict is explained.
package conflict

import (
	"crypto/sha256"
	"encoding/hex"
	"slices"
	"strings"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/override"
)

// Resolution says how the winner of a disputed location was decided.
type Resolution string

const (
	// ResolutionOrder: the winner has the highest priority and no rule
	// connects it to every loser.
	ResolutionOrder Resolution = "order"
	// ResolutionRule: order rules (direct or transitive) put the winner
	// above every loser.
	ResolutionRule Resolution = "rule"
	// ResolutionOverride: a FileOverride chose the winner.
	ResolutionOverride Resolution = "override"
	// ResolutionRedundant: every provider has identical content (same size
	// and known, equal hash); who wins does not matter.
	ResolutionRedundant Resolution = "redundant"
)

// Input is what the calculation needs.
type Input struct {
	// Enabled lists the enabled mods in priority order, lowest first.
	Enabled []mod.ID
	// Installations holds the current installation of each enabled mod.
	Installations map[mod.ID]*mod.Installation
	// Intent holds overrides and exclusions of the instance; nil means none.
	Intent *override.Set
	// RuleEdges are the enabled order rules (Before loses to After).
	RuleEdges []ordering.Edge
}

// Winner is the file deployed at a location.
type Winner struct {
	Location     game.Location
	Mod          mod.ID
	Installation mod.InstallationID
	File         mod.File
}

// FileConflict is a location provided by two or more enabled mods.
type FileConflict struct {
	Location game.Location
	// Providers in ascending priority.
	Providers  []mod.ID
	Winner     mod.ID
	Resolution Resolution
	// Potential is set when a disabled mod is among the providers (only
	// with EvalInput.IncludeDisabled).
	Potential bool
}

// Losers returns the providers that do not win the location.
func (c FileConflict) Losers() []mod.ID {
	return slices.DeleteFunc(slices.Clone(c.Providers), func(m mod.ID) bool { return m == c.Winner })
}

// StaleReason explains why an override was ignored.
type StaleReason string

const (
	StaleNotProvider StaleReason = "not_provider" // the mod no longer provides the location
	StaleDisabled    StaleReason = "disabled"     // the mod is not enabled in this profile
)

// StaleOverride is an override that was ignored (INV-CON-03); it becomes the
// diagnostic "override_stale".
type StaleOverride struct {
	Override override.FileOverride
	Reason   StaleReason
}

// Result is the calculated state of one profile.
type Result struct {
	// Winners has one entry per location provided by an enabled mod,
	// ordered by location.
	Winners   []Winner
	Conflicts []FileConflict
	Stale     []StaleOverride
}

// Calculate derives winners and conflicts.
func Calculate(in Input) Result {
	priority := make(map[mod.ID]int, len(in.Enabled))
	for i, m := range in.Enabled {
		priority[m] = i
	}
	type provided struct {
		loc   game.Location
		files map[mod.ID]mod.File
		order []mod.ID
	}
	byLoc := map[string]*provided{}
	for _, m := range in.Enabled {
		inst := in.Installations[m]
		if inst == nil {
			continue
		}
		for _, f := range inst.Files {
			if in.Intent != nil && in.Intent.Excluded(m, f.Dest) {
				continue
			}
			p := byLoc[f.Dest.Key()]
			if p == nil {
				p = &provided{loc: f.Dest, files: map[mod.ID]mod.File{}}
				byLoc[f.Dest.Key()] = p
			}
			p.files[m] = f
			p.order = append(p.order, m) // Enabled is iterated in priority order
		}
	}

	var res Result
	usedOverride := map[string]bool{}
	reach := newReachability(in.RuleEdges)
	keys := make([]string, 0, len(byLoc))
	for k := range byLoc {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	for _, k := range keys {
		p := byLoc[k]
		winner := p.order[len(p.order)-1]
		res2 := ResolutionOrder
		if in.Intent != nil {
			if o, ok := in.Intent.Override(p.loc); ok {
				if _, provides := p.files[o.Winner]; provides {
					winner, res2 = o.Winner, ResolutionOverride
					usedOverride[k] = true
				}
			}
		}
		res.Winners = append(res.Winners, Winner{Location: p.loc, Mod: winner, Installation: in.Installations[winner].ID, File: p.files[winner]})
		if len(p.order) < 2 {
			continue
		}
		switch {
		case redundant(p.files):
			res2 = ResolutionRedundant
		case res2 == ResolutionOrder && reach.beatsAll(winner, p.order):
			res2 = ResolutionRule
		}
		res.Conflicts = append(res.Conflicts, FileConflict{Location: p.loc, Providers: slices.Clone(p.order), Winner: winner, Resolution: res2})
	}

	if in.Intent != nil {
		for _, o := range in.Intent.Overrides() {
			k := o.Location.Key()
			switch {
			case usedOverride[k]:
			case !slices.Contains(in.Enabled, o.Winner):
				res.Stale = append(res.Stale, StaleOverride{Override: o, Reason: StaleDisabled})
			default:
				res.Stale = append(res.Stale, StaleOverride{Override: o, Reason: StaleNotProvider})
			}
		}
	}
	return res
}

func redundant(files map[mod.ID]mod.File) bool {
	var size int64 = -1
	hash := ""
	for _, f := range files {
		if f.Hash == "" {
			return false
		}
		if size >= 0 && (f.Size != size || f.Hash != hash) {
			return false
		}
		size, hash = f.Size, f.Hash
	}
	return true
}

// reachability answers "do order rules place a below b" transitively.
type reachability struct {
	succ map[mod.ID][]mod.ID
	memo map[mod.ID]map[mod.ID]bool
}

func newReachability(edges []ordering.Edge) *reachability {
	r := &reachability{succ: map[mod.ID][]mod.ID{}, memo: map[mod.ID]map[mod.ID]bool{}}
	for _, e := range edges {
		r.succ[mod.ID(e.Before)] = append(r.succ[mod.ID(e.Before)], mod.ID(e.After))
	}
	return r
}

func (r *reachability) below(from mod.ID) map[mod.ID]bool {
	if m, ok := r.memo[from]; ok {
		return m
	}
	seen := map[mod.ID]bool{}
	stack := slices.Clone(r.succ[from])
	for len(stack) > 0 {
		n := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if seen[n] {
			continue
		}
		seen[n] = true
		stack = append(stack, r.succ[n]...)
	}
	r.memo[from] = seen
	return seen
}

func (r *reachability) beatsAll(winner mod.ID, providers []mod.ID) bool {
	if len(r.succ) == 0 {
		return false
	}
	for _, p := range providers {
		if p != winner && !r.below(p)[winner] {
			return false
		}
	}
	return true
}

// PairSummary aggregates the dispute between two mods (Conflicts screen).
type PairSummary struct {
	Pair override.Pair
	// Locations disputed by both mods, ordered.
	Locations []game.Location
	// WinsA and WinsB count where each of them is the deployed winner;
	// locations won by a third mod count for neither.
	WinsA, WinsB int
	Resolutions  map[Resolution]int
	// Contested fingerprints Locations; a ConflictReview is valid only for
	// the same fingerprint (D027).
	Contested string
	// Potential is set when a disabled mod takes part in the dispute.
	Potential bool
}

// Pairs aggregates conflicts by pair of providers, ordered by pair.
func Pairs(conflicts []FileConflict) []PairSummary {
	byPair := map[override.Pair]*PairSummary{}
	for _, c := range conflicts {
		for i, a := range c.Providers {
			for _, b := range c.Providers[i+1:] {
				pair := override.NewPair(a, b)
				s := byPair[pair]
				if s == nil {
					s = &PairSummary{Pair: pair, Resolutions: map[Resolution]int{}}
					byPair[pair] = s
				}
				s.Locations = append(s.Locations, c.Location)
				s.Resolutions[c.Resolution]++
				s.Potential = s.Potential || c.Potential
				switch c.Winner {
				case pair.A:
					s.WinsA++
				case pair.B:
					s.WinsB++
				}
			}
		}
	}
	out := make([]PairSummary, 0, len(byPair))
	for _, s := range byPair {
		h := sha256.New()
		for _, l := range s.Locations {
			h.Write([]byte(l.Key() + "\n"))
		}
		s.Contested = "sha256:" + hex.EncodeToString(h.Sum(nil))
		out = append(out, *s)
	}
	slices.SortFunc(out, func(a, b PairSummary) int {
		return strings.Compare(string(a.Pair.A)+"|"+string(a.Pair.B), string(b.Pair.A)+"|"+string(b.Pair.B))
	})
	return out
}

// Indicator is the per-mod conflict summary shown in the Mods table
// (core/05 §5.2).
type Indicator string

const (
	IndicatorNone             Indicator = "none"
	IndicatorWinsAll          Indicator = "wins_all"
	IndicatorLosesAll         Indicator = "loses_all"
	IndicatorMixed            Indicator = "mixed"
	IndicatorFullyOverwritten Indicator = "fully_overwritten"
	IndicatorRedundantOnly    Indicator = "redundant_only"
)

// ModIndicator summarises m given how many locations it provides after
// exclusions (provided) and the conflicts of the profile.
func ModIndicator(m mod.ID, provided int, conflicts []FileConflict) Indicator {
	var wins, loses, redundantN, involved int
	for _, c := range conflicts {
		if !slices.Contains(c.Providers, m) {
			continue
		}
		involved++
		switch {
		case c.Resolution == ResolutionRedundant:
			redundantN++
		case c.Winner == m:
			wins++
		default:
			loses++
		}
	}
	switch {
	case involved == 0:
		return IndicatorNone
	case redundantN == involved:
		return IndicatorRedundantOnly
	case loses > 0 && wins == 0 && loses+redundantN == provided:
		return IndicatorFullyOverwritten
	case loses > 0 && wins == 0:
		return IndicatorLosesAll
	case wins > 0 && loses == 0:
		return IndicatorWinsAll
	}
	return IndicatorMixed
}
