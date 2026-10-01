package conflicts

import (
	"context"
	"slices"
	"strings"

	"modorchestrator/internal/core/application/profiles"
	"modorchestrator/internal/core/domain/conflict"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/override"
	"modorchestrator/internal/core/domain/rules"
)

// ModRef names a mod with its place in the active profile.
type ModRef struct {
	ID       mod.ID
	Name     string
	Priority int
	Enabled  bool
}

// Decision says how a pair (or a mod against an opponent) is decided as a
// whole (ui/telas/conflicts.md §3).
type Decision string

const (
	DecisionOrder     Decision = "order"
	DecisionRule      Decision = "rule"
	DecisionOverride  Decision = "override"
	DecisionMixed     Decision = "mixed"
	DecisionRedundant Decision = "redundant"
)

// PairView is one line of the Conflicts screen.
type PairView struct {
	A, B ModRef
	// Files is the number of disputed locations; WinsA/WinsB how many each
	// deploys (a third mod may win the rest).
	Files, WinsA, WinsB, Redundant int
	Decision                       Decision
	// Reviewed: a review exists for the current set of locations.
	// NeedsReview: not reviewed and not only redundant (core/05 §5.4).
	Reviewed, NeedsReview bool
	// Potential: a disabled mod takes part (only with disabled mods shown).
	Potential bool
	// Rule is the direct order rule between the two, if any.
	Rule *profiles.PairRule
}

// Winner is the mod deploying most of the pair's locations.
func (p PairView) Winner() ModRef {
	if p.WinsA > p.WinsB {
		return p.A
	}
	return p.B
}

// Totals summarise the pairs (ui/telas/conflicts.md §2 "Resumo").
type Totals struct {
	Pairs, Unreviewed, Override, Redundant, Rule, Order, Mixed int
}

// StaleView is an override or exclusion that is ignored (INV-CON-03).
type StaleView struct {
	Kind     string // "override" | "exclusion"
	Location game.Location
	Mod      ModRef
	Reason   conflict.StaleReason
	// Rivals are the enabled providers of the location now, ascending
	// priority, when it is disputed ("Reescolher").
	Rivals []ModRef
}

// PairsView is the Conflicts screen content.
type PairsView struct {
	Pairs  []PairView
	Totals Totals
	Stale  []StaleView
	// PendingHashes counts files still being hashed; redundancy may change
	// when they finish (the UI reads again).
	PendingHashes int
}

// Pairs returns every disputed pair of the active profile, ordered by the
// higher priority involved (newest disputes on top), then by name. search
// keeps pairs whose mod names or disputed paths contain it (case-insensitive).
func (s *Service) Pairs(ctx context.Context, instance game.InstanceID, includeDisabled bool, search string) (PairsView, error) {
	st, err := s.load(ctx, instance, includeDisabled)
	if err != nil {
		return PairsView{}, err
	}
	s.warm(st)
	out := PairsView{PendingHashes: len(st.eval.NeedHash), Stale: st.staleViews()}
	q := strings.ToLower(strings.TrimSpace(search))
	for _, ps := range conflict.Pairs(st.eval.Conflicts) {
		if q != "" && !st.pairMatches(ps, q) {
			continue
		}
		v := st.pairView(ps)
		out.Pairs = append(out.Pairs, v)
		out.Totals.Pairs++
		if v.NeedsReview {
			out.Totals.Unreviewed++
		}
		switch v.Decision {
		case DecisionOverride:
			out.Totals.Override++
		case DecisionRedundant:
			out.Totals.Redundant++
		case DecisionRule:
			out.Totals.Rule++
		case DecisionOrder:
			out.Totals.Order++
		case DecisionMixed:
			out.Totals.Mixed++
		}
	}
	slices.SortStableFunc(out.Pairs, func(a, b PairView) int {
		if x, y := max(a.A.Priority, a.B.Priority), max(b.A.Priority, b.B.Priority); x != y {
			return y - x
		}
		return strings.Compare(strings.ToLower(a.A.Name+a.B.Name), strings.ToLower(b.A.Name+b.B.Name))
	})
	return out, nil
}

func (st *state) ref(m mod.ID) ModRef {
	n := st.names[m]
	if n == "" {
		n = string(m)
	}
	return ModRef{ID: m, Name: n, Priority: st.priority[m], Enabled: st.enabled[m]}
}

