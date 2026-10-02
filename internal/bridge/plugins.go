package bridge

import (
	"modorchestrator/internal/core/application/diagnostics"
	"modorchestrator/internal/core/application/plugins"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/plugin"
)

// Plugins and Load Order bridge (ui/telas/plugins.md §8, load-order.md §5,
// DLG-23/24/25). Every method only translates between DTOs and the plugins
// service; none decides anything.

type PluginRowDTO struct {
	Name        string   `json:"name"`
	Enabled     bool     `json:"enabled"`
	Implicit    bool     `json:"implicit"`
	Locked      bool     `json:"locked"`
	Position    int      `json:"position"`
	Index       string   `json:"index"`
	Origin      string   `json:"origin"`
	Mod         string   `json:"mod"`
	ModName     string   `json:"modName"`
	Flags       []string `json:"flags"`
	Group       string   `json:"group"`
	Masters     int      `json:"masters"`
	Problems    int      `json:"problems"`
	Problem     string   `json:"problem"`
	Severity    string   `json:"severity"`
	Author      string   `json:"author"`
	Version     string   `json:"version"`
	Description string   `json:"description"`
	Rules       int      `json:"rules"`
}

type PluginLimitDTO struct {
	Kind string `json:"kind"`
	Used int    `json:"used"`
	Max  int    `json:"max"`
}

type DisabledPluginDTO struct {
	Name    string `json:"name"`
	Mod     string `json:"mod"`
	ModName string `json:"modName"`
	Losing  bool   `json:"losing"`
}

type PluginListDTO struct {
	Rows         []PluginRowDTO      `json:"rows"`
	Limits       []PluginLimitDTO    `json:"limits"`
	Active       int                 `json:"active"`
	Errors       int                 `json:"errors"`
	AutoSort     bool                `json:"autoSort"`
	Disabled     []DisabledPluginDTO `json:"disabled"`
	External     bool                `json:"external"`
	Cycle        []string            `json:"cycle"`
	ManualOrder  bool                `json:"manualOrder"`
	HasLoadOrder bool                `json:"hasLoadOrder"`
}

type PluginMasterDTO struct {
	Name     string `json:"name"`
	Present  bool   `json:"present"`
	Active   bool   `json:"active"`
	Before   bool   `json:"before"`
	Mod      string `json:"mod"`
	ModName  string `json:"modName"`
	Disabled bool   `json:"disabled"`
}

type PluginRuleDTO struct {
	ID       string `json:"id"`
	Plugin   string `json:"plugin"`
	After    string `json:"after"`
	Source   string `json:"source"`
	Disabled bool   `json:"disabled"`
	Orphan   bool   `json:"orphan"`
}

type PluginDetailsDTO struct {
	PluginRowDTO
	Path        string            `json:"path"`
	HeaderError string            `json:"headerError"`
	MastersList []PluginMasterDTO `json:"mastersList"`
	Dependents  []string          `json:"dependents"`
	RuleList    []PluginRuleDTO   `json:"ruleList"`
	Diagnostics []DiagnosticDTO   `json:"diagnostics"`
}

type PluginGroupDTO struct {
	Name    string   `json:"name"`
	After   []string `json:"after"`
	Plugins []string `json:"plugins"`
	Default bool     `json:"default"`
}

type PluginRulesDTO struct {
	Rules   []PluginRuleDTO  `json:"rules"`
	Groups  []PluginGroupDTO `json:"groups"`
	Plugins []string         `json:"plugins"`
}

type LoadOrderStateDTO struct {
	Supported          bool `json:"supported"`
	Applied            bool `json:"applied"`
	Differences        int  `json:"differences"`
	External           bool `json:"external"`
	FileExists         bool `json:"fileExists"`
	Unreadable         bool `json:"unreadable"`
	CanRestorePrevious bool `json:"canRestorePrevious"`
}

type LoadOrderViewDTO struct {
	PluginListDTO
	State       LoadOrderStateDTO `json:"state"`
	CanUndoSort bool              `json:"canUndoSort"`
}

