// Package overview answers the read-only screens that summarise the state
// of the app: the Overview of a game (ui/telas/overview.md §3, one query
// InstanceOverview) and the dashlets of the Dashboard that are not lists of
// another screen (ui/telas/dashboard.md §2: first steps, recent games,
// active game, layout). Every figure is calculated on each read from the
// services that own it; nothing here is persisted (anti-pattern 13), and
// nothing is invented when a source cannot be read: that part is reported
// as unavailable (D021).
package overview

import (
	"context"
	"errors"
	"slices"
	"time"

	"modorchestrator/internal/core/application/conflicts"
	"modorchestrator/internal/core/application/deployment"
	"modorchestrator/internal/core/application/diagnostics"
	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/history"
	"modorchestrator/internal/core/application/library"
	"modorchestrator/internal/core/application/plugins"
	"modorchestrator/internal/core/application/ports"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	domainsettings "modorchestrator/internal/core/domain/settings"
)

// Sources are the services the summaries read.
type Sources struct {
	Games interface {
		Details(ctx context.Context, id game.InstanceID) (games.Managed, error)
		Active(ctx context.Context) (game.InstanceID, error)
		Recent(ctx context.Context, limit int) ([]games.Recent, error)
	}
	Instances ports.GameInstances
	Deploy    interface {
		Status(ctx context.Context, instance game.InstanceID) (deployment.StatusView, error)
	}
	Diagnostics interface {
		Problems(ctx context.Context, instance game.InstanceID) (diagnostics.View, error)
		Attention(ctx context.Context) ([]diagnostics.View, error)
	}
	Library interface {
		ModList(ctx context.Context, instance game.InstanceID) ([]library.ModRow, error)
	}
	Conflicts interface {
		Pairs(ctx context.Context, instance game.InstanceID, includeDisabled bool, search string) (conflicts.PairsView, error)
	}
	Plugins interface {
		Supported(ctx context.Context, instance game.InstanceID) bool
		List(ctx context.Context, instance game.InstanceID) (plugins.ListView, error)
	}
	History interface {
		List(ctx context.Context, f history.Filter) ([]history.Entry, error)
	}
	Settings interface {
		AppValue(ctx context.Context, key string) (appsettings.Effective, error)
	}
	// Facts answers the first-steps checklist.
	Facts interface {
		// Launched reports whether any game was ever launched from the app.
		Launched(ctx context.Context) (bool, error)
		// Deployed reports whether any instance has a deploy recorded.
		Deployed(ctx context.Context) (bool, error)
	}
}

// Service builds the summaries.
type Service struct{ Sources }

// NewService wires the service.
func NewService(s Sources) *Service { return &Service{Sources: s} }

// AttentionGroup is one line of "Precisa de atenção": the visible
// diagnostics of one code, with the first of them for its action.
type AttentionGroup struct {
	Code     diagnostic.Code
	Severity diagnostic.Severity
	Blocking bool
	Count    int
	First    diagnostic.Diagnostic
}

// ModsSummary counts the mods of the instance.
type ModsSummary struct {
	Enabled, Total int
	// Size and Files are the installed footprint (all installed mods).
	Size  int64
	Files int
}

// PluginsSummary counts the active plugins and their limits.
type PluginsSummary struct {
	Active int
	Limits []LimitView
}

// LimitView is the use of one plugin limit.
type LimitView struct {
	Kind      string
	Used, Max int
}

// ConflictsSummary counts the disputed pairs.
type ConflictsSummary struct {
	Pairs, Unreviewed, Overrides int
}

// InstanceView is the Overview of a game. A nil part could not be read
// (the screen says so instead of showing zero).
type InstanceView struct {
	Instance  games.Managed
	Status    *deployment.StatusView
	Attention []AttentionGroup
	// AttentionPartial: a group of checks could not run.
	AttentionPartial bool
	Mods             *ModsSummary
	Plugins          *PluginsSummary
	Conflicts        *ConflictsSummary
	Recent           []history.Entry
}

// recentActivity is how many history entries the Overview shows.
const recentActivity = 5

// Instance builds the Overview of an instance.
func (s *Service) Instance(ctx context.Context, id game.InstanceID) (InstanceView, error) {
	d, err := s.Games.Details(ctx, id)
	if err != nil {
		return InstanceView{}, err
	}
	v := InstanceView{Instance: d}
	if st, err := s.Deploy.Status(ctx, id); err == nil {
		v.Status = &st
	}
	if p, err := s.Diagnostics.Problems(ctx, id); err == nil {
		v.Attention, v.AttentionPartial = group(p.Items), p.Partial
	} else {
		v.AttentionPartial = true
	}
	if rows, err := s.Library.ModList(ctx, id); err == nil {
		m := &ModsSummary{}
		for _, r := range rows {
			if r.State != mod.StateInstalled {
				continue
			}
			m.Total++
			if r.Enabled {
				m.Enabled++
			}
			m.Size += r.Size
			m.Files += r.Files
		}
		v.Mods = m
	}
	if pv, err := s.Conflicts.Pairs(ctx, id, false, ""); err == nil {
		v.Conflicts = &ConflictsSummary{Pairs: pv.Totals.Pairs, Unreviewed: pv.Totals.Unreviewed, Overrides: pv.Totals.Override}
	}
	if s.Plugins != nil && s.Plugins.Supported(ctx, id) {
		if pl, err := s.Plugins.List(ctx, id); err == nil {
			p := &PluginsSummary{Active: pl.Active}
			for _, l := range pl.Limits {
				p.Limits = append(p.Limits, LimitView{Kind: l.Kind, Used: l.Used, Max: l.Max})
			}
			v.Plugins = p
		}
	}
	if es, err := s.History.List(ctx, history.Filter{Instance: id, Limit: recentActivity}); err == nil {
		v.Recent = es
	}
	return v, nil
}