func (st *state) pairView(ps conflict.PairSummary) PairView {
	v := PairView{
		A: st.ref(ps.Pair.A), B: st.ref(ps.Pair.B), Files: len(ps.Locations), WinsA: ps.WinsA, WinsB: ps.WinsB,
		Redundant: ps.Resolutions[conflict.ResolutionRedundant], Potential: ps.Potential,
		Reviewed: st.intent.Reviewed(ps.Pair.A, ps.Pair.B, ps.Contested),
	}
	v.Decision = decisionOf(ps.Resolutions)
	v.NeedsReview = !v.Reviewed && v.Decision != DecisionRedundant
	if rs := profiles.PairRules(st.rules, ps.Pair.A, ps.Pair.B); len(rs) > 0 {
		v.Rule = &rs[0]
	}
	return v
}

// decisionOf merges per-location resolutions: redundant locations do not
// count unless every location is redundant.
func decisionOf(res map[conflict.Resolution]int) Decision {
	kinds := 0
	var only conflict.Resolution
	for r, n := range res {
		if n > 0 && r != conflict.ResolutionRedundant {
			kinds++
			only = r
		}
	}
	switch {
	case kinds == 0:
		return DecisionRedundant
	case kinds > 1:
		return DecisionMixed
	}
	return Decision(only)
}

func (st *state) pairMatches(ps conflict.PairSummary, q string) bool {
	if strings.Contains(strings.ToLower(st.ref(ps.Pair.A).Name), q) || strings.Contains(strings.ToLower(st.ref(ps.Pair.B).Name), q) {
		return true
	}
	for _, l := range ps.Locations {
		if strings.Contains(l.Path.Key(), q) {
			return true
		}
	}
	return false
}

func (st *state) staleViews() []StaleView {
	var out []StaleView
	disputed := map[string][]mod.ID{}
	for _, c := range st.eval.Conflicts {
		disputed[c.Location.Key()] = c.Providers
	}
	for _, o := range st.eval.Stale {
		v := StaleView{Kind: "override", Location: o.Override.Location, Mod: st.ref(o.Override.Winner), Reason: o.Reason}
		for _, m := range disputed[o.Override.Location.Key()] {
			v.Rivals = append(v.Rivals, st.ref(m))
		}
		out = append(out, v)
	}
	for _, e := range st.eval.StaleExclusions {
		out = append(out, StaleView{Kind: "exclusion", Location: e.Exclusion.Location, Mod: st.ref(e.Exclusion.Mod), Reason: e.Reason})
	}
	return out
}

// ProviderView is one provider of a disputed file.
type ProviderView struct {
	ModRef
	Size int64
	// Hash is known only when it decided redundancy (hashed on demand).
	Hash string
}

// FileView is one disputed location (DLG-09, Conflicts › detail).
type FileView struct {
	Location game.Location
	// Providers in ascending priority.
	Providers  []ProviderView
	Winner     mod.ID
	Resolution conflict.Resolution
	// Override is the winner chosen for this location, also when it is
	// stale and ignored.
	Override mod.ID
}

// PairDetail is the right side of the Conflicts screen.
type PairDetail struct {
	Pair  PairView
	Files []FileView
	// PendingHashes as in PairsView.
	PendingHashes int
}

// PairDetail returns the files disputed by a and b.
func (s *Service) PairDetail(ctx context.Context, instance game.InstanceID, a, b mod.ID, includeDisabled bool) (PairDetail, error) {
	st, err := s.load(ctx, instance, includeDisabled)
	if err != nil {
		return PairDetail{}, err
	}
	if err := st.check(a, b); err != nil {
		return PairDetail{}, err
	}
	s.warm(st)
	pair := override.NewPair(a, b)
	out := PairDetail{PendingHashes: len(st.eval.NeedHash), Pair: PairView{A: st.ref(pair.A), B: st.ref(pair.B)}}
	var involved []conflict.FileConflict
	for _, c := range st.eval.Conflicts {
		if slices.Contains(c.Providers, a) && slices.Contains(c.Providers, b) {
			involved = append(involved, c)
		}
	}
	if ps := conflict.Pairs(involved); len(ps) > 0 {
		for _, p := range ps {
			if p.Pair == pair {
				out.Pair = st.pairView(p)
			}
		}
	}
	out.Files = s.fileViews(st, involved)
	return out, nil
}