type PluginReasonDTO struct {
	Kind       string `json:"kind"`
	Rule       string `json:"rule"`
	Group      string `json:"group"`
	AfterGroup string `json:"afterGroup"`
	Other      string `json:"other"`
	Before     bool   `json:"before"`
	Plugin     string `json:"plugin"`
}

type PluginExplainDTO struct {
	Plugin     string            `json:"plugin"`
	Position   int               `json:"position"`
	Fixed      bool              `json:"fixed"`
	Locked     bool              `json:"locked"`
	Group      string            `json:"group"`
	After      []PluginReasonDTO `json:"after"`
	Dependents []PluginReasonDTO `json:"dependents"`
}

type PluginMoveDTO struct {
	Plugin  string            `json:"plugin"`
	From    int               `json:"from"`
	To      int               `json:"to"`
	Because []PluginReasonDTO `json:"because"`
}

type SortPreviewDTO struct {
	Moves        []PluginMoveDTO `json:"moves"`
	ConfirmAbove int             `json:"confirmAbove"`
	Cycle        []string        `json:"cycle"`
}

type SortResultDTO struct {
	Moved int             `json:"moved"`
	Moves []PluginMoveDTO `json:"moves"`
}

type PluginMoveResultDTO struct {
	Applied  bool              `json:"applied"`
	Violated []PluginReasonDTO `json:"violated"`
	Nearest  int               `json:"nearest"`
}

