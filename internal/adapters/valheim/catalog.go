package valheim

import (
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/mod"
)

var _ ports.CatalogProvider = Adapter{}

// Catalog implements ports.CatalogProvider: the labels of the content
// flags and the installers this adapter defines (D131). The only launch
// option, "game", is a label of the app.
func (Adapter) Catalog() ports.AdapterCatalog {
	return ports.AdapterCatalog{Messages: map[string]map[string]string{
		"en": {
			content(FlagPlugin):              "BepInEx plugin",
			content(FlagPatcher):             "BepInEx patcher",
			content(FlagConfig):              "BepInEx configuration",
			content(FlagRuntime):             "BepInEx",
			"mods.installer." + LoaderPackID:  "BepInEx pack",
			"mods.installer." + PackageID:     "Mod package (BepInEx)",
			"mods.installer." + LoosePluginID: "Loose DLL (BepInEx)",
		},
		"pt-BR": {
			content(FlagPlugin):              "Plugin do BepInEx",
			content(FlagPatcher):             "Patcher do BepInEx",
			content(FlagConfig):              "Configuração do BepInEx",
			content(FlagRuntime):             "BepInEx",
			"mods.installer." + LoaderPackID:  "Pacote do BepInEx",
			"mods.installer." + PackageID:     "Pacote de mod (BepInEx)",
			"mods.installer." + LoosePluginID: "DLL solta (BepInEx)",
		},
	}}
}

func content(f mod.ContentFlag) string { return "mods.content." + string(f) }
