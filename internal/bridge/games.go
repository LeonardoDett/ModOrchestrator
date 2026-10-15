package bridge

import (
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/operation"
)

// Games bridge (ui/telas/games.md §6). Every method only translates between
// DTOs and the games service; none decides anything.

// GamesView returns managed, discovered and supported games. Hidden entries
// are included only when showHidden is set.
func (a *App) GamesView(showHidden bool) (GamesViewDTO, error) {
	v, err := a.c.Games.View(a.context(), showHidden)
	if err != nil {
		return GamesViewDTO{}, a.fail("games view", err, nil)
	}
	out := GamesViewDTO{
		Managed: []ManagedGameDTO{}, Discovered: []DiscoveredGameDTO{}, Supported: []SupportedGameDTO{},
		Scanned: v.Scanned, HiddenCount: v.HiddenCount,
	}
	for _, m := range v.Managed {
		out.Managed = append(out.Managed, toManagedDTO(m))
	}
	for _, d := range v.Discovered {
		out.Discovered = append(out.Discovered, DiscoveredGameDTO{
			GameID: string(d.Candidate.Game), GameName: d.Definition.Name, Root: d.Candidate.Root,
			Store: d.Candidate.Store, Version: d.Candidate.Version, Hidden: d.Hidden,
		})
	}
	for _, s := range v.Supported {
		out.Supported = append(out.Supported, SupportedGameDTO{GameID: string(s.Definition.ID), GameName: s.Definition.Name, Hidden: s.Hidden})
	}
	return out, nil
}

// GameInstanceDetails returns one managed instance with its paths, mod types
// and capabilities.
func (a *App) GameInstanceDetails(id string) (ManagedGameDTO, error) {
	m, err := a.c.Games.Details(a.context(), game.InstanceID(id))
	if err != nil {
		return ManagedGameDTO{}, a.fail("game details", err, map[string]string{"instance": id})
	}
	return toManagedDTO(m), nil
}

// Workspace returns the shell navigation: active instance, switcher and the
// workspace screens by capability.
func (a *App) Workspace() (WorkspaceDTO, error) {
	w, err := a.c.Games.Workspace(a.context())
	if err != nil {
		return WorkspaceDTO{}, a.fail("workspace", err, nil)
	}
	out := WorkspaceDTO{Instances: []InstanceRefDTO{}, Items: []string{}, Groups: []WorkspaceGroupDTO{}}
	for _, r := range w.Instances {
		out.Instances = append(out.Instances, InstanceRefDTO{ID: string(r.ID), Name: r.Name, GameName: r.GameName, Accent: r.Accent})
	}
	if w.Active != nil {
		out.Active = &InstanceRefDTO{ID: string(w.Active.ID), Name: w.Active.Name, GameName: w.Active.GameName, Accent: w.Active.Accent}
	}
	for _, it := range w.Items {
		out.Items = append(out.Items, string(it))
	}
	for _, g := range w.Groups {
		dto := WorkspaceGroupDTO{ID: g.ID, Items: []string{}}
		for _, it := range g.Items {
			dto.Items = append(dto.Items, string(it))
		}
		out.Groups = append(out.Groups, dto)
	}
	return out, nil
}

// ScanGames runs the quick search (synchronously, it only reads the stores)
// or starts the full one and returns its operation id.
func (a *App) ScanGames(mode string) (string, error) {
	if mode == "full" {
		id, err := a.c.Games.StartFullScan(a.context())
		if err != nil {
			return "", a.fail("scan games", err, nil)
		}
		return string(id), nil
	}
	if _, err := a.c.Games.ScanQuick(a.context()); err != nil {
		return "", a.fail("scan games", err, nil)
	}
	return "", nil
}

// CancelOperation cancels a cancellable operation: the full game search or
// an item of the install queue (D065).
func (a *App) CancelOperation(id string) bool {
	if a.c.Games.CancelOperation(id) {
		return true
	}
	return a.c.Library.CancelQueued(a.context(), operation.ID(id)) == nil
}

// ValidateGameRoot checks a folder as an installation of the game.
func (a *App) ValidateGameRoot(gameID, root string) (RootCheckDTO, error) {
	check, err := a.c.Games.CheckRoot(a.context(), game.ID(gameID), root)
	if err != nil {
		return RootCheckDTO{}, a.fail("validate root", err, map[string]string{"game": gameID})
	}
	out := RootCheckDTO{Root: check.Root, Version: check.Version}
	if check.Problem != nil {
		out.Problem = &ProblemDTO{Code: check.Problem.Code, Params: check.Problem.Params}
	}
	return out, nil
}

// SuggestGameFolders proposes staging, archives and backups on the volume of
// the game.
func (a *App) SuggestGameFolders(gameID, root, name string) (FoldersDTO, error) {
	f, err := a.c.Games.SuggestFolders(a.context(), game.ID(gameID), root, name)
	if err != nil {
		return FoldersDTO{}, a.fail("suggest folders", err, map[string]string{"game": gameID})
	}
	return FoldersDTO{Staging: f.Staging, ArchiveStore: f.ArchiveStore, BackupStore: f.BackupStore, SuggestedStaging: f.SuggestedStaging}, nil
}

