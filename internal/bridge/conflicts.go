package bridge

import (
	"modorchestrator/internal/core/application/conflicts"
	"modorchestrator/internal/core/application/profiles"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/override"
	"modorchestrator/internal/core/domain/relpath"
)

// Conflicts bridge (ui/telas/conflicts.md §6, ui/telas/mods.md §10,
// DLG-08/09/12). Every method only translates between DTOs and the
// conflicts service; none decides anything.

// CodeLocationInvalid rejects a location the UI sent that is not a valid
// relative path (INV-ID-02).
const CodeLocationInvalid = "location_invalid"

type LocationDTO struct {
	Target string `json:"target"`
	Path   string `json:"path"`
}

type ConflictModDTO struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Priority int    `json:"priority"`
	Enabled  bool   `json:"enabled"`
}

type PairRuleDTO struct {
	ID       string `json:"id"`
	Winner   string `json:"winner"`
	Source   string `json:"source"`
	Disabled bool   `json:"disabled"`
}

type ConflictPairDTO struct {
	A           ConflictModDTO `json:"a"`
	B           ConflictModDTO `json:"b"`
	Winner      string         `json:"winner"`
	Files       int            `json:"files"`
	WinsA       int            `json:"winsA"`
	WinsB       int            `json:"winsB"`
	Redundant   int            `json:"redundant"`
	Decision    string         `json:"decision"`
	Reviewed    bool           `json:"reviewed"`
	NeedsReview bool           `json:"needsReview"`
	Potential   bool           `json:"potential"`
	Rule        *PairRuleDTO   `json:"rule,omitempty"`
}

type ConflictTotalsDTO struct {
	Pairs      int `json:"pairs"`
	Unreviewed int `json:"unreviewed"`
	Override   int `json:"override"`
	Redundant  int `json:"redundant"`
	Rule       int `json:"rule"`
	Order      int `json:"order"`
	Mixed      int `json:"mixed"`
}

type StaleIntentDTO struct {
	Kind     string           `json:"kind"` // override | exclusion
	Location LocationDTO      `json:"location"`
	Mod      ConflictModDTO   `json:"mod"`
	Reason   string           `json:"reason"` // disabled | not_provider | missing
	Rivals   []ConflictModDTO `json:"rivals"`
}

type ConflictPairsDTO struct {
	Pairs         []ConflictPairDTO `json:"pairs"`
	Totals        ConflictTotalsDTO `json:"totals"`
	Stale         []StaleIntentDTO  `json:"stale"`
	PendingHashes int               `json:"pendingHashes"`
}

type ConflictProviderDTO struct {
	ConflictModDTO
	Size int64  `json:"size"`
	Hash string `json:"hash,omitempty"`
}

type ConflictFileDTO struct {
	Location   LocationDTO           `json:"location"`
	Providers  []ConflictProviderDTO `json:"providers"`
	Winner     string                `json:"winner"`
	Resolution string                `json:"resolution"`
	Override   string                `json:"override,omitempty"`
}

type ConflictPairDetailDTO struct {
	Pair          ConflictPairDTO   `json:"pair"`
	Files         []ConflictFileDTO `json:"files"`
	PendingHashes int               `json:"pendingHashes"`
}

type ConflictOpponentDTO struct {
	Opponent    ConflictModDTO `json:"opponent"`
	Files       int            `json:"files"`
	Wins        int            `json:"wins"`
	Loses       int            `json:"loses"`
	Redundant   int            `json:"redundant"`
	Decision    string         `json:"decision"`
	Reviewed    bool           `json:"reviewed"`
	NeedsReview bool           `json:"needsReview"`
	Rule        *PairRuleDTO   `json:"rule,omitempty"`
}

type ModConflictsDTO struct {
	Mod       ConflictModDTO        `json:"mod"`
	Indicator string                `json:"indicator"`
	Opponents []ConflictOpponentDTO `json:"opponents"`
}

