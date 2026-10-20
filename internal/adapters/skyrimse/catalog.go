package skyrimse

import (
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/mod"
)

var _ ports.CatalogProvider = Adapter{}

// Catalog implements ports.CatalogProvider: the labels of the content
// flags, the installer and the launch option this adapter defines (D131).
// The "game" launch option is a label of the app.
func (Adapter) Catalog() ports.AdapterCatalog {
	return ports.AdapterCatalog{Messages: map[string]map[string]string{
		"en": {
			content(FlagPlugin):               "Plugins",
			content(FlagArchive):              "Archives (BSA)",
			content(FlagTextures):             "Textures",
			content(FlagMeshes):               "Meshes",
			content(FlagScripts):              "Scripts",
			content(FlagInterface):            "Interface",
			content(FlagSounds):               "Sounds",
			content(FlagSKSEPlugin):           "Script extender plugin",
			content(FlagSKSERuntime):          "Script extender",
			content(FlagENB):                  "ENB",
			content(FlagBodySlide):            "BodySlide",
			content(FlagAnimations):           "Animations",
			content(FlagStrings):              "Strings",
			content(FlagINI):                  "INI",
			"mods.installer." + SKSERuntimeID: "Script extender",
			"launch.option." + LaunchSKSE:     "Launch through SKSE",
		},
		"pt-BR": {
			content(FlagPlugin):               "Plugins",
			content(FlagArchive):              "Arquivos BSA",
			content(FlagTextures):             "Texturas",
			content(FlagMeshes):               "Malhas",
			content(FlagScripts):              "Scripts",
			content(FlagInterface):            "Interface",
			content(FlagSounds):               "Sons",
			content(FlagSKSEPlugin):           "Plugin de script extender",
			content(FlagSKSERuntime):          "Script extender",
			content(FlagENB):                  "ENB",
			content(FlagBodySlide):            "BodySlide",
			content(FlagAnimations):           "Animações",
			content(FlagStrings):              "Textos (strings)",
			content(FlagINI):                  "INI",
			"mods.installer." + SKSERuntimeID: "Script extender",
			"launch.option." + LaunchSKSE:     "Lançar pelo SKSE",
		},
	}}
}

func content(f mod.ContentFlag) string { return "mods.content." + string(f) }