// VerifyGameSetup runs the read-only verification step of the assistant.
func (a *App) VerifyGameSetup(setup SetupDTO) (VerificationDTO, error) {
	v, err := a.c.Games.Verify(a.context(), toSetup(setup))
	if err != nil {
		return VerificationDTO{}, a.fail("verify setup", err, map[string]string{"game": setup.GameID})
	}
	return toVerificationDTO(v), nil
}

// ManageGame creates the instance from the assistant data.
func (a *App) ManageGame(setup SetupDTO) (ManageResultDTO, error) {
	res, err := a.c.Games.Manage(a.context(), toSetup(setup))
	if err != nil {
		return ManageResultDTO{}, a.fail("manage game", err, map[string]string{"game": setup.GameID})
	}
	a.c.Logger.Info("game managed", "instance", string(res.Instance), "game", setup.GameID)
	return ManageResultDTO{InstanceID: string(res.Instance), OperationID: string(res.Operation)}, nil
}

// SetActiveInstance selects the instance the workspace shows.
func (a *App) SetActiveInstance(id string) error {
	if err := a.c.Games.SetActive(a.context(), game.InstanceID(id)); err != nil {
		return a.fail("set active instance", err, map[string]string{"instance": id})
	}
	return nil
}

// RenameInstance changes the name of an instance.
func (a *App) RenameInstance(id, name string) error {
	if err := a.c.Games.Rename(a.context(), game.InstanceID(id), name); err != nil {
		return a.fail("rename instance", err, map[string]string{"instance": id, "name": name})
	}
	return nil
}

// HideInstance hides or shows a managed instance.
func (a *App) HideInstance(id string, hidden bool) error {
	if err := a.c.Games.SetInstanceHidden(a.context(), game.InstanceID(id), hidden); err != nil {
		return a.fail("hide instance", err, map[string]string{"instance": id})
	}
	return nil
}

// HideGame hides or shows a discovered or supported game.
func (a *App) HideGame(gameID string, hidden bool) error {
	if err := a.c.Games.SetGameHidden(a.context(), game.ID(gameID), hidden); err != nil {
		return a.fail("hide game", err, map[string]string{"game": gameID})
	}
	return nil
}

// UpdateInstanceLocation points an instance at another game folder.
func (a *App) UpdateInstanceLocation(id, root string) error {
	if err := a.c.Games.Relocate(a.context(), game.InstanceID(id), root); err != nil {
		return a.fail("update location", err, map[string]string{"instance": id})
	}
	return nil
}

// UnmanageGame stops managing an instance and returns the operation id.
func (a *App) UnmanageGame(id string, opts UnmanageOptionsDTO) (string, error) {
	op, err := a.c.Games.Unmanage(a.context(), game.InstanceID(id), games.UnmanageOptions{
		DeleteFiles: opts.DeleteFiles, ConfirmName: opts.ConfirmName,
	})
	if err != nil {
		return "", a.fail("unmanage game", err, map[string]string{"instance": id})
	}
	a.c.Logger.Info("game unmanaged", "instance", id, "deleteFiles", opts.DeleteFiles)
	return string(op), nil
}

// OpenInstanceFolder opens one of the folders of an instance (game, staging,
// archives, backups) in the file manager.
func (a *App) OpenInstanceFolder(id, which string) error {
	path, err := a.c.Games.FolderPath(a.context(), game.InstanceID(id), which)
	if err != nil {
		return a.fail("open folder", err, map[string]string{"instance": id, "folder": which})
	}
	if err := a.c.OpenFolder(path); err != nil {
		return a.fail("open folder", err, map[string]string{"instance": id, "folder": which})
	}
	return nil
}

// PickFolder opens the native folder picker and returns the chosen path, or
// "" when the user cancels.
func (a *App) PickFolder(title string) (string, error) {
	path, err := runtime.OpenDirectoryDialog(a.context(), runtime.OpenDialogOptions{Title: title})
	if err != nil {
		return "", a.fail("pick folder", err, nil)
	}
	return path, nil
}

// GamesSupport returns, for every game of the registry, how it is served
// and each capability of the catalog as a feature (D112, D113). It is
// derived from the registered adapters.
func (a *App) GamesSupport() []GameSupportDTO {
	out := []GameSupportDTO{}
	for _, s := range a.c.Games.Registry.Support() {
		g := GameSupportDTO{
			GameID: string(s.Game), GameName: s.Name, Adapter: s.Adapter, AdapterVersion: s.AdapterVersion,
			Support: string(s.Support), Stores: s.Stores, Custom: s.Custom, Features: []FeatureDTO{},
		}
		for _, f := range s.Features {
			fd := FeatureDTO{ID: string(f.ID), Status: string(f.Status), Class: string(f.Class), Default: f.Default, Requires: []string{}}
			for _, r := range f.Requires {
				fd.Requires = append(fd.Requires, string(r))
			}
			g.Features = append(g.Features, fd)
		}
		out = append(out, g)
	}
	return out
}

