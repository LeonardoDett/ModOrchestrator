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
	version := string(CodePluginWrongGameVersion)
	skse := string(CodeSKSEPluginFailed)
	return sdk.AdapterCatalog{Diagnostics: []diagnostic.CodeSpec{
		{Code: CodeArchiveWrongGame, Module: diagnostic.ModulePlugins, WarnsBeforeLaunch: true},
		{Code: CodePluginWrongGameVersion, Module: diagnostic.ModulePlugins},
		{Code: CodeSKSEPluginFailed, Module: diagnostic.ModuleGame},
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
			"diag.code." + version:            "{plugin} was made for Skyrim Legendary Edition",
			"diag.impact." + version:          "A plugin that was not converted to Special Edition can crash the game or break what it changes. Install the Special Edition version or convert it in the Creation Kit.",
			"diag.evidence.plugin_version":    "{plugin}: header version {version}, Special Edition plugins use {expected}",
			"diag.code." + skse:               "SKSE did not load {plugin}",
			"diag.impact." + skse:             "What the plugin adds is missing in the game. After a game update it usually needs a new version of the plugin or of Address Library; SKSE said: {reason}.",
			"diag.evidence.skse_log":          "skse64.log, last run: {plugin}: {reason}",
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
			"diag.code." + version:            "{plugin} foi feito para o Skyrim Legendary Edition",
			"diag.impact." + version:          "Um plugin que não foi convertido para a Special Edition pode travar o jogo ou estragar o que ele altera. Instale a versão Special Edition ou converta-o no Creation Kit.",
			"diag.evidence.plugin_version":    "{plugin}: cabeçalho na versão {version}, plugins da Special Edition usam {expected}",
			"diag.code." + skse:               "O SKSE não carregou {plugin}",
			"diag.impact." + skse:             "O que o plugin acrescenta fica faltando no jogo. Depois de uma atualização do jogo, costuma precisar de uma versão nova do plugin ou do Address Library; o SKSE disse: {reason}.",
			"diag.evidence.skse_log":          "skse64.log, última execução: {plugin}: {reason}",
		},
	}}
}

func content(f mod.ContentFlag) string { return "mods.content." + string(f) }
