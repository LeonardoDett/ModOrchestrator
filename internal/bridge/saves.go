package bridge

import (
	"encoding/base64"

	"modorchestrator/internal/core/application/saves"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/profile"
)

// Saves bridge (board JogoSaves, D142). Every method only translates
// between DTOs and the saves service; none decides anything.

type SaveModDTO struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

type MissingPluginDTO struct {
	Name    string       `json:"name"`
	Present bool         `json:"present"`
	Mods    []SaveModDTO `json:"mods"`
}

type SaveDTO struct {
	Name          string             `json:"name"`
	Size          int64              `json:"size"`
	ModTime       string             `json:"modTime"`
	Companions    []string           `json:"companions"`
	Readable      bool               `json:"readable"`
	ReadError     string             `json:"readError,omitempty"`
	Kind          string             `json:"kind"`
	Number        int                `json:"number"`
	Character     string             `json:"character"`
	Level         int                `json:"level"`
	Location      string             `json:"location"`
	GameTime      string             `json:"gameTime"`
	Race          string             `json:"race"`
	SavedAt       string             `json:"savedAt"`
	Plugins       []string           `json:"plugins"`
	HasScreenshot bool               `json:"hasScreenshot"`
	Missing       []MissingPluginDTO `json:"missing"`
}

type SaveNamespaceDTO struct {
	Profile string `json:"profile"`
	Name    string `json:"name"`
	Local   bool   `json:"local"`
	Active  bool   `json:"active"`
}

type SavesDTO struct {
	Profile        string             `json:"profile"`
	ProfileName    string             `json:"profileName"`
	Local          bool               `json:"local"`
	Folder         string             `json:"folder"`
	PluginsChecked bool               `json:"pluginsChecked"`
	Saves          []SaveDTO          `json:"saves"`
	Profiles       []SaveNamespaceDTO `json:"profiles"`
}

type SaveTransferDTO struct {
	Renamed map[string]string `json:"renamed"`
}

type SaveEnableResultDTO struct {
	Mods    []SaveModDTO `json:"mods"`
	Plugins []string     `json:"plugins"`
	Absent  []string     `json:"absent"`
}

type CopyOptionDTO struct {
	ID    string `json:"id"`
	Files int    `json:"files"`
	Bytes int64  `json:"bytes"`
}

func toSaveModDTOs(ms []saves.ModRef) []SaveModDTO {
	out := make([]SaveModDTO, len(ms))
	for i, m := range ms {
		out[i] = SaveModDTO{ID: string(m.ID), Name: m.Name, Enabled: m.Enabled}
	}
	return out
}

func toSaveDTO(s saves.Save) SaveDTO {
	d := SaveDTO{
		Name: s.Name, Size: s.Size, ModTime: stamp(s.ModTime), Companions: s.Companions, ReadError: s.ReadError,
		HasScreenshot: s.HasScreenshot, Missing: []MissingPluginDTO{}, Plugins: []string{},
	}
	if d.Companions == nil {
		d.Companions = []string{}
	}
	if h := s.Header; h != nil {
		d.Readable = true
		d.Kind, d.Number, d.Character, d.Level = string(h.Kind), h.Number, h.Character, h.Level
		d.Location, d.GameTime, d.Race, d.SavedAt = h.Location, h.GameTime, h.Race, stamp(h.SavedAt)
		if h.Plugins != nil {
			d.Plugins = h.Plugins
		}
	}
	for _, m := range s.Missing {
		d.Missing = append(d.Missing, MissingPluginDTO{Name: m.Name, Present: m.Present, Mods: toSaveModDTOs(m.Mods)})
	}
	return d
}

// Saves lists the saves of the active profile.
func (a *App) Saves(instance string) (SavesDTO, error) {
	ls, err := a.c.Saves.List(a.context(), game.InstanceID(instance))
	if err != nil {
		return SavesDTO{}, a.fail("saves", err, map[string]string{"instance": instance})
	}
	out := SavesDTO{
		Profile: string(ls.Profile), ProfileName: ls.ProfileName, Local: ls.Local, Folder: ls.Folder,
		PluginsChecked: ls.PluginsChecked, Saves: make([]SaveDTO, len(ls.Saves)), Profiles: []SaveNamespaceDTO{},
	}
	for i, s := range ls.Saves {
		out.Saves[i] = toSaveDTO(s)
	}
	for _, p := range ls.Profiles {
		out.Profiles = append(out.Profiles, SaveNamespaceDTO{Profile: string(p.Profile), Name: p.Name, Local: p.Local, Active: p.Active})
	}
	return out, nil
}

