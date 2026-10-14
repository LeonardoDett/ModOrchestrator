package rules

import (
	"slices"
	"strings"

	"modorchestrator/internal/core/domain/mod"
)

// Chain returns the enabled order rules that put loser below winner
// through other mods (B4): the shortest path, ties broken by mod id, so
// the answer is stable. A direct rule between the two is not a chain, and
// nil means the rules leave the pair to the priority or to a direct rule.
func (s *Set) Chain(loser, winner mod.ID) []OrderRule {
	next := map[mod.ID][]OrderRule{}
	for _, r := range s.order {
		if r.Disabled || (r.Before == loser && r.After == winner) {
			continue
		}
		next[r.Before] = append(next[r.Before], r)
	}
	for _, rs := range next {
		slices.SortFunc(rs, func(a, b OrderRule) int {
			if c := strings.Compare(string(a.After), string(b.After)); c != 0 {
				return c
			}
			return strings.Compare(string(a.ID), string(b.ID))
		})
	}
	via := map[mod.ID]OrderRule{}
	seen := map[mod.ID]bool{loser: true}
	queue := []mod.ID{loser}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for _, r := range next[cur] {
			if seen[r.After] {
				continue
			}
			seen[r.After], via[r.After] = true, r
			if r.After != winner {
				queue = append(queue, r.After)
				continue
			}
			var out []OrderRule
			for m := winner; m != loser; m = via[m].Before {
				out = append(out, via[m])
			}
			slices.Reverse(out)
			return out
		}
	}
	return nil
}

// SuggestionReason says which fact a winner suggestion comes from (D126).
type SuggestionReason string

const (
	// SuggestRequires: the winner depends on the other mod (a patch or an
	// add-on is meant to overwrite what it builds on).
	SuggestRequires SuggestionReason = "requires"
	// SuggestMetadata: an order rule the mods' own metadata declared.
	SuggestMetadata SuggestionReason = "metadata_rule"
)

// Suggestion is the winner the facts point at for a pair, with the rule
// that is the fact. It is computed on every read, never stored, and never
// applied by itself (D004, D126).
type Suggestion struct {
	Winner mod.ID
	Reason SuggestionReason
	Rule   ID
}

// Suggest gives the winner of the pair a, b that the enabled rules point
// at: a dependency between the two (the mod that requires or recommends
// the other wins), then a direct order rule from metadata. No fact, or
// facts that disagree, give no suggestion.
func (s *Set) Suggest(a, b mod.ID) (Suggestion, bool) {
	var facts []Suggestion
	deps := slices.Clone(s.deps)
	slices.SortFunc(deps, func(x, y DependencyRule) int { return strings.Compare(string(x.ID), string(y.ID)) })
	for _, r := range deps {
		if !r.Disabled && ((r.Mod == a && r.Target == b) || (r.Mod == b && r.Target == a)) {
			facts = append(facts, Suggestion{Winner: r.Mod, Reason: SuggestRequires, Rule: r.ID})
		}
	}
	order := slices.Clone(s.order)
	slices.SortFunc(order, func(x, y OrderRule) int { return strings.Compare(string(x.ID), string(y.ID)) })
	for _, r := range order {
		if !r.Disabled && r.Source == SourceMetadata && ((r.Before == a && r.After == b) || (r.Before == b && r.After == a)) {
			facts = append(facts, Suggestion{Winner: r.After, Reason: SuggestMetadata, Rule: r.ID})
		}
	}
	if len(facts) == 0 || slices.ContainsFunc(facts, func(f Suggestion) bool { return f.Winner != facts[0].Winner }) {
		return Suggestion{}, false
	}
	return facts[0], true
}
