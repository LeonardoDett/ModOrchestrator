package skyrimse

import (
	"modorchestrator/sdk"
	"modorchestrator/sdk/diagnostic"
	"modorchestrator/sdk/mod"
)

var _ sdk.CatalogProvider = Adapter{}

// Catalog implements sdk.CatalogProvider: the labels of the content
// flags, the installer and the launch option this adapter defines, and the
// code and texts of archive_wrong_game (D131, D141). The "game" launch
// option is a label of the app.
func (Adapter) Catalog() sdk.AdapterCatalog {
	code := string(CodeArchiveWrongGame)
	return sdk.AdapterCatalog{Diagnostics: []diagnostic.CodeSpec{
		{Code: CodeArchiveWrongGame, Module: diagnostic.ModulePlugins, WarnsBeforeLaunch: true},
	}, Messages: map[string]map[string]string{
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
			"diag.code." + code:               "{archive} was made for another game",
			"diag.impact." + code:             "Skyrim Special Edition can crash on load or show missing textures and meshes. Install the Special Edition version of {mod}.",
			"diag.evidence.archive_version":   "{archive} from {mod}: archive version {version}, the game reads {expected}",
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
			"diag.code." + code:               "{archive} foi feito para outro jogo",
			"diag.impact." + code:             "O Skyrim Special Edition pode travar ao carregar ou ficar sem texturas e malhas. Instale a versão Special Edition de {mod}.",
			"diag.evidence.archive_version":   "{archive} de {mod}: archive na versão {version}, o jogo lê a {expected}",
		},
	}}
}

func content(f mod.ContentFlag) string { return "mods.content." + string(f) }