type ModConflictFileDTO struct {
	Location   LocationDTO      `json:"location"`
	Size       int64            `json:"size"`
	State      string           `json:"state"` // none | wins | loses | redundant | hidden
	Winner     *ConflictModDTO  `json:"winner,omitempty"`
	Opponents  []ConflictModDTO `json:"opponents"`
	Overridden bool             `json:"overridden"`
}

type ModConflictFilesDTO struct {
	Total int                  `json:"total"`
	Files []ModConflictFileDTO `json:"files"`
}

type ConflictIndicatorDTO struct {
	ModID      string `json:"modId"`
	Indicator  string `json:"indicator"`
	Files      int    `json:"files"`
	Unreviewed int    `json:"unreviewed"`
}

type PairRefDTO struct {
	A string `json:"a"`
	B string `json:"b"`
}

type PairDecisionDTO struct {
	Mod      string `json:"mod"`
	Opponent string `json:"opponent"`
	Choice   string `json:"choice"` // wins | loses | order
}

type CycleRuleDTO struct {
	ID     string      `json:"id"`
	Winner NamedModDTO `json:"winner"`
	Loser  NamedModDTO `json:"loser"`
	Source string      `json:"source"`
}

type RuleCycleDTO struct {
	Mods  []ConflictModDTO `json:"mods"`
	Rules []CycleRuleDTO   `json:"rules"`
}

func toConflictMod(r conflicts.ModRef) ConflictModDTO {
	return ConflictModDTO{ID: string(r.ID), Name: r.Name, Priority: r.Priority, Enabled: r.Enabled}
}

func toLocationDTO(l game.Location) LocationDTO {
	return LocationDTO{Target: string(l.Target), Path: l.Path.String()}
}

func toPairRule(r *profiles.PairRule) *PairRuleDTO {
	if r == nil {
		return nil
	}
	return &PairRuleDTO{ID: string(r.ID), Winner: string(r.Winner), Source: string(r.Source), Disabled: r.Disabled}
}

func toPairDTO(p conflicts.PairView) ConflictPairDTO {
	return ConflictPairDTO{
		A: toConflictMod(p.A), B: toConflictMod(p.B), Winner: string(p.Winner().ID), Files: p.Files, WinsA: p.WinsA, WinsB: p.WinsB,
		Redundant: p.Redundant, Decision: string(p.Decision), Reviewed: p.Reviewed, NeedsReview: p.NeedsReview,
		Potential: p.Potential, Rule: toPairRule(p.Rule),
	}
}

func toLocations(list []LocationDTO) ([]game.Location, error) {
	out := make([]game.Location, len(list))
	for i, l := range list {
		p, err := relpath.Parse(l.Path)
		if err != nil || l.Target == "" {
			return nil, &Error{Code: CodeLocationInvalid, Params: map[string]string{"path": l.Path}}
		}
		out[i] = game.Location{Target: game.TargetID(l.Target), Path: p}
	}
	return out, nil
}

// ConflictPairs returns the disputed pairs of the active profile, filtered
// by mod name or file path.
func (a *App) ConflictPairs(instance string, includeDisabled bool, search string) (ConflictPairsDTO, error) {
	v, err := a.c.Conflicts.Pairs(a.context(), game.InstanceID(instance), includeDisabled, search)
	if err != nil {
		return ConflictPairsDTO{}, a.fail("conflict pairs", err, map[string]string{"instance": instance})
	}
	out := ConflictPairsDTO{Pairs: []ConflictPairDTO{}, Stale: []StaleIntentDTO{}, PendingHashes: v.PendingHashes, Totals: ConflictTotalsDTO(v.Totals)}
	for _, p := range v.Pairs {
		out.Pairs = append(out.Pairs, toPairDTO(p))
	}
	for _, s := range v.Stale {
		st := StaleIntentDTO{Kind: s.Kind, Location: toLocationDTO(s.Location), Mod: toConflictMod(s.Mod), Reason: string(s.Reason), Rivals: []ConflictModDTO{}}
		for _, r := range s.Rivals {
			st.Rivals = append(st.Rivals, toConflictMod(r))
		}
		out.Stale = append(out.Stale, st)
	}
	return out, nil
}