type LoadOrderLineDTO struct {
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

type LoadOrderDiffDTO struct {
	Desired []LoadOrderLineDTO `json:"desired"`
	Applied []LoadOrderLineDTO `json:"applied"`
	Exists  bool               `json:"exists"`
}

func names(ns []plugin.Name) []string {
	out := make([]string, len(ns))
	for i, n := range ns {
		out[i] = string(n)
	}
	return out
}

func toNames(ss []string) []plugin.Name {
	out := make([]plugin.Name, len(ss))
	for i, s := range ss {
		out[i] = plugin.Name(s)
	}
	return out
}

func toPluginRow(r plugins.Row) PluginRowDTO {
	flags := make([]string, len(r.Flags))
	for i, f := range r.Flags {
		flags[i] = string(f)
	}
	return PluginRowDTO{
		Name: string(r.Name), Enabled: r.Enabled, Implicit: r.Implicit, Locked: r.Locked, Position: r.Position,
		Index: r.Index, Origin: string(r.Origin), Mod: string(r.Mod), ModName: r.ModName, Flags: flags,
		Group: r.Group, Masters: r.Masters, Problems: r.Problems, Problem: string(r.Problem), Severity: string(r.Severity),
		Author: r.Author, Version: r.Version, Description: r.Description, Rules: r.Rules,
	}
}

func toPluginList(v plugins.ListView) PluginListDTO {
	out := PluginListDTO{
		Rows: []PluginRowDTO{}, Limits: []PluginLimitDTO{}, Disabled: []DisabledPluginDTO{}, Cycle: names(v.Cycle),
		Active: v.Active, Errors: v.Errors, AutoSort: v.AutoSort, External: v.External, ManualOrder: v.ManualOrder, HasLoadOrder: v.HasLoadOrder,
	}
	for _, r := range v.Rows {
		out.Rows = append(out.Rows, toPluginRow(r))
	}
	for _, l := range v.Limits {
		out.Limits = append(out.Limits, PluginLimitDTO{Kind: l.Kind, Used: l.Used, Max: l.Max})
	}
	for _, d := range v.Disabled {
		out.Disabled = append(out.Disabled, DisabledPluginDTO{Name: string(d.Name), Mod: string(d.Mod), ModName: d.ModName, Losing: d.Losing})
	}
	return out
}

func toPluginRule(r plugins.RuleView) PluginRuleDTO {
	return PluginRuleDTO{ID: string(r.ID), Plugin: string(r.Plugin), After: string(r.After), Source: r.Source, Disabled: r.Disabled, Orphan: r.Orphan}
}

func toReasons(rs []plugins.ReasonView) []PluginReasonDTO {
	out := []PluginReasonDTO{}
	for _, r := range rs {
		out = append(out, PluginReasonDTO{Kind: r.Kind, Rule: string(r.Rule), Group: r.Group, AfterGroup: r.AfterGroup, Other: string(r.Other), Before: r.Before, Plugin: string(r.Plugin)})
	}
	return out
}

func toMoves(ms []plugins.MoveView) []PluginMoveDTO {
	out := []PluginMoveDTO{}
	for _, m := range ms {
		out = append(out, PluginMoveDTO{Plugin: string(m.Plugin), From: m.From, To: m.To, Because: toReasons(m.Because)})
	}
	return out
}

// PluginList is the Plugins screen of the active profile.
func (a *App) PluginList(instance string) (PluginListDTO, error) {
	v, err := a.c.Plugins.List(a.context(), game.InstanceID(instance))
	if err != nil {
		return PluginListDTO{}, a.fail("plugin list", err, map[string]string{"instance": instance})
	}
	return toPluginList(v), nil
}

// PluginDetails is the Inspector of a plugin.
func (a *App) PluginDetails(instance, name string) (PluginDetailsDTO, error) {
	d, err := a.c.Plugins.Details(a.context(), game.InstanceID(instance), plugin.Name(name))
	if err != nil {
		return PluginDetailsDTO{}, a.fail("plugin details", err, map[string]string{"plugin": name})
	}
	out := PluginDetailsDTO{PluginRowDTO: toPluginRow(d.Row), Path: d.Path, HeaderError: d.HeaderError,
		MastersList: []PluginMasterDTO{}, Dependents: names(d.Dependents), RuleList: []PluginRuleDTO{}, Diagnostics: []DiagnosticDTO{}}
	for _, m := range d.MastersList {
		out.MastersList = append(out.MastersList, PluginMasterDTO{Name: string(m.Name), Present: m.Present, Active: m.Active, Before: m.Before, Mod: string(m.Mod), ModName: m.ModName, Disabled: m.Disabled})
	}
	for _, r := range d.Rules {
		out.RuleList = append(out.RuleList, toPluginRule(r))
	}
	for _, dg := range d.Diagnostics {
		out.Diagnostics = append(out.Diagnostics, toDiagnosticDTO(diagnostics.Item{Diagnostic: dg, Instance: game.InstanceID(instance), Module: diagnostic.ModuleOf(dg.Code)}))
	}
	return out, nil
}

// PluginRules lists rules and groups (DLG-23, DLG-24).
func (a *App) PluginRules(instance string) (PluginRulesDTO, error) {
	v, err := a.c.Plugins.RulesAndGroups(a.context(), game.InstanceID(instance))
	if err != nil {
		return PluginRulesDTO{}, a.fail("plugin rules", err, map[string]string{"instance": instance})
	}
	out := PluginRulesDTO{Rules: []PluginRuleDTO{}, Groups: []PluginGroupDTO{}, Plugins: names(v.Plugins)}
	for _, r := range v.Rules {
		out.Rules = append(out.Rules, toPluginRule(r))
	}
	for _, g := range v.Groups {
		after := g.After
		if after == nil {
			after = []string{}
		}
		out.Groups = append(out.Groups, PluginGroupDTO{Name: g.Name, After: after, Plugins: names(g.Plugins), Default: g.Default})
	}
	return out, nil
}

// LoadOrderView is the Load Order screen.
func (a *App) LoadOrderView(instance string) (LoadOrderViewDTO, error) {
	v, err := a.c.Plugins.LoadOrder(a.context(), game.InstanceID(instance))
	if err != nil {
		return LoadOrderViewDTO{}, a.fail("load order", err, map[string]string{"instance": instance})
	}
	return LoadOrderViewDTO{PluginListDTO: toPluginList(v.ListView), State: LoadOrderStateDTO(v.State), CanUndoSort: v.CanUndoSort}, nil
}

// LoadOrderExplain answers "por que está aqui".
func (a *App) LoadOrderExplain(instance, name string) (PluginExplainDTO, error) {
	ex, err := a.c.Plugins.Explain(a.context(), game.InstanceID(instance), plugin.Name(name))
	if err != nil {
		return PluginExplainDTO{}, a.fail("explain plugin", err, map[string]string{"plugin": name})
	}
	return PluginExplainDTO{Plugin: string(ex.Plugin), Position: ex.Position, Fixed: ex.Fixed, Locked: ex.Locked, Group: ex.Group,
		After: toReasons(ex.After), Dependents: toReasons(ex.Dependents)}, nil
}

// LoadOrderDiffApplied compares the profile's load order with the game's
// file.
func (a *App) LoadOrderDiffApplied(instance string) (LoadOrderDiffDTO, error) {
	d, err := a.c.Plugins.DiffApplied(a.context(), game.InstanceID(instance))
	if err != nil {
		return LoadOrderDiffDTO{}, a.fail("load order diff", err, map[string]string{"instance": instance})
	}
	out := LoadOrderDiffDTO{Desired: []LoadOrderLineDTO{}, Applied: []LoadOrderLineDTO{}, Exists: d.Exists}
	for _, l := range d.Desired {
		out.Desired = append(out.Desired, LoadOrderLineDTO{Name: string(l.Name), Enabled: l.Enabled})
	}
	for _, l := range d.Applied {
		out.Applied = append(out.Applied, LoadOrderLineDTO{Name: string(l.Name), Enabled: l.Enabled})
	}
	return out, nil
}

// SortPreview is DLG-25.
func (a *App) SortPreview(instance string) (SortPreviewDTO, error) {
	p, err := a.c.Plugins.SortPreview(a.context(), game.InstanceID(instance))
	if err != nil {
		return SortPreviewDTO{}, a.fail("sort preview", err, map[string]string{"instance": instance})
	}
	return SortPreviewDTO{Moves: toMoves(p.Moves), ConfirmAbove: p.ConfirmAbove, Cycle: names(p.Cycle)}, nil
}

// ExportLoadOrder returns the load order as text.
func (a *App) ExportLoadOrder(instance string) (string, error) {
	s, err := a.c.Plugins.Export(a.context(), game.InstanceID(instance))
	if err != nil {
		return "", a.fail("export load order", err, map[string]string{"instance": instance})
	}
	return s, nil
}

// SetPluginsEnabled activates or deactivates plugins.
func (a *App) SetPluginsEnabled(instance string, plugins []string, enabled bool) error {
	if err := a.c.Plugins.SetPluginsEnabled(a.context(), game.InstanceID(instance), toNames(plugins), enabled); err != nil {
		return a.fail("set plugins enabled", err, nil)
	}
	return nil
}

// SortPlugins is "Ordenar agora".
func (a *App) SortPlugins(instance string) (SortResultDTO, error) {
	r, err := a.c.Plugins.SortPlugins(a.context(), game.InstanceID(instance))
	if err != nil {
		return SortResultDTO{}, a.fail("sort plugins", err, nil)
	}
	return SortResultDTO{Moved: r.Moved, Moves: toMoves(r.Moves)}, nil
}

// UndoLastSort is "Desfazer última ordenação".
func (a *App) UndoLastSort(instance string) error {
	if err := a.c.Plugins.UndoLastSort(a.context(), game.InstanceID(instance)); err != nil {
		return a.fail("undo sort", err, nil)
	}
	return nil
}

// SetAutoSort turns auto-sort on or off.
func (a *App) SetAutoSort(instance string, on bool) error {
	if err := a.c.Plugins.SetAutoSort(a.context(), game.InstanceID(instance), on); err != nil {
		return a.fail("set auto-sort", err, nil)
	}
	return nil
}

// MovePlugins moves plugins in the load order (refused with alternatives).
func (a *App) MovePlugins(instance string, plugins []string, index int) (PluginMoveResultDTO, error) {
	r, err := a.c.Plugins.MovePlugins(a.context(), game.InstanceID(instance), toNames(plugins), index)
	if err != nil {
		return PluginMoveResultDTO{}, a.fail("move plugins", err, nil)
	}
	return PluginMoveResultDTO{Applied: r.Applied, Violated: toReasons(r.Violated), Nearest: r.Nearest}, nil
}

// SetIndexLock locks or unlocks plugins at their position.
func (a *App) SetIndexLock(instance string, plugins []string, locked bool) error {
	if err := a.c.Plugins.SetIndexLock(a.context(), game.InstanceID(instance), toNames(plugins), locked); err != nil {
		return a.fail("set index lock", err, nil)
	}
	return nil
}

// SetPluginGroup assigns plugins to a group.
func (a *App) SetPluginGroup(instance string, plugins []string, group string) error {
	if err := a.c.Plugins.SetPluginGroup(a.context(), game.InstanceID(instance), toNames(plugins), group); err != nil {
		return a.fail("set plugin group", err, nil)
	}
	return nil
}

// CreatePluginRule stores "plugin loads after after".
func (a *App) CreatePluginRule(instance, pluginName, after string) error {
	if err := a.c.Plugins.CreatePluginRule(a.context(), game.InstanceID(instance), plugin.Name(pluginName), plugin.Name(after)); err != nil {
		return a.fail("create plugin rule", err, nil)
	}
	return nil
}

// RemovePluginRule deletes a user plugin rule.
func (a *App) RemovePluginRule(instance, id string) error {
	if err := a.c.Plugins.RemovePluginRule(a.context(), game.InstanceID(instance), plugin.RuleID(id)); err != nil {
		return a.fail("remove plugin rule", err, nil)
	}
	return nil
}

// CreatePluginGroup creates a group.
func (a *App) CreatePluginGroup(instance, name string, after []string) error {
	if err := a.c.Plugins.SaveGroup(a.context(), game.InstanceID(instance), name, after, true); err != nil {
		return a.fail("create plugin group", err, nil)
	}
	return nil
}

// UpdatePluginGroup changes the groups a group loads after.
func (a *App) UpdatePluginGroup(instance, name string, after []string) error {
	if err := a.c.Plugins.SaveGroup(a.context(), game.InstanceID(instance), name, after, false); err != nil {
		return a.fail("update plugin group", err, nil)
	}
	return nil
}

// DeletePluginGroup deletes a group.
func (a *App) DeletePluginGroup(instance, name string) error {
	if err := a.c.Plugins.DeleteGroup(a.context(), game.InstanceID(instance), name); err != nil {
		return a.fail("delete plugin group", err, nil)
	}
	return nil
}

// ApplyLoadOrder writes the load order file (operation apply_load_order).
func (a *App) ApplyLoadOrder(instance string) (string, error) {
	id, err := a.c.Plugins.ApplyLoadOrder(a.context(), game.InstanceID(instance))
	if err != nil {
		return string(id), a.fail("apply load order", err, nil)
	}
	return string(id), nil
}

// RestorePreviousLoadOrder is "Restaurar load order anterior".
func (a *App) RestorePreviousLoadOrder(instance string) (string, error) {
	id, err := a.c.Plugins.RestorePreviousLoadOrder(a.context(), game.InstanceID(instance))
	if err != nil {
		return string(id), a.fail("restore load order", err, nil)
	}
	return string(id), nil
}

// ImportLoadOrder is "Importar ordem…".
func (a *App) ImportLoadOrder(instance, text string) (SortResultDTO, error) {
	r, err := a.c.Plugins.ImportLoadOrder(a.context(), game.InstanceID(instance), text)
	if err != nil {
		return SortResultDTO{}, a.fail("import load order", err, nil)
	}
	return SortResultDTO{Moved: r.Moved, Moves: []PluginMoveDTO{}}, nil
}

// ResolveLoadOrderChange is the triage of an external change of the load
// order file: "import_load_order" or "restore_load_order".
func (a *App) ResolveLoadOrderChange(instance, action string) (string, error) {
	id, err := a.c.Plugins.ResolveExternalChange(a.context(), game.InstanceID(instance), action)
	if err != nil {
		return string(id), a.fail("resolve load order change", err, map[string]string{"action": action})
	}
	return string(id), nil
}

// RebuildPluginHeaderCache empties the header cache.
func (a *App) RebuildPluginHeaderCache() error {
	if err := a.c.Plugins.RebuildHeaderCache(a.context()); err != nil {
		return a.fail("rebuild header cache", err, nil)
	}
	return nil
}
