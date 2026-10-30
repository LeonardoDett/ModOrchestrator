package skyrimse

import (
	"modorchestrator/sdk"
	"modorchestrator/sdk/diagnostic"
	"modorchestrator/sdk/event"
	"modorchestrator/sdk/game"
	"modorchestrator/sdk/health"
	"modorchestrator/sdk/plugin"
)

var _ sdk.PluginChecker = Adapter{}

// CodePluginWrongGameVersion: an active plugin was made for Skyrim LE
// (D151, M7 of the MO2/Vortex survey). Its HEDR version is 0.94; Skyrim SE
// saves 1.7 (1.71 with the newer Creation Kit). An LE plugin that was not
// converted can crash the game or break records; LOOT and MO2 warn too.
const CodePluginWrongGameVersion diagnostic.Code = "plugin_wrong_game_version"

const (
	// HeaderVersionLE is the HEDR version of a Skyrim LE plugin (also of
	// Fallout 3 and New Vegas); HeaderVersion is the one of Skyrim SE.
	HeaderVersionLE = "0.94"
	HeaderVersion   = "1.7"
)

// PluginChecks reports the active plugins whose header says Skyrim LE.
// Other versions are left alone: 1.7 and 1.71 are both Skyrim SE, and a
// version this adapter does not know is not judged.
func (Adapter) PluginChecks(_ game.ID, active []sdk.PluginFile) []diagnostic.Spec {
	var out []diagnostic.Spec
	for _, p := range active {
		if p.Header.Version != HeaderVersionLE {
			continue
		}
		ref := event.EntityRef{Kind: "plugin", ID: p.Name.Key()}
		params := diagnostic.Params{"plugin": string(p.Name), "version": p.Header.Version, "expected": HeaderVersion}
		related := []event.EntityRef{ref}
		actions := []diagnostic.Action{{ID: plugin.ActionDisable, Target: &ref, Params: diagnostic.Params{"plugin": string(p.Name)}}}
		if p.Mod != "" {
			params["mod"] = p.ModName
			m := event.EntityRef{Kind: "mod", ID: string(p.Mod)}
			// The mod comes first: it is the subject of the problem (Mods ›
			// Filtros reads the first related mod).
			related = append([]event.EntityRef{m}, related...)
			actions = append([]diagnostic.Action{{ID: health.ActionOpenModFolder, Target: &m, NavigateTo: health.NavigateModFolder}}, actions...)
		}
		out = append(out, diagnostic.Spec{
			Code: CodePluginWrongGameVersion, Severity: diagnostic.SeverityWarning, Params: params,
			Evidence: []diagnostic.Evidence{{Kind: "plugin_version", Ref: &ref, Params: params}},
			Actions:  actions,
			Related:  related,
		})
	}
	return out
}
