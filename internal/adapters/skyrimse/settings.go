package skyrimse

import (
	"path"
	"strings"

	"modorchestrator/sdk"
	"modorchestrator/sdk/game"
	"modorchestrator/sdk/gamesettings"
)

// Game settings (core/12 §10, LV8). The game reads Skyrim.ini,
// SkyrimPrefs.ini and SkyrimCustom.ini below "My Games\Skyrim Special
// Edition" in the Documents folder (" GOG" and " EPIC" variants as for
// plugins.txt). Skyrim SE needs no key for loose files to win over the
// archives, so RequiredSettings is empty (M11 applies to Fallout 4 and
// Oblivion).
var settingsNames = []string{"Skyrim.ini", "SkyrimPrefs.ini", customINI}

// tweakFolder is the folder of a mod that holds its INI tweaks, at the top
// of the Data folder: the "INI Tweaks" folder MO2 shows in its INI editor.
// A tweak applies to Skyrim.ini unless its name ends with the name of
// another settings file in brackets: "Shadows [SkyrimPrefs].ini".
const tweakFolder = "ini tweaks"

// SettingsFiles are the three INIs of the game.
func (Adapter) SettingsFiles(inst game.Instance) []gamesettings.File {
	base := myGames(inst)
	out := make([]gamesettings.File, 0, len(settingsNames))
	for _, n := range settingsNames {
		out = append(out, gamesettings.File{Folder: sdk.FolderDocuments, Path: base + "/" + n})
	}
	return out
}

// RequiredSettings is empty: Skyrim SE loads loose files over the archives
// without archive invalidation.
func (Adapter) RequiredSettings(game.Instance) []gamesettings.Required { return nil }

// IniTweak recognises "INI Tweaks/<name>.ini" at the top of Data.
func (a Adapter) IniTweak(inst game.Instance, file game.Location) (string, bool) {
	if file.Target != TargetData {
		return "", false
	}
	dir, name := path.Split(file.Path.String())
	if !strings.EqualFold(strings.TrimSuffix(dir, "/"), tweakFolder) || !strings.EqualFold(path.Ext(name), ".ini") {
		return "", false
	}
	stem := strings.TrimSpace(strings.TrimSuffix(name, path.Ext(name)))
	target := settingsNames[0]
	if strings.HasSuffix(stem, "]") {
		if i := strings.LastIndex(stem, "["); i >= 0 {
			want := strings.TrimSpace(stem[i+1:len(stem)-1]) + ".ini"
			for _, n := range settingsNames {
				if strings.EqualFold(n, want) {
					target = n
				}
			}
		}
	}
	return myGames(inst) + "/" + target, true
}