func (s *Service) fileViews(st *state, list []conflict.FileConflict) []FileView {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]FileView, 0, len(list))
	for _, c := range list {
		fv := FileView{Location: c.Location, Winner: c.Winner, Resolution: c.Resolution}
		if o, ok := st.intent.Override(c.Location); ok {
			fv.Override = o.Winner
		}
		for _, m := range c.Providers {
			pv := ProviderView{ModRef: st.ref(m)}
			for _, f := range st.index.Files(m) {
				if f.Dest.Key() == c.Location.Key() {
					id, _ := st.index.Installation(m)
					pv.Size, pv.Hash = f.Size, s.hashes[hashKey(id, f)]
					break
				}
			}
			fv.Providers = append(fv.Providers, pv)
		}
		out = append(out, fv)
	}
	return out
}

// OpponentView is one opponent of a mod (Inspector › Conflitos, DLG-08).
type OpponentView struct {
	Opponent ModRef
	// Files disputed with the opponent; Wins where the mod deploys, Loses
	// where the opponent deploys, Redundant where content is identical.
	Files, Wins, Loses, Redundant int
	Decision                      Decision
	Reviewed, NeedsReview         bool
	Rule                          *profiles.PairRule
}

// ModConflicts is the conflict summary of one mod.
type ModConflicts struct {
	Mod       ModRef
	Indicator conflict.Indicator
	Opponents []OpponentView
}

// ModConflicts summarises the disputes of m by opponent, opponents of
// higher priority first.
func (s *Service) ModConflicts(ctx context.Context, instance game.InstanceID, m mod.ID) (ModConflicts, error) {
	st, err := s.load(ctx, instance, false)
	if err != nil {
		return ModConflicts{}, err
	}
	if err := st.check(m); err != nil {
		return ModConflicts{}, err
	}
	s.warm(st)
	out := ModConflicts{Mod: st.ref(m), Indicator: conflict.ModIndicator(m, st.eval.Provided[m], st.eval.Conflicts)}
	for _, ps := range conflict.Pairs(st.eval.Conflicts) {
		if ps.Pair.A != m && ps.Pair.B != m {
			continue
		}
		pv := st.pairView(ps)
		o := OpponentView{Files: pv.Files, Redundant: pv.Redundant, Decision: pv.Decision, Reviewed: pv.Reviewed, NeedsReview: pv.NeedsReview, Rule: pv.Rule}
		if ps.Pair.A == m {
			o.Opponent, o.Wins, o.Loses = pv.B, ps.WinsA, ps.WinsB
		} else {
			o.Opponent, o.Wins, o.Loses = pv.A, ps.WinsB, ps.WinsA
		}
		out.Opponents = append(out.Opponents, o)
	}
	slices.SortStableFunc(out.Opponents, func(a, b OpponentView) int { return b.Opponent.Priority - a.Opponent.Priority })
	return out, nil
}

// FileState is the mark of a file in Inspector › Arquivos.
type FileState string

const (
	FileNoConflict FileState = "none"
	FileWins       FileState = "wins"
	FileLoses      FileState = "loses"
	FileRedundant  FileState = "redundant"
	FileHidden     FileState = "hidden"
)

// ModFile is one file of a mod with its conflict state.
type ModFile struct {
	Location game.Location
	Size     int64
	State    FileState
	// Winner deploys the location when the mod loses.
	Winner    *ModRef
	Opponents []ModRef
	// Overridden: a FileOverride exists at the location.
	Overridden bool
}

// ModFilesPage is a window of the files of a mod.
type ModFilesPage struct {
	Total int
	Files []ModFile
}

