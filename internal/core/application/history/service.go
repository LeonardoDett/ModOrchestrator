// Package history is the readable projection of events (core/10 §3): who
// did what, to what, when, in which profile, with filters, and the
// reversal of the entries that only changed desired state. A reversal is a
// new command with its own entry (payload revertOf); history is never
// erased except by the retention (history.retentionDays).
package history

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"strconv"
	"strings"
	"time"

	"modorchestrator/internal/core/application/library"
	"modorchestrator/internal/core/application/ports"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/profile"
	"modorchestrator/internal/core/domain/relpath"
	"modorchestrator/internal/core/domain/rules"
)

// Types the history can revert (core/10 §3: enable/disable, order, rules,
// overrides, active profile, attributes).
const (
	typeModEnabled     = "mod.enabled"
	typeModDisabled    = "mod.disabled"
	typeOrderChanged   = "order.changed"
	typeRuleCreated    = "rule.created"
	typeRuleRemoved    = "rule.removed"
	typeRuleDisabled   = "rule.disabled"
	typeRuleEnabled    = "rule.enabled"
	typeOverrideSet    = "override.set"
	typeOverrideClear  = "override.cleared"
	typeExclusionSet   = "exclusion.set"
	typeExclusionClear = "exclusion.cleared"
	typeActivated      = "profile.activated"
	typeAttributes     = "mod.attributes_changed"
)

// hidden are event types that are delivery or bookkeeping, not actions.
var hidden = []string{"operation.", "diagnostics.", "notification.", "deployment.planned", "deployment.status_changed"}

// Error is a failure with a stable code and parameters (D044).
type Error struct {
	code   string
	params map[string]string
	cause  error
}

func (e *Error) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("history: %s: %v", e.code, e.cause)
	}
	return "history: " + e.code
}

func (e *Error) Unwrap() error             { return e.cause }
func (e *Error) Code() string              { return e.code }
func (e *Error) Params() map[string]string { return maps.Clone(e.params) }

// Error codes.
const (
	CodeNotFound        = "history_entry_not_found"
	CodeNotReversible   = "history_not_reversible"
	CodeAlreadyReverted = "history_already_reverted"
	// CodeStale: the state changed since the entry, so its inverse is no
	// longer the safe opposite (the user acts on the current state).
	CodeStale = "history_stale"
)

func fail(code string, cause error, kv ...string) *Error {
	e := &Error{code: code, cause: cause, params: map[string]string{}}
	for i := 0; i+1 < len(kv); i += 2 {
		e.params[kv[i]] = kv[i+1]
	}
	return e
}

// Profiles executes the profile-side reversals.
type Profiles interface {
	SetModsEnabledIn(ctx context.Context, id profile.ID, ids []mod.ID, enabled bool) error
	IsModEnabled(ctx context.Context, id profile.ID, m mod.ID) (bool, error)
	RevertOrderChange(ctx context.Context, instance game.InstanceID, id string) error
	RemoveRule(ctx context.Context, instance game.InstanceID, id rules.ID) error
	RestoreRule(ctx context.Context, instance game.InstanceID, desc map[string]string) (rules.ID, error)
	SetRuleDisabled(ctx context.Context, instance game.InstanceID, id rules.ID, disabled bool) error
	RuleExists(ctx context.Context, instance game.InstanceID, id rules.ID) (exists, disabled bool, err error)
	Activate(ctx context.Context, id profile.ID) error
	ActiveProfile(ctx context.Context, instance game.InstanceID) (profile.ID, error)
}

// Conflicts executes the override and exclusion reversals.
type Conflicts interface {
	SetFileOverrides(ctx context.Context, instance game.InstanceID, winner mod.ID, locs []game.Location) error
	ClearFileOverrides(ctx context.Context, instance game.InstanceID, locs []game.Location) error
	SetFileExclusions(ctx context.Context, instance game.InstanceID, m mod.ID, locs []game.Location, hidden bool) error
}

// Library executes the attribute reversal.
type Library interface {
	SetAttributes(ctx context.Context, id mod.ID, in library.AttributesInput) error
}

// Settings reads the retention.
type Settings interface {
	AppValue(ctx context.Context, key string) (appsettings.Effective, error)
}

// Deps are the ports the service needs.
type Deps struct {
	History   ports.History
	Mods      ports.Mods
	Profiles  ports.Profiles
	Settings  Settings
	Commands  Profiles
	Conflicts Conflicts
	Library   Library
	Clock     interface{ Now() time.Time }
}

// Service implements the history use cases.
type Service struct{ Deps }

// NewService wires the service.
func NewService(d Deps) *Service { return &Service{Deps: d} }

// Filter selects history entries (ui/telas/diagnostics.md §2 Histórico).
type Filter struct {
	Instance game.InstanceID
	Profile  string
	Mod      string
	// Types keeps entries whose type starts with one of them ("mod.",
	// "rule.", "order.changed"...).
	Types  []string
	Origin string
	From   time.Time
	To     time.Time
	// Before pages backwards by sequence; Limit bounds the page.
	Before int64
	Limit  int
}