// SaveScreenshot is the picture of a save as a PNG data URL.
func (a *App) SaveScreenshot(instance, name string) (string, error) {
	b, err := a.c.Saves.Screenshot(a.context(), game.InstanceID(instance), name)
	if err != nil {
		return "", a.fail("save screenshot", err, map[string]string{"name": name})
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(b), nil
}

// SetLocalSaves turns "Saves próprios" on or off for a profile.
func (a *App) SetLocalSaves(profileID string, on bool) error {
	if err := a.c.Saves.SetLocalSaves(a.context(), profile.ID(profileID), on); err != nil {
		return a.fail("set local saves", err, nil)
	}
	return nil
}

// PreviewSaveTransfer says which saves get a new name in the destination.
func (a *App) PreviewSaveTransfer(instance string, names []string, to string) (SaveTransferDTO, error) {
	p, err := a.c.Saves.PreviewTransfer(a.context(), game.InstanceID(instance), names, profile.ID(to))
	if err != nil {
		return SaveTransferDTO{}, a.fail("preview save transfer", err, nil)
	}
	return SaveTransferDTO{Renamed: p.Renamed}, nil
}

// TransferSaves copies (move = false) or moves saves to another profile.
func (a *App) TransferSaves(instance string, names []string, to string, move bool) (SaveTransferDTO, error) {
	p, err := a.c.Saves.Transfer(a.context(), game.InstanceID(instance), names, profile.ID(to), move)
	if err != nil {
		return SaveTransferDTO{}, a.fail("transfer saves", err, nil)
	}
	return SaveTransferDTO{Renamed: p.Renamed}, nil
}

// DeleteSaves deletes saves of the active profile (the UI confirms first).
func (a *App) DeleteSaves(instance string, names []string) error {
	if err := a.c.Saves.Delete(a.context(), game.InstanceID(instance), names); err != nil {
		return a.fail("delete saves", err, nil)
	}
	return nil
}

// EnableSaveProviders is "Habilitar os mods que fornecem".
func (a *App) EnableSaveProviders(instance, name string) (SaveEnableResultDTO, error) {
	r, err := a.c.Saves.EnableProviders(a.context(), game.InstanceID(instance), name)
	if err != nil {
		return SaveEnableResultDTO{}, a.fail("enable save providers", err, map[string]string{"name": name})
	}
	out := SaveEnableResultDTO{Mods: toSaveModDTOs(r.Mods), Plugins: r.Plugins, Absent: r.Absent}
	if out.Plugins == nil {
		out.Plugins = []string{}
	}
	if out.Absent == nil {
		out.Absent = []string{}
	}
	return out, nil
}

// OpenSavesFolder opens the save folder of the active profile.
func (a *App) OpenSavesFolder(instance string) error {
	ls, err := a.c.Saves.List(a.context(), game.InstanceID(instance))
	if err != nil {
		return a.fail("open saves folder", err, nil)
	}
	if err := a.c.OpenFolder(ls.Folder); err != nil {
		return a.fail("open saves folder", err, nil)
	}
	return nil
}

// ProfileCopyOptions lists what a clone of the profile may also copy.
func (a *App) ProfileCopyOptions(from string) ([]CopyOptionDTO, error) {
	opts, err := a.c.Profiles.CopyOptions(a.context(), profile.ID(from))
	if err != nil {
		return nil, a.fail("profile copy options", err, nil)
	}
	out := make([]CopyOptionDTO, len(opts))
	for i, o := range opts {
		out[i] = CopyOptionDTO{ID: o.ID, Files: o.Files, Bytes: o.Bytes}
	}
	return out, nil
}

// CloneProfile clones a profile with the copies chosen ("saves").
func (a *App) CloneProfile(instance, name, from string, copies []string) (string, error) {
	id, err := a.c.Profiles.Clone(a.context(), game.InstanceID(instance), name, profile.ID(from), copies)
	if err != nil {
		return string(id), a.fail("clone profile", err, map[string]string{"name": name})
	}
	return string(id), nil
}
