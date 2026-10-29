package skyrimse

import (
	"testing"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/relpath"
)

func TestSettingsFilesFollowTheStore(t *testing.T) {
	files := Adapter{}.SettingsFiles(game.Instance{Store: "gog"})
	if len(files) != 3 || files[0].Path != "My Games/Skyrim Special Edition GOG/Skyrim.ini" || files[2].Name() != "SkyrimCustom.ini" {
		t.Fatalf("files %+v", files)
	}
	if len(Adapter{}.RequiredSettings(game.Instance{})) != 0 {
		t.Fatal("Skyrim SE needs no key for loose files")
	}
}

func TestIniTweakTargets(t *testing.T) {
	inst := game.Instance{}
	cases := []struct {
		target game.TargetID
		path   string
		want   string
		ok     bool
	}{
		{TargetData, "INI Tweaks/Water.ini", "My Games/Skyrim Special Edition/Skyrim.ini", true},
		{TargetData, "ini tweaks/Shadows [SkyrimPrefs].ini", "My Games/Skyrim Special Edition/SkyrimPrefs.ini", true},
		{TargetData, "INI Tweaks/Odd [Unknown].ini", "My Games/Skyrim Special Edition/Skyrim.ini", true},
		{TargetData, "INI Tweaks/readme.txt", "", false},
		{TargetData, "SKSE/Plugins/x.ini", "", false},
		{TargetRoot, "INI Tweaks/Water.ini", "", false},
	}
	for _, c := range cases {
		got, ok := Adapter{}.IniTweak(inst, game.Location{Target: c.target, Path: relpath.MustParse(c.path)})
		if got != c.want || ok != c.ok {
			t.Errorf("%s:%s = %q %v", c.target, c.path, got, ok)
		}
	}
}
