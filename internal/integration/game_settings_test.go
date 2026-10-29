package integration_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"modorchestrator/internal/core/application/gameconfig"
	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/gamesettings"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
)

func (e *env) settingsFile(name string) string { return e.myGames(name) }

func (e *env) readFile(p string) (string, bool) {
	e.t.Helper()
	b, err := os.ReadFile(p)
	if errors.Is(err, os.ErrNotExist) {
		return "", false
	}
	if err != nil {
		e.t.Fatal(err)
	}
	return string(b), true
}

func (e *env) purgeOK() {
	e.t.Helper()
	if op := e.deploy("purge"); op.Status != operation.StatusSucceeded {
		e.t.Fatalf("purge: %+v", op)
	}
}

func (e *env) diagCodes() map[diagnostic.Code]diagnostic.Diagnostic {
	e.t.Helper()
	list, err := e.gcfg.Diagnostics(ctx, e.inst.ID)
	if err != nil {
		e.t.Fatal(err)
	}
	out := map[diagnostic.Code]diagnostic.Diagnostic{}
	for _, d := range list {
		out[d.Code] = d
	}
	return out
}

// core/07 §4 step 6 and §7 (LV8): a profile with its own settings gets its
// copy of the INIs in the post step of the deploy; what the game wrote while
// a profile was deployed goes back to that profile; the shared files come
// back for a profile without it and after a purge.
func TestSettingsFilesFollowTheDeployedProfile(t *testing.T) {
	e := pluginEnv(t)
	ini := e.settingsFile("Skyrim.ini")
	e.write(ini, "[Display]\r\nfGamma=1.0\r\n")
	e.deployOK()
	a := e.active()
	if err := e.gcfg.SetLocalSettings(ctx, a.ID(), true); err != nil {
		t.Fatal(err)
	}
	if got, _ := e.readFile(ini); got != "[Display]\r\nfGamma=1.0\r\n" {
		t.Fatalf("turning it on starts from the shared file: %q", got)
	}
	if _, err := os.Stat(filepath.Join(e.dir, "mo", "backups", "game_settings")); err != nil {
		t.Fatalf("the file found before the first swap is kept: %v", err)
	}
	// The game's options menu writes the file of the profile in the game.
	e.write(ini, "[Display]\r\nfGamma=1.5\r\n")

	bID, err := e.prof.Create(ctx, e.inst.ID, "B", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := e.prof.Activate(ctx, bID); err != nil {
		t.Fatal(err)
	}
	if got, _ := e.readFile(ini); got != "[Display]\r\nfGamma=1.5\r\n" {
		t.Fatalf("activating never swaps before the deploy: %q", got)
	}
	e.deployOK()
	if got, _ := e.readFile(ini); got != "[Display]\r\nfGamma=1.0\r\n" {
		t.Fatalf("a profile without its own settings gets the shared file: %q", got)
	}
	if err := e.prof.Activate(ctx, a.ID()); err != nil {
		t.Fatal(err)
	}
	e.deployOK()
	if got, _ := e.readFile(ini); got != "[Display]\r\nfGamma=1.5\r\n" {
		t.Fatalf("the edit of the game came back with its profile: %q", got)
	}
	if _, ok := e.readFile(e.settingsFile("SkyrimPrefs.ini")); ok {
		t.Fatal("a file the game did not have is not created")
	}
	e.purgeOK()
	if got, _ := e.readFile(ini); got != "[Display]\r\nfGamma=1.0\r\n" {
		t.Fatalf("a purge gives the shared file back: %q", got)
	}
}

// The save folder key (D142) lives in SkyrimCustom.ini, which is also a
// settings file of the profiles: a swap carries the key over, so each
// profile keeps saving in its own folder and the saves module sees no
// external change.
func TestSettingsSwapKeepsTheSaveFolderKey(t *testing.T) {
	e := pluginEnv(t)
	custom := e.customINI()
	e.write(custom, "[Display]\r\nfGamma=1.2\r\n")
	e.deployOK()
	a := e.active()
	if err := e.saves.SetLocalSaves(ctx, a.ID(), true); err != nil {
		t.Fatal(err)
	}
	if err := e.gcfg.SetLocalSettings(ctx, a.ID(), true); err != nil {
		t.Fatal(err)
	}
	wantA := "[Display]\r\nfGamma=1.2\r\n[General]\r\nSLocalSavePath=Saves\\" + string(a.ID()) + "\\\r\n"
	if got := e.readINI(); got != wantA {
		t.Fatalf("profile A: %q", got)
	}
	bID, err := e.prof.Clone(ctx, e.inst.ID, "B", a.ID(), []string{"game_settings"})
	if err != nil {
		t.Fatal(err)
	}
	if err := e.prof.Activate(ctx, bID); err != nil {
		t.Fatal(err)
	}
	e.deployOK()
	wantB := "[Display]\r\nfGamma=1.2\r\n[General]\r\nSLocalSavePath=Saves\\" + string(bID) + "\\\r\n"
	if got := e.readINI(); got != wantB {
		t.Fatalf("the clone has the copy of A and its own save folder: %q", got)
	}
	list, err := e.saves.Diagnostics(ctx, e.inst.ID)
	if err != nil || len(list) != 0 {
		t.Fatalf("the saves module sees no external change: %v %v", list, err)
	}
	e.purgeOK()
	if got := e.readINI(); got != "[Display]\r\nfGamma=1.2\r\n[General]\r\n" {
		t.Fatalf("purge: %q", got)
	}
}

// M8 (LV8): the INI tweaks of a mod are off by default; on, their keys go
// over the file in effect, a later mod wins, a key changed outside the app
// is not overwritten without the user, and off gives the original back.
func TestIniTweaksOfTheMods(t *testing.T) {
	e := pluginEnv(t)
	prefs := e.settingsFile("SkyrimPrefs.ini")
	e.write(prefs, "[Display]\r\niShadowMapResolution=2048\r\n")
	ids := e.installFiles(map[string][]string{
		"Shadows": {"INI Tweaks/Shadows [SkyrimPrefs].ini", "[Display]\r\niShadowMapResolution=4096\r\nfShadowDistance=8000\r\n", "readme.txt", "x"},
		"Later":   {"INI Tweaks/More [SkyrimPrefs].ini", "[Display]\r\nfShadowDistance=9000\r\n"},
	}, "Shadows", "Later")
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids, true); err != nil {
		t.Fatal(err)
	}
	e.deployOK()
	tweaks, ok, err := e.gcfg.Tweaks(ctx, ids[0])
	if err != nil || !ok || len(tweaks) != 1 || tweaks[0].Enabled || tweaks[0].Keys != 2 || tweaks[0].FileName() != "SkyrimPrefs.ini" {
		t.Fatalf("tweaks %+v %v %v", tweaks, ok, err)
	}
	if got, _ := e.readFile(prefs); got != "[Display]\r\niShadowMapResolution=2048\r\n" {
		t.Fatalf("tweaks are off by default: %q", got)
	}
	for _, id := range ids {
		tw, _, _ := e.gcfg.Tweaks(ctx, id)
		if err := e.gcfg.SetTweak(ctx, id, tw[0].Path, true); err != nil {
			t.Fatal(err)
		}
	}
	want := "[Display]\r\niShadowMapResolution=4096\r\nfShadowDistance=9000\r\n"
	if got, _ := e.readFile(prefs); got != want {
		t.Fatalf("tweaks on, the later mod wins: %q", got)
	}

	e.write(prefs, "[Display]\r\niShadowMapResolution=1024\r\nfShadowDistance=9000\r\n")
	if _, ok := e.diagCodes()[diagnostic.CodeIniTweakExternal]; !ok {
		t.Fatal("a key changed outside the app is reported")
	}
	e.deployOK()
	if got, _ := e.readFile(prefs); got != "[Display]\r\niShadowMapResolution=1024\r\nfShadowDistance=9000\r\n" {
		t.Fatalf("a deploy does not overwrite it: %q", got)
	}
	if err := e.gcfg.ReapplyTweaks(ctx, e.inst.ID); err != nil {
		t.Fatal(err)
	}
	if got, _ := e.readFile(prefs); got != want {
		t.Fatalf("reapplied on the user's decision: %q", got)
	}

	if err := e.gcfg.SetTweak(ctx, ids[1], tweaks[0].Path, true); !isCode(err, gameconfig.CodeTweakNotFound) {
		t.Fatalf("a tweak of another mod: %v", err)
	}
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{ids[1]}, false); err != nil {
		t.Fatal(err)
	}
	e.deployOK()
	if got, _ := e.readFile(prefs); got != "[Display]\r\niShadowMapResolution=4096\r\nfShadowDistance=8000\r\n" {
		t.Fatalf("a disabled mod's tweak no longer wins: %q", got)
	}
	if err := e.gcfg.SetTweak(ctx, ids[0], tweaks[0].Path, false); err != nil {
		t.Fatal(err)
	}
	if got, _ := e.readFile(prefs); got != "[Display]\r\niShadowMapResolution=2048\r\n" {
		t.Fatalf("off gives the originals back: %q", got)
	}
}