// Entry is one line of history.
type Entry struct {
	ID        string
	Sequence  int64
	Type      string
	At        time.Time
	Origin    string
	Subject   event.EntityRef
	Operation string
	Params    map[string]string
	// Items is how many things the entry changed (confirmation above 10).
	Items      int
	Reversible bool
	RevertedBy string
	RevertOf   string
}

func (s *Service) retention(ctx context.Context) time.Duration {
	days := 180
	if v, err := s.Settings.AppValue(ctx, "history.retentionDays"); err == nil {
		if n, err := strconv.Atoi(v.Value); err == nil && n > 0 {
			days = n
		}
	}
	return time.Duration(days) * 24 * time.Hour
}

// List returns history entries, newest first, within the retention.
func (s *Service) List(ctx context.Context, f Filter) ([]Entry, error) {
	from := s.Clock.Now().Add(-s.retention(ctx))
	if f.From.After(from) {
		from = f.From
	}
	evs, err := s.History.Query(ctx, ports.HistoryQuery{
		Instance: f.Instance, Profile: f.Profile, Mod: f.Mod, TypePrefixes: f.Types, Exclude: hidden,
		Origin: f.Origin, From: from, To: f.To, Before: f.Before, Limit: f.Limit,
	})
	if err != nil {
		return nil, err
	}
	ids := make([]string, len(evs))
	for i, e := range evs {
		ids[i] = e.ID
	}
	reverted, err := s.History.Reverted(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make([]Entry, len(evs))
	for i, e := range evs {
		out[i] = entryOf(e, reverted[e.ID])
	}
	return out, nil
}

func entryOf(e event.Event, revertedBy string) Entry {
	p, _ := e.Payload.(map[string]string)
	params := maps.Clone(p)
	delete(params, "before")
	delete(params, "after")
	delete(params, "locations")
	delete(params, "previous")
	delete(params, "winners")
	origin := p[ports.TagOrigin]
	if origin == "" {
		origin = ports.OriginUser
	}
	en := Entry{
		ID: e.ID, Sequence: e.Sequence, Type: string(e.Type), At: e.OccurredAt, Origin: origin, Subject: e.Subject,
		Operation: e.OperationID, Params: params, Items: 1, RevertedBy: revertedBy, RevertOf: p[ports.TagRevertOf],
	}
	for _, k := range []string{"count", "moved"} {
		if n, err := strconv.Atoi(p[k]); err == nil && n > 0 {
			en.Items = n
		}
	}
	en.Reversible = revertedBy == "" && reversible(string(e.Type), p)
	return en
}

// reversible reports whether the entry carries what its inverse needs.
func reversible(t string, p map[string]string) bool {
	switch t {
	case typeModEnabled, typeModDisabled:
		return p["profile"] != ""
	case typeOrderChanged:
		return p["before"] != "" && p["after"] != ""
	case typeRuleCreated, typeRuleDisabled, typeRuleEnabled:
		return p["rule"] != ""
	case typeRuleRemoved:
		return p["kind"] != ""
	case typeOverrideSet:
		return p["locations"] != "" && p["winner"] != ""
	case typeOverrideClear:
		return p["locations"] != "" && p["winners"] != ""
	case typeExclusionSet, typeExclusionClear:
		return p["locations"] != "" && p["mod"] != ""
	case typeActivated:
		return p["previous"] != ""
	case typeAttributes:
		return p["before"] != ""
	}
	return false
}

// Revert applies the inverse of an entry as a new command whose events
// carry revertOf (core/10 §3). The entry must still describe the current
// state; otherwise the reversal is refused (history_stale) rather than
// guessing.
func (s *Service) Revert(ctx context.Context, id string) error {
	e, err := s.History.ByID(ctx, id)
	if errors.Is(err, ports.ErrNotFound) {
		return fail(CodeNotFound, err, "entry", id)
	}
	if err != nil {
		return err
	}
	p, _ := e.Payload.(map[string]string)
	if !reversible(string(e.Type), p) {
		return fail(CodeNotReversible, nil, "type", string(e.Type))
	}
	if rev, err := s.History.Reverted(ctx, []string{id}); err != nil {
		return err
	} else if rev[id] != "" {
		return fail(CodeAlreadyReverted, nil, "entry", id)
	}
	instance, err := s.instanceOf(ctx, e, p)
	if err != nil {
		return err
	}
	ctx = ports.WithEventTags(ctx, map[string]string{ports.TagRevertOf: id})
	switch string(e.Type) {
	case typeModEnabled, typeModDisabled:
		pid, m := profile.ID(p["profile"]), mod.ID(e.Subject.ID)
		was := string(e.Type) == typeModEnabled
		now, err := s.Commands.IsModEnabled(ctx, pid, m)
		if err != nil {
			return fail(CodeStale, err)
		}
		if now != was {
			return fail(CodeStale, nil)
		}
		return s.Commands.SetModsEnabledIn(ctx, pid, []mod.ID{m}, !was)
	case typeOrderChanged:
		return s.Commands.RevertOrderChange(ctx, instance, id)
	case typeRuleCreated:
		r := rules.ID(p["rule"])
		exists, disabled, err := s.Commands.RuleExists(ctx, instance, r)
		if err != nil {
			return err
		}
		if !exists || disabled {
			return fail(CodeStale, nil)
		}
		if src := p["source"]; src != "" && src != string(rules.SourceUser) {
			return s.Commands.SetRuleDisabled(ctx, instance, r, true)
		}
		return s.Commands.RemoveRule(ctx, instance, r)
	case typeRuleRemoved:
		_, err := s.Commands.RestoreRule(ctx, instance, p)
		return err
	case typeRuleDisabled, typeRuleEnabled:
		r := rules.ID(p["rule"])
		wasDisabled := string(e.Type) == typeRuleDisabled
		exists, disabled, err := s.Commands.RuleExists(ctx, instance, r)
		if err != nil {
			return err
		}
		if !exists || disabled != wasDisabled {
			return fail(CodeStale, nil)
		}
		return s.Commands.SetRuleDisabled(ctx, instance, r, !wasDisabled)
	case typeOverrideSet:
		return s.restoreOverrides(ctx, instance, p["locations"], p["previous"])
	case typeOverrideClear:
		return s.restoreOverrides(ctx, instance, p["locations"], p["winners"])
	case typeExclusionSet, typeExclusionClear:
		locs, err := locations(p["locations"])
		if err != nil {
			return err
		}
		return s.Conflicts.SetFileExclusions(ctx, instance, mod.ID(p["mod"]), locs, string(e.Type) == typeExclusionClear)
	case typeActivated:
		active, err := s.Commands.ActiveProfile(ctx, instance)
		if err != nil {
			return err
		}
		if string(active) != e.Subject.ID {
			return fail(CodeStale, nil)
		}
		return s.Commands.Activate(ctx, profile.ID(p["previous"]))
	case typeAttributes:
		var before library.AttributesInput
		if err := json.Unmarshal([]byte(p["before"]), &before); err != nil {
			return fail(CodeNotReversible, err, "type", string(e.Type))
		}
		return s.Library.SetAttributes(ctx, mod.ID(e.Subject.ID), before)
	}
	return fail(CodeNotReversible, nil, "type", string(e.Type))
}

// restoreOverrides sets each location back to the winner it had ("" = no
// override), one batch per winner.
func (s *Service) restoreOverrides(ctx context.Context, instance game.InstanceID, locList, winnerList string) error {
	locs, err := locations(locList)
	if err != nil {
		return err
	}
	winners := strings.Split(winnerList, "\n")
	if len(winners) != len(locs) {
		return fail(CodeNotReversible, nil)
	}
	groups := map[string][]game.Location{}
	var order []string
	for i, l := range locs {
		w := winners[i]
		if _, ok := groups[w]; !ok {
			order = append(order, w)
		}
		groups[w] = append(groups[w], l)
	}
	for _, w := range order {
		if w == "" {
			err = s.Conflicts.ClearFileOverrides(ctx, instance, groups[w])
		} else {
			err = s.Conflicts.SetFileOverrides(ctx, instance, mod.ID(w), groups[w])
		}
		if err != nil {
			return err
		}
	}
	return nil
}

func locations(list string) ([]game.Location, error) {
	var out []game.Location
	for _, line := range strings.Split(list, "\n") {
		t, p, ok := strings.Cut(line, ":")
		if !ok {
			return nil, fail(CodeNotReversible, nil)
		}
		rp, err := relpath.Parse(p)
		if err != nil {
			return nil, fail(CodeNotReversible, err)
		}
		out = append(out, game.Location{Target: game.TargetID(t), Path: rp})
	}
	return out, nil
}

// instanceOf resolves the instance an entry is about.
func (s *Service) instanceOf(ctx context.Context, e event.Event, p map[string]string) (game.InstanceID, error) {
	if v := p["instance"]; v != "" {
		return game.InstanceID(v), nil
	}
	switch e.Subject.Kind {
	case "instance":
		return game.InstanceID(e.Subject.ID), nil
	case "mod":
		m, err := s.Mods.Get(ctx, mod.ID(e.Subject.ID))
		if err != nil {
			return "", fail(CodeStale, err)
		}
		return m.Instance, nil
	case "profile":
		pr, err := s.Profiles.Get(ctx, profile.ID(e.Subject.ID))
		if err != nil {
			return "", fail(CodeStale, err)
		}
		return pr.Instance(), nil
	}
	return "", fail(CodeNotReversible, nil, "type", string(e.Type))
}

// Prune applies the retention to the stored events (startup).
func (s *Service) Prune(ctx context.Context) (int, error) {
	return s.History.Prune(ctx, s.Clock.Now().Add(-s.retention(ctx)))
}
