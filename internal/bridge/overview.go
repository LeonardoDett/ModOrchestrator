package bridge

import (
	"modorchestrator/internal/core/application/diagnostics"
	launchsvc "modorchestrator/internal/core/application/launch"
	"modorchestrator/internal/core/application/overview"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
)

// Play, Overview and Dashboard (core/11 §6, core/04 §9, ui/telas/overview.md,
// ui/telas/dashboard.md): transport only; every state and count comes from
// the backend.

type LaunchOptionDTO struct {
	ID      string `json:"id"`
	Exe     string `json:"exe"`
	Default bool   `json:"default"`
}

// LaunchCheckDTO is the pre-launch check (DLG-26 and the Play button).
type LaunchCheckDTO struct {
	Instance      string            `json:"instance"`
	State         string            `json:"state"`
	Options       []LaunchOptionDTO `json:"options"`
	DeployKind    string            `json:"deployKind"`
	DeployReason  string            `json:"deployReason"`
	DeployNeeded  bool              `json:"deployNeeded"`
	AutoDeploy    bool              `json:"autoDeploy"`
	DeployProblem bool              `json:"deployProblem"`
	Busy          string            `json:"busy,omitempty"`
	Running       []string          `json:"running"`
	Blocking      []DiagnosticDTO   `json:"blocking"`
	Warnings      []DiagnosticDTO   `json:"warnings"`
	Unavailable   string            `json:"unavailable,omitempty"`
}

type LaunchRequestDTO struct {
	Option    string `json:"option"`
	Deploy    bool   `json:"deploy"`
	Confirmed bool   `json:"confirmed"`
}

func toLaunchCheckDTO(c launchsvc.Check) LaunchCheckDTO {
	dto := LaunchCheckDTO{
		Instance: string(c.Instance), State: string(c.State), Options: []LaunchOptionDTO{},
		DeployKind: string(c.Deploy.Kind), DeployReason: string(c.Deploy.Reason), DeployNeeded: c.DeployNeeded,
		AutoDeploy: c.AutoDeploy, DeployProblem: c.DeployProblem, Busy: c.Busy, Running: []string{},
		Blocking: []DiagnosticDTO{}, Warnings: []DiagnosticDTO{}, Unavailable: c.Unavailable,
	}
	dto.Running = append(dto.Running, c.Running...)
	for _, o := range c.Options {
		dto.Options = append(dto.Options, LaunchOptionDTO{ID: o.ID, Exe: o.Exe, Default: o.Default})
	}
	for _, d := range c.Blocking {
		dto.Blocking = append(dto.Blocking, toDiagnosticDTO(diagnostics.Item{Diagnostic: d, Instance: c.Instance, Module: diagnostic.ModuleOf(d.Code)}))
	}
	for _, d := range c.Warnings {
		dto.Warnings = append(dto.Warnings, toDiagnosticDTO(diagnostics.Item{Diagnostic: d, Instance: c.Instance, Module: diagnostic.ModuleOf(d.Code)}))
	}
	return dto
}

// LaunchCheck returns the pre-launch check of an instance.
func (a *App) LaunchCheck(instance string) (LaunchCheckDTO, error) {
	c, err := a.c.Launch.Check(a.context(), game.InstanceID(instance))
	if err != nil {
		return LaunchCheckDTO{}, a.fail("launch check", err, map[string]string{"instance": instance})
	}
	return toLaunchCheckDTO(c), nil
}

// Launch starts the launch operation with the user's choice in DLG-26.
func (a *App) Launch(instance string, req LaunchRequestDTO) (string, error) {
	id, err := a.c.Launch.Launch(a.context(), game.InstanceID(instance), launchsvc.Request{Option: req.Option, Deploy: req.Deploy, Confirmed: req.Confirmed})
	if err != nil {
		return "", a.fail("launch", err, map[string]string{"instance": instance})
	}
	return string(id), nil
}

type AttentionGroupDTO struct {
	Code     string        `json:"code"`
	Severity string        `json:"severity"`
	Blocking bool          `json:"blocking"`
	Count    int           `json:"count"`
	First    DiagnosticDTO `json:"first"`
}

type ModsSummaryDTO struct {
	Enabled int   `json:"enabled"`
	Total   int   `json:"total"`
	Size    int64 `json:"size"`
	Files   int   `json:"files"`
}

type LimitDTO struct {
	Kind string `json:"kind"`
	Used int    `json:"used"`
	Max  int    `json:"max"`
}

type PluginsSummaryDTO struct {
	Active int        `json:"active"`
	Limits []LimitDTO `json:"limits"`
}

type ConflictsSummaryDTO struct {
	Pairs      int `json:"pairs"`
	Unreviewed int `json:"unreviewed"`
	Overrides  int `json:"overrides"`
}

// InstanceOverviewDTO is the Overview of a game (one query, overview.md §3).
// A missing part could not be read.
type InstanceOverviewDTO struct {
	Instance         ManagedGameDTO       `json:"instance"`
	Status           *DeployStatusDTO     `json:"status,omitempty"`
	Attention        []AttentionGroupDTO  `json:"attention"`
	AttentionPartial bool                 `json:"attentionPartial"`
	Mods             *ModsSummaryDTO      `json:"mods,omitempty"`
	Plugins          *PluginsSummaryDTO   `json:"plugins,omitempty"`
	Conflicts        *ConflictsSummaryDTO `json:"conflicts,omitempty"`
	Recent           []HistoryEntryDTO    `json:"recent"`
}