func isCode(err error, code string) bool {
	var c interface{ Code() string }
	return errors.As(err, &c) && c.Code() == code
}

// The generic adapter has no game_settings: nothing is written in the
// Documents folder, commands answer game_settings_unsupported and there are
// no diagnostics nor a clone option (D112).
func TestGameSettingsWithoutTheCapability(t *testing.T) {
	e := newEnvWith(t, envOptions{generic: true})
	e.deployOK()
	a := e.active()
	if err := e.gcfg.SetLocalSettings(ctx, a.ID(), true); !isCode(err, gameconfig.CodeUnsupported) {
		t.Fatalf("set: %v", err)
	}
	if list, err := e.gcfg.Diagnostics(ctx, e.inst.ID); err != nil || len(list) != 0 {
		t.Fatalf("diagnostics: %v %v", list, err)
	}
	if _, _, ok := e.gcfg.CopySize(ctx, a); ok {
		t.Fatal("no clone option")
	}
	e.purgeOK()
	if _, err := os.Stat(filepath.Join(e.dir, "Documents")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("nothing written in Documents: %v", err)
	}
}

// iniGame is a test adapter for the required keys (M11): its game needs
// bInvalidateOlderFiles=1 in [Archive] of Game.ini, as Fallout 4 does.
type iniGame struct{ folderGame }

