package bridge

import (
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/profile"
)

// GameSettingsInfoDTO is the game_settings feature of an instance (LV8):
// the settings files a profile may keep and the profiles that keep them.
type GameSettingsInfoDTO struct {
	Supported bool     `json:"supported"`
	Files     []string `json:"files"`
	Local     []string `json:"local"`
}

// IniTweakDTO is an INI tweak a mod brings.
type IniTweakDTO struct {
	Path    string `json:"path"`
	Name    string `json:"name"`
	File    string `json:"file"`
	Enabled bool   `json:"enabled"`
	Keys    int    `json:"keys"`
}

// ModIniTweaksDTO lists the INI tweaks of a mod.
type ModIniTweaksDTO struct {
	Supported bool          `json:"supported"`
	Tweaks    []IniTweakDTO `json:"tweaks"`
}

// GameSettingsInfo describes the feature for an instance.
func (a *App) GameSettingsInfo(instance string) (GameSettingsInfoDTO, error) {
	out := GameSettingsInfoDTO{Files: []string{}, Local: []string{}}
	info, ok, err := a.c.GameConfig.Info(a.context(), game.InstanceID(instance))
	if err != nil {
		return out, a.fail("game settings info", err, nil)
	}
	out.Supported = ok
	out.Files = append(out.Files, info.Files...)
	for _, p := range info.Local {
		out.Local = append(out.Local, string(p))
	}
	return out, nil
}

// SetLocalSettings turns "configurações próprias" on or off for a profile.
func (a *App) SetLocalSettings(profileID string, on bool) error {
	if err := a.c.GameConfig.SetLocalSettings(a.context(), profile.ID(profileID), on); err != nil {
		return a.fail("set local settings", err, nil)
	}
	return nil
}

// ModIniTweaks lists the INI tweaks of a mod.
func (a *App) ModIniTweaks(modID string) (ModIniTweaksDTO, error) {
	out := ModIniTweaksDTO{Tweaks: []IniTweakDTO{}}
	list, ok, err := a.c.GameConfig.Tweaks(a.context(), mod.ID(modID))
	if err != nil {
		return out, a.fail("mod ini tweaks", err, nil)
	}
	out.Supported = ok
	for _, t := range list {
		out.Tweaks = append(out.Tweaks, IniTweakDTO{Path: t.Path, Name: t.Name, File: t.FileName(), Enabled: t.Enabled, Keys: t.Keys})
	}
	return out, nil
}

// SetIniTweak turns an INI tweak of a mod on or off.
func (a *App) SetIniTweak(modID, path string, on bool) error {
	if err := a.c.GameConfig.SetTweak(a.context(), mod.ID(modID), path, on); err != nil {
		return a.fail("set ini tweak", err, map[string]string{"tweak": path})
	}
	return nil
}