// ModFiles lists the footprint of m with the mark of each file, filtered by
// a path substring and windowed (ui/telas/mods.md §6 Arquivos).
func (s *Service) ModFiles(ctx context.Context, instance game.InstanceID, m mod.ID, filter string, offset, limit int) (ModFilesPage, error) {
	st, err := s.load(ctx, instance, false)
	if err != nil {
		return ModFilesPage{}, err
	}
	if _, ok := st.names[m]; !ok {
		return ModFilesPage{}, fail(CodeModNotFound, nil, "mod", string(m))
	}
	byLoc := map[string]conflict.FileConflict{}
	for _, c := range st.eval.Conflicts {
		if slices.Contains(c.Providers, m) {
			byLoc[c.Location.Key()] = c
		}
	}
	s.mu.Lock()
	files := slices.Clone(st.index.Files(m))
	s.mu.Unlock()
	slices.SortFunc(files, func(a, b mod.File) int { return strings.Compare(a.Dest.Key(), b.Dest.Key()) })
	f := strings.ToLower(strings.TrimSpace(filter))
	var all []ModFile
	for _, file := range files {
		if f != "" && !strings.Contains(file.Dest.Path.Key(), f) {
			continue
		}
		mf := ModFile{Location: file.Dest, Size: file.Size, State: FileNoConflict}
		_, mf.Overridden = st.intent.Override(file.Dest)
		switch c, ok := byLoc[file.Dest.Key()]; {
		case st.intent.Excluded(m, file.Dest):
			mf.State = FileHidden
		case !ok:
		default:
			for _, p := range c.Providers {
				if p != m {
					mf.Opponents = append(mf.Opponents, st.ref(p))
				}
			}
			switch {
			case c.Resolution == conflict.ResolutionRedundant:
				mf.State = FileRedundant
			case c.Winner == m:
				mf.State = FileWins
			default:
				mf.State = FileLoses
				w := st.ref(c.Winner)
				mf.Winner = &w
			}
		}
		all = append(all, mf)
	}
	if limit <= 0 || limit > 5000 {
		limit = 5000
	}
	offset = min(max(offset, 0), len(all))
	return ModFilesPage{Total: len(all), Files: slices.Clone(all[offset:min(offset+limit, len(all))])}, nil
}

// Indicator is the per-mod summary of the Mods table (core/05 §5.2).
type Indicator struct {
	Indicator conflict.Indicator
	// Files disputed with enabled mods; Unreviewed pairs needing review.
	Files, Unreviewed int
}

// Indicators returns the indicator of every mod of the active profile.
func (s *Service) Indicators(ctx context.Context, instance game.InstanceID) (map[mod.ID]Indicator, error) {
	st, err := s.load(ctx, instance, false)
	if err != nil {
		return nil, err
	}
	s.warm(st)
	out := make(map[mod.ID]Indicator, len(st.order))
	files := map[mod.ID]int{}
	for _, c := range st.eval.Conflicts {
		for _, p := range c.Providers {
			files[p]++
		}
	}
	unreviewed := map[mod.ID]int{}
	for _, ps := range conflict.Pairs(st.eval.Conflicts) {
		if v := st.pairView(ps); v.NeedsReview {
			unreviewed[ps.Pair.A]++
			unreviewed[ps.Pair.B]++
		}
	}
	for _, sl := range st.order {
		out[sl.Mod] = Indicator{Indicator: conflict.ModIndicator(sl.Mod, st.eval.Provided[sl.Mod], st.eval.Conflicts), Files: files[sl.Mod], Unreviewed: unreviewed[sl.Mod]}
	}
	return out, nil
}

// Cycle is the rule cycle of the instance, if any (DLG-12). User rules
// never close one (D028); it can only come from other sources.
type Cycle struct {
	Mods  []ModRef
	Rules []rules.OrderRule
}

// RuleCycle returns the cycle among enabled order rules, or nil.
func (s *Service) RuleCycle(ctx context.Context, instance game.InstanceID) (*Cycle, error) {
	st, err := s.load(ctx, instance, false)
	if err != nil {
		return nil, err
	}
	c, found := st.rules.Cycle()
	if !found {
		return nil, nil
	}
	out := &Cycle{}
	for _, it := range c.Items {
		out.Mods = append(out.Mods, st.ref(mod.ID(it)))
	}
	for _, e := range c.Edges {
		if r, ok := st.rules.OrderRule(rules.ID(e.Ref)); ok {
			out.Rules = append(out.Rules, r)
		}
	}
	return out, nil
}

// check reports mod_not_found for unknown mods.
func (st *state) check(ids ...mod.ID) error {
	for _, m := range ids {
		if _, ok := st.names[m]; !ok {
			return fail(CodeModNotFound, nil, "mod", string(m))
		}
	}
	return nil
}