const iniGameID game.ID = "inigame"

func (iniGame) Name() string { return "inigame" }

func (iniGame) Definitions() []game.Definition {
	d := folderGame{}.Definitions()[0]
	d.ID, d.Name = iniGameID, "INI game"
	d.Capabilities = game.NewCapabilities(game.CapFilesystemTarget, game.CapModTypes, game.CapInstaller, game.CapGameSettings)
	d.ModTypes = d.ModTypes[1:]
	d.ModTypes[0].ID = game.DefaultModType
	return []game.Definition{d}
}

func (a iniGame) InstanceDefinition(game.ID, []game.Target) (game.Definition, error) {
	d := a.Definitions()[0]
	return d, d.Validate()
}

func (iniGame) SettingsFiles(game.Instance) []gamesettings.File {
	return []gamesettings.File{{Folder: ports.FolderDocuments, Path: "My Games/INI Game/Game.ini"}}
}

func (iniGame) RequiredSettings(game.Instance) []gamesettings.Required {
	return []gamesettings.Required{{File: "My Games/INI Game/Game.ini", Section: "Archive", Key: "bInvalidateOlderFiles", Value: "1"}}
}

func (iniGame) IniTweak(game.Instance, game.Location) (string, bool) { return "", false }

func TestRequiredSettingsAreCheckedAndFixed(t *testing.T) {
	var docs string
	e := newEnvWith(t, envOptions{
		adapters: []ports.GameAdapter{iniGame{}},
		setup: func(dir string) games.Setup {
			root := filepath.Join(dir, "Game")
			docs = filepath.Join(dir, "Documents", "My Games", "INI Game", "Game.ini")
			_ = os.MkdirAll(filepath.Join(root, "Mods"), 0o755)
			return games.Setup{
				Game: iniGameID, Root: root, Method: game.MethodCopy,
				Folders: games.Folders{
					Staging: filepath.Join(dir, "mo", "staging"), ArchiveStore: filepath.Join(dir, "mo", "archives"),
					BackupStore: filepath.Join(dir, "mo", "backups"),
				},
			}
		},
	})
	e.write(docs, "[Archive]\r\nbInvalidateOlderFiles=0\r\nsResourceDataDirsFinal=\r\n")
	d, ok := e.diagCodes()[diagnostic.CodeGameSettingRequired]
	if !ok || d.Params["key"] != "bInvalidateOlderFiles" || d.Params["found"] != "0" {
		t.Fatalf("required key reported: %+v", d)
	}
	if err := e.gcfg.Execute(context.Background(), e.inst.ID, diagnostic.Action{ID: gameconfig.ActionFixRequired}); err != nil {
		t.Fatal(err)
	}
	if got, _ := e.readFile(docs); got != "[Archive]\r\nbInvalidateOlderFiles=1\r\nsResourceDataDirsFinal=\r\n" {
		t.Fatalf("only the line of the key changes: %q", got)
	}
	if _, ok := e.diagCodes()[diagnostic.CodeGameSettingRequired]; ok {
		t.Fatal("fixed")
	}
}