// InstanceFeatures lists the features of an instance: what the game offers,
// what the user chose and what is in effect (D115).
func (a *App) InstanceFeatures(id string) ([]InstanceFeatureDTO, error) {
	list, err := a.c.Games.Features(a.context(), game.InstanceID(id))
	if err != nil {
		return nil, a.fail("instance features", err, map[string]string{"instance": id})
	}
	out := make([]InstanceFeatureDTO, 0, len(list))
	for _, f := range list {
		out = append(out, InstanceFeatureDTO{
			ID: string(f.ID), Status: string(f.Status), Class: string(f.Class),
			Requires: capabilityIDs(f.Requires), Enabled: f.Enabled, Effective: f.Effective,
			BlockedBy: capabilityIDs(f.BlockedBy),
		})
	}
	return out, nil
}

// SetInstanceFeature turns an optional feature of an instance on or off.
func (a *App) SetInstanceFeature(id, feature string, enabled bool) error {
	if err := a.c.Games.SetFeature(a.context(), game.InstanceID(id), game.Capability(feature), enabled); err != nil {
		return a.fail("set instance feature", err, map[string]string{"instance": id, "feature": feature})
	}
	a.c.Logger.Info("instance feature changed", "instance", id, "feature", feature, "enabled", enabled)
	return nil
}

func capabilityIDs(in []game.Capability) []string {
	out := make([]string, 0, len(in))
	for _, c := range in {
		out = append(out, string(c))
	}
	return out
}

// GameEntries lists the games the user described (D117).
func (a *App) GameEntries() ([]GameEntryDTO, error) {
	list, err := a.c.Games.ListEntries(a.context())
	if err != nil {
		return nil, a.fail("game entries", err, nil)
	}
	out := make([]GameEntryDTO, 0, len(list))
	for _, e := range list {
		out = append(out, GameEntryDTO{GameID: string(e.Manifest.ID), GameName: e.Manifest.Name, Instances: e.Instances})
	}
	return out, nil
}

// ExportGameEntry returns the manifest of a user entry as JSON text, the
// same document ImportGameEntry reads.
func (a *App) ExportGameEntry(gameID string) (string, error) {
	data, err := a.c.Games.ExportEntry(a.context(), game.ID(gameID))
	if err != nil {
		return "", a.fail("export game entry", err, map[string]string{"game": gameID})
	}
	return string(data), nil
}

// ImportGameEntry adds a game from manifest text and returns its id.
func (a *App) ImportGameEntry(manifest string) (string, error) {
	id, err := a.c.Games.ImportEntry(a.context(), []byte(manifest))
	if err != nil {
		return "", a.fail("import game entry", err, nil)
	}
	a.c.Logger.Info("game entry imported", "game", string(id))
	return string(id), nil
}

// DeleteGameEntry removes a user entry no instance uses.
func (a *App) DeleteGameEntry(gameID string) error {
	if err := a.c.Games.DeleteEntry(a.context(), game.ID(gameID)); err != nil {
		return a.fail("delete game entry", err, map[string]string{"game": gameID})
	}
	a.c.Logger.Info("game entry deleted", "game", gameID)
	return nil
}

// SaveGameEntryFile asks where to save a user game and writes its manifest
// (R5c); it returns the path, or "" when the user cancels.
func (a *App) SaveGameEntryFile(gameID, title, defaultName string) (string, error) {
	path, err := runtime.SaveFileDialog(a.context(), runtime.SaveDialogOptions{
		Title: title, DefaultFilename: defaultName,
		Filters: []runtime.FileFilter{{DisplayName: "JSON (*.json)", Pattern: "*.json"}},
	})
	if err != nil {
		return "", a.fail("game entry dialog", err, nil)
	}
	if path == "" {
		return "", nil
	}
	if err := a.c.Games.ExportEntryToFile(a.context(), game.ID(gameID), path); err != nil {
		return "", a.fail("export game entry", err, map[string]string{"game": gameID})
	}
	a.c.Logger.Info("game entry exported", "game", gameID)
	return path, nil
}

// OpenGameEntryFile asks for a game manifest and adds the game (R5c); it
// returns the new game id, or "" when the user cancels.
func (a *App) OpenGameEntryFile(title string) (string, error) {
	path, err := runtime.OpenFileDialog(a.context(), runtime.OpenDialogOptions{
		Title: title, Filters: []runtime.FileFilter{{DisplayName: "JSON (*.json)", Pattern: "*.json"}},
	})
	if err != nil {
		return "", a.fail("game entry dialog", err, nil)
	}
	if path == "" {
		return "", nil
	}
	id, err := a.c.Games.ImportEntryFromFile(a.context(), path)
	if err != nil {
		return "", a.fail("import game entry", err, nil)
	}
	a.c.Logger.Info("game entry imported", "game", string(id))
	return string(id), nil
}
