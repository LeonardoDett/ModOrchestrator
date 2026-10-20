package bridge

import (
	"modorchestrator/internal/core/application/imports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/migration"
)

// ImportSourceDTO is a place another manager keeps the state of a game
// (D128).
type ImportSourceDTO struct {
	Manager  string `json:"manager"`
	Path     string `json:"path"`
	Name     string `json:"name"`
	GameRef  string `json:"gameRef"`
	GamePath string `json:"gamePath"`
	Location string `json:"location"`
}

func importSource(s migration.Source) ImportSourceDTO {
	return ImportSourceDTO{
		Manager: string(s.Manager), Path: s.Path, Name: s.Name, GameRef: s.GameRef,
		GamePath: s.GamePath, Location: s.Location,
	}
}

func (d ImportSourceDTO) toDomain() migration.Source {
	return migration.Source{
		Manager: game.ForeignKind(d.Manager), Path: d.Path, Name: d.Name, GameRef: d.GameRef,
		GamePath: d.GamePath, Location: d.Location,
	}
}

// ImportProfileDTO is one profile of the other manager.
type ImportProfileDTO struct {
	Name      string `json:"name"`
	Active    bool   `json:"active"`
	LastUsed  string `json:"lastUsed,omitempty"`
	Mods      int    `json:"mods"`
	Enabled   int    `json:"enabled"`
	Plugins   int    `json:"plugins"`
	LoadOrder int    `json:"loadOrder"`
}

// ImportModDTO is a mod the import can bring.
type ImportModDTO struct {
	Key   string `json:"key"`
	Name  string `json:"name"`
	Files int    `json:"files"`
	Size  int64  `json:"size"`
}

// ImportSkippedDTO is a mod left out and why (missing, empty, unsafe).
type ImportSkippedDTO struct {
	Name   string `json:"name"`
	Reason string `json:"reason"`
}

// ImportPreviewDTO is what an import would bring, per part.
type ImportPreviewDTO struct {
	Source            ImportSourceDTO    `json:"source"`
	Parts             []string           `json:"parts"`
	Defaults          []string           `json:"defaults"`
	Mods              int                `json:"mods"`
	Active            int                `json:"active"`
	Plugins           int                `json:"plugins"`
	Files             int                `json:"files"`
	Size              int64              `json:"size"`
	FreeSpace         int64              `json:"freeSpace"`
	ModList           []ImportModDTO     `json:"modList"`
	Skipped           []ImportSkippedDTO `json:"skipped"`
	Separators        int                `json:"separators"`
	OrderRules        int                `json:"orderRules"`
	Dependencies      int                `json:"dependencies"`
	Incompatibilities int                `json:"incompatibilities"`
	Profiles          []ImportProfileDTO `json:"profiles"`
	Categories        int                `json:"categories"`
	Existing          int                `json:"existing"`
	Deployed          bool               `json:"deployed"`
}

// ImportOptionsDTO chooses what an import brings.
type ImportOptionsDTO struct {
	Parts    []string `json:"parts"`
	Profiles []string `json:"profiles"`
	Exclude  []string `json:"exclude"`
}

// ImportSources lists what Vortex and MO2 keep about the game folder of the
// instance.
func (a *App) ImportSources(instance string) ([]ImportSourceDTO, error) {
	list, err := a.c.Imports.Sources(a.context(), game.InstanceID(instance))
	if err != nil {
		return nil, a.fail("import sources", err, map[string]string{"instance": instance})
	}
	out := make([]ImportSourceDTO, 0, len(list))
	for _, s := range list {
		out = append(out, importSource(s))
	}
	return out, nil
}

// ImportOpenFolder lists the sources of a folder the user chose.
func (a *App) ImportOpenFolder(folder string) ([]ImportSourceDTO, error) {
	list, err := a.c.Imports.OpenFolder(a.context(), folder)
	if err != nil {
		return nil, a.fail("import open folder", err, map[string]string{"folder": folder})
	}
	out := make([]ImportSourceDTO, 0, len(list))
	for _, s := range list {
		out = append(out, importSource(s))
	}
	return out, nil
}

// ImportPreview counts what importing src would bring.
func (a *App) ImportPreview(instance string, src ImportSourceDTO) (ImportPreviewDTO, error) {
	pv, err := a.c.Imports.Preview(a.context(), game.InstanceID(instance), src.toDomain())
	if err != nil {
		return ImportPreviewDTO{}, a.fail("import preview", err, map[string]string{"instance": instance})
	}
	out := ImportPreviewDTO{
		Source: importSource(pv.Source), Parts: parts(pv.Parts), Defaults: parts(pv.Defaults),
		Mods: pv.Mods, Active: pv.Active, Plugins: pv.Plugins, Files: pv.Files, Size: pv.Size, FreeSpace: pv.FreeSpace,
		ModList: make([]ImportModDTO, 0, len(pv.ModList)), Skipped: make([]ImportSkippedDTO, 0, len(pv.Skipped)),
		Separators: pv.Separators, OrderRules: pv.OrderRules, Dependencies: pv.Dependencies,
		Incompatibilities: pv.Incompatibilities, Profiles: make([]ImportProfileDTO, 0, len(pv.Profiles)),
		Categories: pv.Categories, Existing: pv.Existing, Deployed: pv.Deployed,
	}
	for _, m := range pv.ModList {
		out.ModList = append(out.ModList, ImportModDTO{Key: m.Key, Name: m.Name, Files: m.Files, Size: m.Size})
	}
	for _, s := range pv.Skipped {
		out.Skipped = append(out.Skipped, ImportSkippedDTO{Name: s.Name, Reason: s.Reason})
	}
	for _, p := range pv.Profiles {
		d := ImportProfileDTO{Name: p.Name, Active: p.Active, Mods: p.Mods, Enabled: p.Enabled, Plugins: p.Plugins, LoadOrder: p.LoadOrder}
		if !p.LastUsed.IsZero() {
			d.LastUsed = formatTime(p.LastUsed)
		}
		out.Profiles = append(out.Profiles, d)
	}
	return out, nil
}

// ImportStart begins importing src into the instance and returns the
// operation; progress arrives as operation events.
func (a *App) ImportStart(instance string, src ImportSourceDTO, opts ImportOptionsDTO) (string, error) {
	o := imports.Options{Profiles: opts.Profiles, Exclude: opts.Exclude}
	for _, p := range opts.Parts {
		o.Parts = append(o.Parts, migration.Part(p))
	}
	id, err := a.c.Imports.Start(a.context(), game.InstanceID(instance), src.toDomain(), o)
	if err != nil {
		return "", a.fail("import start", err, map[string]string{"instance": instance})
	}
	return string(id), nil
}

func parts(ps []migration.Part) []string {
	out := make([]string, len(ps))
	for i, p := range ps {
		out[i] = string(p)
	}
	return out
}