// group folds visible diagnostics by code, keeping their order (most
// severe first, core/10 §1).
func group(items []diagnostics.Item) []AttentionGroup {
	var out []AttentionGroup
	for _, it := range items {
		i := slices.IndexFunc(out, func(g AttentionGroup) bool { return g.Code == it.Code })
		if i < 0 {
			out = append(out, AttentionGroup{Code: it.Code, Severity: it.Severity, Blocking: it.IsBlocking(), First: it.Diagnostic})
			i = len(out) - 1
		}
		out[i].Count++
	}
	return out
}

// Step is one item of the first-steps checklist (ui/02 F-01).
type Step struct {
	ID   string // manage_game, import_mod, deploy, play
	Done bool
}

// FirstSteps is the "Primeiros passos" dashlet.
type FirstSteps struct {
	Steps    []Step
	Complete bool
}

// FirstSteps derives the checklist from facts: a managed game, a mod in
// any game, a deploy recorded, a game launched from the app.
func (s *Service) FirstSteps(ctx context.Context) (FirstSteps, error) {
	list, err := s.Instances.List(ctx)
	if err != nil {
		return FirstSteps{}, err
	}
	mods := false
	for _, inst := range list {
		rows, err := s.Library.ModList(ctx, inst.ID)
		if err != nil {
			return FirstSteps{}, err
		}
		if slices.ContainsFunc(rows, func(r library.ModRow) bool { return r.State == mod.StateInstalled }) {
			mods = true
			break
		}
	}
	deployed, err := s.Facts.Deployed(ctx)
	if err != nil {
		return FirstSteps{}, err
	}
	launched, err := s.Facts.Launched(ctx)
	if err != nil {
		return FirstSteps{}, err
	}
	f := FirstSteps{Steps: []Step{{"manage_game", len(list) > 0}, {"import_mod", mods}, {"deploy", deployed}, {"play", launched}}}
	f.Complete = !slices.ContainsFunc(f.Steps, func(s Step) bool { return !s.Done })
	return f, nil
}

// RecentGame is one line of "Jogos recentes".
type RecentGame struct {
	Instance games.Managed
	LastUsed time.Time
}

// recentGames is how many games the dashlet lists.
const recentGames = 5

// RecentGames lists the most recently used managed games.
func (s *Service) RecentGames(ctx context.Context) ([]RecentGame, error) {
	list, err := s.Games.Recent(ctx, recentGames)
	if err != nil {
		return nil, err
	}
	out := make([]RecentGame, 0, len(list))
	for _, r := range list {
		d, err := s.Games.Details(ctx, r.Instance.ID)
		if err != nil {
			if errors.Is(err, ports.ErrNotFound) {
				continue
			}
			return nil, err
		}
		out = append(out, RecentGame{Instance: d, LastUsed: r.LastUsed})
	}
	return out, nil
}

// Dashlet is one dashlet of the layout with its effective visibility.
type Dashlet struct {
	ID string
	// Hidden: the user hid it; Pinned: shown even when it would hide
	// itself; Visible: what the dashboard renders now.
	Hidden, Pinned, Visible bool
	// Locked: it cannot be hidden now ("Precisa de atenção" while a
	// blocking problem exists, ui/telas/dashboard.md §3).
	Locked bool
}

// Layout resolves ui.dashboard.dashlets with the rules of the dashboard:
// without managed games only "Primeiros passos" and "Novidades" show
// (§4); "Primeiros passos" hides itself once complete unless pinned; the
// attention dashlet cannot be hidden while something blocks.
func (s *Service) Layout(ctx context.Context) ([]Dashlet, error) {
	e, err := s.Settings.AppValue(ctx, "ui.dashboard.dashlets")
	if err != nil {
		return nil, err
	}
	items, err := domainsettings.ParseList(e.Value, domainsettings.Dashlets)
	if err != nil {
		return nil, err
	}
	list, err := s.Instances.List(ctx)
	if err != nil {
		return nil, err
	}
	steps, err := s.FirstSteps(ctx)
	if err != nil {
		return nil, err
	}
	blocking := false
	if views, err := s.Diagnostics.Attention(ctx); err == nil {
		for _, v := range views {
			if v.Counts.Blocking > 0 {
				blocking = true
			}
		}
	}
	out := make([]Dashlet, 0, len(items))
	for _, it := range items {
		d := Dashlet{ID: it.ID, Hidden: it.Mode == domainsettings.ListHidden, Pinned: it.Mode == domainsettings.ListPinned}
		d.Visible = !d.Hidden
		switch it.ID {
		case "first_steps":
			if steps.Complete && !d.Pinned {
				d.Visible = false
			}
		case "attention":
			if blocking {
				d.Locked, d.Visible = true, true
			}
		}
		if len(list) == 0 && it.ID != "first_steps" && it.ID != "whats_new" {
			d.Visible = false
		}
		out = append(out, d)
	}
	return out, nil
}

// ActiveGame is the "Status do jogo ativo" dashlet (nil instance: none).
type ActiveGame struct {
	Instance  *games.Managed
	Status    *deployment.StatusView
	Mods      *ModsSummary
	Conflicts *ConflictsSummary
}

// ActiveGame summarises the active instance.
func (s *Service) ActiveGame(ctx context.Context) (ActiveGame, error) {
	id, err := s.Games.Active(ctx)
	if err != nil || id == "" {
		return ActiveGame{}, err
	}
	v, err := s.Instance(ctx, id)
	if err != nil {
		return ActiveGame{}, err
	}
	return ActiveGame{Instance: &v.Instance, Status: v.Status, Mods: v.Mods, Conflicts: v.Conflicts}, nil
}
