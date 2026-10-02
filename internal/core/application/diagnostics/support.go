package diagnostics

import (
	"context"
	"slices"
	"strconv"
	"strings"
	"time"

	"modorchestrator/internal/core/domain/game"
)

const settingAnonymize = "app.anonymizeSupportBundle"

// SettingsLister lists the effective app settings for the bundle summary.
type SettingsLister interface {
	AppSummary(ctx context.Context) (map[string]string, error)
}

// Report is the state summary of a support bundle (core/10 §4): no
// personal data besides local paths, and those only when the user turned
// "anonimizar caminhos" off.
type Report struct {
	CreatedAt   time.Time         `json:"createdAt"`
	AppVersion  string            `json:"appVersion"`
	Schema      int               `json:"schemaVersion"`
	Anonymized  bool              `json:"anonymized"`
	Settings    map[string]string `json:"settings"`
	Instances   []InstanceReport  `json:"instances"`
	Suppressed  int               `json:"suppressedDiagnostics"`
	Unavailable []string          `json:"unavailable,omitempty"`
}

// InstanceReport summarises one managed game.
type InstanceReport struct {
	ID           string      `json:"id"`
	Game         string      `json:"game"`
	Name         string      `json:"name"`
	Adapter      string      `json:"adapter"`
	Store        string      `json:"store"`
	Root         string      `json:"root"`
	Staging      string      `json:"staging"`
	Method       string      `json:"method"`
	Profile      string      `json:"activeProfile"`
	DeployStatus string      `json:"deployStatus"`
	Mods         []ModReport `json:"mods"`
	// LoadOrder is the profile's load order in the game's format ("*"
	// marks active plugins), for games with plugins (core/10 §4).
	LoadOrder   []string           `json:"loadOrder,omitempty"`
	Diagnostics []DiagnosticReport `json:"diagnostics"`
}

// ModReport is one mod of the active profile, in priority order.
type ModReport struct {
	Name     string `json:"name"`
	Version  string `json:"version,omitempty"`
	Type     string `json:"type"`
	State    string `json:"state"`
	Enabled  bool   `json:"enabled"`
	Priority int    `json:"priority"`
}

// DiagnosticReport is one current diagnostic as code and parameters.
type DiagnosticReport struct {
	Code     string            `json:"code"`
	Severity string            `json:"severity"`
	Blocks   []string          `json:"blocks,omitempty"`
	Params   map[string]string `json:"params,omitempty"`
}

// Replacement maps a local path to the placeholder written instead.
type Replacement struct {
	Path        string
	Placeholder string
}

// Bundle is what the support bundle writer needs.
type Bundle struct {
	Report       Report
	Replacements []Replacement
}

// SupportBundle gathers the state summary of the bundle (core/10 §4,
// ui/telas/diagnostics.md "Exportar pacote de diagnóstico"). home is the
// user's profile folder, replaced like the instance folders when the
// bundle is anonymized. The load order joins with plugins (F11).
func (s *Service) SupportBundle(ctx context.Context, appVersion string, schema int, home string, lister SettingsLister) (Bundle, error) {
	r := Report{CreatedAt: s.Clock.Now(), AppVersion: appVersion, Schema: schema, Anonymized: true}
	if v, err := s.Settings.AppValue(ctx, settingAnonymize); err == nil {
		r.Anonymized, _ = strconv.ParseBool(v.Value)
	}
	if lister != nil {
		if all, err := lister.AppSummary(ctx); err == nil {
			r.Settings = all
		} else {
			r.Unavailable = append(r.Unavailable, "settings")
		}
	}
	if sups, err := s.Suppressions.List(ctx); err == nil {
		r.Suppressed = len(sups)
	}
	list, err := s.Instances.List(ctx)
	if err != nil {
		return Bundle{}, err
	}
	var repl []Replacement
	for i, inst := range list {
		ir, err := s.instanceReport(ctx, inst)
		if err != nil {
			r.Unavailable = append(r.Unavailable, "instance:"+string(inst.ID))
		}
		r.Instances = append(r.Instances, ir)
		label := strconv.Itoa(i + 1)
		repl = append(repl,
			Replacement{inst.Root, "<game" + label + ">"},
			Replacement{inst.Staging, "<staging" + label + ">"},
			Replacement{inst.ArchiveStore, "<archives" + label + ">"},
			Replacement{inst.BackupStore, "<backups" + label + ">"},
		)
		for _, t := range inst.Targets {
			repl = append(repl, Replacement{t.Path, "<game" + label + ":" + string(t.ID) + ">"})
		}
	}
	if home != "" {
		repl = append(repl, Replacement{home, "<home>"})
	}
	repl = slices.DeleteFunc(repl, func(x Replacement) bool { return strings.TrimSpace(x.Path) == "" })
	// Longest first: a target inside the game folder is replaced before it.
	slices.SortStableFunc(repl, func(a, b Replacement) int { return len(b.Path) - len(a.Path) })
	if !r.Anonymized {
		repl = nil
	}
	return Bundle{Report: r, Replacements: repl}, nil
}

func (s *Service) instanceReport(ctx context.Context, inst game.Instance) (InstanceReport, error) {
	ir := InstanceReport{
		ID: string(inst.ID), Game: string(inst.Game), Name: inst.DisplayName, Adapter: inst.Adapter, Store: inst.Store,
		Root: inst.Root, Staging: inst.Staging, Method: string(inst.PreferredMethod),
	}
	if st, err := s.Deploy.Status(ctx, inst.ID); err == nil {
		ir.DeployStatus = string(st.Status.Kind) + "/" + string(st.Status.Reason)
		ir.Profile = st.ActiveProfile.Name
	}
	pid, err := s.Profiles.Active(ctx, inst.ID)
	if err != nil {
		return ir, err
	}
	p, err := s.Profiles.Get(ctx, pid)
	if err != nil {
		return ir, err
	}
	list, err := s.Mods.ListByInstance(ctx, inst.ID)
	if err != nil {
		return ir, err
	}
	byID := map[string]int{}
	for i, id := range p.Mods() {
		byID[string(id)] = i + 1
	}
	for _, m := range list {
		if m.State == "removed" {
			continue
		}
		ir.Mods = append(ir.Mods, ModReport{
			Name: m.DisplayName(), Version: m.Attributes.Version, Type: string(m.Type), State: string(m.State),
			Enabled: p.IsEnabled(m.ID), Priority: byID[string(m.ID)],
		})
	}
	slices.SortStableFunc(ir.Mods, func(a, b ModReport) int { return a.Priority - b.Priority })
	if s.Plugins != nil {
		if text, err := s.Plugins.Export(ctx, inst.ID); err == nil {
			ir.LoadOrder = strings.Split(strings.TrimSpace(text), "\n")
		}
	}
	ds, _, err := s.Evaluate(ctx, inst.ID)
	if err != nil {
		return ir, err
	}
	for _, d := range ds {
		dr := DiagnosticReport{Code: string(d.Code), Severity: string(d.Severity), Params: d.Params}
		for _, b := range d.Blocks {
			dr.Blocks = append(dr.Blocks, string(b))
		}
		ir.Diagnostics = append(ir.Diagnostics, dr)
	}
	return ir, nil
}