// ConflictPairDetail returns the files disputed by two mods.
func (a *App) ConflictPairDetail(instance, modA, modB string, includeDisabled bool) (ConflictPairDetailDTO, error) {
	d, err := a.c.Conflicts.PairDetail(a.context(), game.InstanceID(instance), mod.ID(modA), mod.ID(modB), includeDisabled)
	if err != nil {
		return ConflictPairDetailDTO{}, a.fail("conflict pair", err, nil)
	}
	out := ConflictPairDetailDTO{Pair: toPairDTO(d.Pair), Files: make([]ConflictFileDTO, len(d.Files)), PendingHashes: d.PendingHashes}
	for i, f := range d.Files {
		fd := ConflictFileDTO{Location: toLocationDTO(f.Location), Winner: string(f.Winner), Resolution: string(f.Resolution), Override: string(f.Override), Providers: make([]ConflictProviderDTO, len(f.Providers))}
		for j, p := range f.Providers {
			fd.Providers[j] = ConflictProviderDTO{ConflictModDTO: toConflictMod(p.ModRef), Size: p.Size, Hash: p.Hash}
		}
		out.Files[i] = fd
	}
	return out, nil
}

// ModConflicts returns the disputes of one mod by opponent.
func (a *App) ModConflicts(instance, modID string) (ModConflictsDTO, error) {
	v, err := a.c.Conflicts.ModConflicts(a.context(), game.InstanceID(instance), mod.ID(modID))
	if err != nil {
		return ModConflictsDTO{}, a.fail("mod conflicts", err, map[string]string{"mod": modID})
	}
	out := ModConflictsDTO{Mod: toConflictMod(v.Mod), Indicator: string(v.Indicator), Opponents: []ConflictOpponentDTO{}}
	for _, o := range v.Opponents {
		out.Opponents = append(out.Opponents, ConflictOpponentDTO{
			Opponent: toConflictMod(o.Opponent), Files: o.Files, Wins: o.Wins, Loses: o.Loses, Redundant: o.Redundant,
			Decision: string(o.Decision), Reviewed: o.Reviewed, NeedsReview: o.NeedsReview, Rule: toPairRule(o.Rule),
		})
	}
	return out, nil
}

// ModConflictFiles lists the files of a mod with their conflict marks.
func (a *App) ModConflictFiles(instance, modID, filter string, offset, limit int) (ModConflictFilesDTO, error) {
	p, err := a.c.Conflicts.ModFiles(a.context(), game.InstanceID(instance), mod.ID(modID), filter, offset, limit)
	if err != nil {
		return ModConflictFilesDTO{}, a.fail("mod files", err, map[string]string{"mod": modID})
	}
	out := ModConflictFilesDTO{Total: p.Total, Files: make([]ModConflictFileDTO, len(p.Files))}
	for i, f := range p.Files {
		fd := ModConflictFileDTO{Location: toLocationDTO(f.Location), Size: f.Size, State: string(f.State), Overridden: f.Overridden, Opponents: []ConflictModDTO{}}
		if f.Winner != nil {
			w := toConflictMod(*f.Winner)
			fd.Winner = &w
		}
		for _, o := range f.Opponents {
			fd.Opponents = append(fd.Opponents, toConflictMod(o))
		}
		out.Files[i] = fd
	}
	return out, nil
}

// ConflictIndicators returns the conflict indicator of every mod.
func (a *App) ConflictIndicators(instance string) ([]ConflictIndicatorDTO, error) {
	m, err := a.c.Conflicts.Indicators(a.context(), game.InstanceID(instance))
	if err != nil {
		return nil, a.fail("conflict indicators", err, map[string]string{"instance": instance})
	}
	out := make([]ConflictIndicatorDTO, 0, len(m))
	for id, ind := range m {
		out = append(out, ConflictIndicatorDTO{ModID: string(id), Indicator: string(ind.Indicator), Files: ind.Files, Unreviewed: ind.Unreviewed})
	}
	return out, nil
}