func modsDTO(m *overview.ModsSummary) *ModsSummaryDTO {
	if m == nil {
		return nil
	}
	return &ModsSummaryDTO{Enabled: m.Enabled, Total: m.Total, Size: m.Size, Files: m.Files}
}

func conflictsDTO(c *overview.ConflictsSummary) *ConflictsSummaryDTO {
	if c == nil {
		return nil
	}
	return &ConflictsSummaryDTO{Pairs: c.Pairs, Unreviewed: c.Unreviewed, Overrides: c.Overrides}
}

// InstanceOverview returns the Overview of an instance.
func (a *App) InstanceOverview(instance string) (InstanceOverviewDTO, error) {
	v, err := a.c.Overview.Instance(a.context(), game.InstanceID(instance))
	if err != nil {
		return InstanceOverviewDTO{}, a.fail("instance overview", err, map[string]string{"instance": instance})
	}
	dto := InstanceOverviewDTO{
		Instance: toManagedDTO(v.Instance), Attention: []AttentionGroupDTO{}, AttentionPartial: v.AttentionPartial,
		Mods: modsDTO(v.Mods), Conflicts: conflictsDTO(v.Conflicts), Recent: []HistoryEntryDTO{},
	}
	if v.Status != nil {
		st := toDeployStatusDTO(*v.Status)
		dto.Status = &st
	}
	for _, g := range v.Attention {
		dto.Attention = append(dto.Attention, AttentionGroupDTO{
			Code: string(g.Code), Severity: string(g.Severity), Blocking: g.Blocking, Count: g.Count,
			First: toDiagnosticDTO(diagnostics.Item{Diagnostic: g.First, Instance: v.Instance.Instance.ID, Module: diagnostic.ModuleOf(g.Code)}),
		})
	}
	if p := v.Plugins; p != nil {
		dto.Plugins = &PluginsSummaryDTO{Active: p.Active, Limits: []LimitDTO{}}
		for _, l := range p.Limits {
			dto.Plugins.Limits = append(dto.Plugins.Limits, LimitDTO{Kind: l.Kind, Used: l.Used, Max: l.Max})
		}
	}
	for _, e := range v.Recent {
		dto.Recent = append(dto.Recent, toHistoryEntryDTO(e))
	}
	return dto, nil
}

type DashletDTO struct {
	ID      string `json:"id"`
	Hidden  bool   `json:"hidden"`
	Pinned  bool   `json:"pinned"`
	Visible bool   `json:"visible"`
	Locked  bool   `json:"locked"`
}

type FirstStepDTO struct {
	ID   string `json:"id"`
	Done bool   `json:"done"`
}

type FirstStepsDTO struct {
	Steps    []FirstStepDTO `json:"steps"`
	Complete bool           `json:"complete"`
}

type RecentGameDTO struct {
	Instance ManagedGameDTO `json:"instance"`
	LastUsed string         `json:"lastUsed,omitempty"`
}

type ActiveGameDTO struct {
	Instance  *ManagedGameDTO      `json:"instance,omitempty"`
	Status    *DeployStatusDTO     `json:"status,omitempty"`
	Mods      *ModsSummaryDTO      `json:"mods,omitempty"`
	Conflicts *ConflictsSummaryDTO `json:"conflicts,omitempty"`
}

// DashboardLayout returns the dashlets in the user's order with their
// effective visibility.
func (a *App) DashboardLayout() ([]DashletDTO, error) {
	list, err := a.c.Overview.Layout(a.context())
	if err != nil {
		return nil, a.fail("dashboard layout", err, nil)
	}
	out := make([]DashletDTO, len(list))
	for i, d := range list {
		out[i] = DashletDTO{ID: d.ID, Hidden: d.Hidden, Pinned: d.Pinned, Visible: d.Visible, Locked: d.Locked}
	}
	return out, nil
}

// FirstSteps returns the checklist of the "Primeiros passos" dashlet.
func (a *App) FirstSteps() (FirstStepsDTO, error) {
	f, err := a.c.Overview.FirstSteps(a.context())
	if err != nil {
		return FirstStepsDTO{}, a.fail("first steps", err, nil)
	}
	dto := FirstStepsDTO{Complete: f.Complete, Steps: []FirstStepDTO{}}
	for _, s := range f.Steps {
		dto.Steps = append(dto.Steps, FirstStepDTO{ID: s.ID, Done: s.Done})
	}
	return dto, nil
}

// RecentGames returns the most recently used managed games.
func (a *App) RecentGames() ([]RecentGameDTO, error) {
	list, err := a.c.Overview.RecentGames(a.context())
	if err != nil {
		return nil, a.fail("recent games", err, nil)
	}
	out := make([]RecentGameDTO, len(list))
	for i, r := range list {
		out[i] = RecentGameDTO{Instance: toManagedDTO(r.Instance), LastUsed: optTime(r.LastUsed)}
	}
	return out, nil
}

// ActiveGameStatus returns the "Status do jogo ativo" dashlet.
func (a *App) ActiveGameStatus() (ActiveGameDTO, error) {
	g, err := a.c.Overview.ActiveGame(a.context())
	if err != nil {
		return ActiveGameDTO{}, a.fail("active game", err, nil)
	}
	dto := ActiveGameDTO{Mods: modsDTO(g.Mods), Conflicts: conflictsDTO(g.Conflicts)}
	if g.Instance != nil {
		m := toManagedDTO(*g.Instance)
		dto.Instance = &m
	}
	if g.Status != nil {
		st := toDeployStatusDTO(*g.Status)
		dto.Status = &st
	}
	return dto, nil
}