// RuleCycle returns the rule cycle of the instance (DLG-12), or null.
func (a *App) RuleCycle(instance string) (*RuleCycleDTO, error) {
	c, err := a.c.Conflicts.RuleCycle(a.context(), game.InstanceID(instance))
	if err != nil {
		return nil, a.fail("rule cycle", err, nil)
	}
	if c == nil {
		return nil, nil
	}
	out := &RuleCycleDTO{Mods: []ConflictModDTO{}, Rules: []CycleRuleDTO{}}
	names := map[mod.ID]string{}
	for _, m := range c.Mods {
		out.Mods = append(out.Mods, toConflictMod(m))
		names[m.ID] = m.Name
	}
	for _, r := range c.Rules {
		out.Rules = append(out.Rules, CycleRuleDTO{
			ID: string(r.ID), Source: string(r.Source),
			Winner: NamedModDTO{ID: string(r.After), Name: names[r.After]}, Loser: NamedModDTO{ID: string(r.Before), Name: names[r.Before]},
		})
	}
	return out, nil
}

// SetFileOverrides chooses the winner of locations (DLG-09).
func (a *App) SetFileOverrides(instance, winner string, locations []LocationDTO) error {
	locs, err := toLocations(locations)
	if err != nil {
		return err
	}
	if err := a.c.Conflicts.SetFileOverrides(a.context(), game.InstanceID(instance), mod.ID(winner), locs); err != nil {
		return a.fail("set overrides", err, nil)
	}
	return nil
}

// ClearFileOverrides returns locations to the default winner.
func (a *App) ClearFileOverrides(instance string, locations []LocationDTO) error {
	locs, err := toLocations(locations)
	if err != nil {
		return err
	}
	if err := a.c.Conflicts.ClearFileOverrides(a.context(), game.InstanceID(instance), locs); err != nil {
		return a.fail("clear overrides", err, nil)
	}
	return nil
}

// SetFileExclusions hides files of a mod or shows them again.
func (a *App) SetFileExclusions(instance, modID string, locations []LocationDTO, hidden bool) error {
	locs, err := toLocations(locations)
	if err != nil {
		return err
	}
	if err := a.c.Conflicts.SetFileExclusions(a.context(), game.InstanceID(instance), mod.ID(modID), locs, hidden); err != nil {
		return a.fail("set exclusions", err, map[string]string{"mod": modID})
	}
	return nil
}

// MarkConflictsReviewed marks pairs as reviewed.
func (a *App) MarkConflictsReviewed(instance string, pairs []PairRefDTO) error {
	list := make([]override.Pair, len(pairs))
	for i, p := range pairs {
		list[i] = override.NewPair(mod.ID(p.A), mod.ID(p.B))
	}
	if err := a.c.Conflicts.MarkReviewed(a.context(), game.InstanceID(instance), list); err != nil {
		return a.fail("mark reviewed", err, nil)
	}
	return nil
}

func toDecisions(list []PairDecisionDTO) []profiles.PairDecision {
	out := make([]profiles.PairDecision, len(list))
	for i, d := range list {
		out[i] = profiles.PairDecision{Mod: mod.ID(d.Mod), Opponent: mod.ID(d.Opponent), Choice: profiles.PairChoice(d.Choice)}
	}
	return out
}

// PreviewPairDecisions shows what pair decisions would move, or the cycle.
func (a *App) PreviewPairDecisions(instance string, decisions []PairDecisionDTO) (RulePreviewDTO, error) {
	p, err := a.c.Conflicts.PreviewPairDecisions(a.context(), game.InstanceID(instance), toDecisions(decisions))
	if err != nil {
		return RulePreviewDTO{}, a.fail("preview decisions", err, nil)
	}
	return toRulePreviewDTO(p), nil
}

// DecidePairs saves pair decisions as order rules and reviews the pairs.
func (a *App) DecidePairs(instance string, decisions []PairDecisionDTO) error {
	if err := a.c.Conflicts.DecidePairs(a.context(), game.InstanceID(instance), toDecisions(decisions)); err != nil {
		return a.fail("decide pairs", err, nil)
	}
	return nil
}
