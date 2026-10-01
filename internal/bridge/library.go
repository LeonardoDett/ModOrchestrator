package bridge

import (
	"strconv"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"modorchestrator/internal/core/application/library"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
)

// Library bridge (ui/telas/mods.md §10). Every method only translates
// between DTOs and the library service; none decides anything.

type ModRowDTO struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	DetectedName string   `json:"detectedName"`
	Version      string   `json:"version"`
	Author       string   `json:"author"`
	Category     string   `json:"category"`
	CategoryPath []string `json:"categoryPath"`
	State        string   `json:"state"`
	Enabled      bool     `json:"enabled"`
	EnabledAt    string   `json:"enabledAt,omitempty"`
	Size         int64    `json:"size"`
	Files        int      `json:"files"`
	Type         string   `json:"type"`
	TypeName     string   `json:"typeName"`
	Content      []string `json:"content"`
	Installer    string   `json:"installer"`
	Source       string   `json:"source"`
	InstalledAt  string   `json:"installedAt,omitempty"`
	VariantOf    string   `json:"variantOf,omitempty"`
	VariantLabel string   `json:"variantLabel,omitempty"`
	Highlight    string   `json:"highlight,omitempty"`
	HasNotes     bool     `json:"hasNotes"`
	Queued       bool     `json:"queued"`
}

type ArchiveInfoDTO struct {
	Name     string `json:"name"`
	Kind     string `json:"kind"`
	Size     int64  `json:"size"`
	Hash     string `json:"hash"`
	Retained bool   `json:"retained"`
}

type InstallationInfoDTO struct {
	ID        string            `json:"id"`
	Installer string            `json:"installer"`
	Options   map[string]string `json:"options"`
	Files     int               `json:"files"`
	Size      int64             `json:"size"`
	CreatedAt string            `json:"createdAt"`
}

type ModDetailsDTO struct {
	ModRowDTO
	Description   string               `json:"description"`
	Notes         string               `json:"notes"`
	Tags          []string             `json:"tags"`
	VariantOfName string               `json:"variantOfName,omitempty"`
	Archive       *ArchiveInfoDTO      `json:"archive,omitempty"`
	Installation  *InstallationInfoDTO `json:"installation,omitempty"`
	ModTypes      []ModTypeDTO         `json:"modTypes"`
}

type ModFileDTO struct {
	Path   string `json:"path"`
	Target string `json:"target"`
	Size   int64  `json:"size"`
}

type ModFilesDTO struct {
	Total int          `json:"total"`
	Files []ModFileDTO `json:"files"`
}

type ModHistoryDTO struct {
	ID          string            `json:"id"`
	Type        string            `json:"type"`
	OccurredAt  string            `json:"occurredAt"`
	OperationID string            `json:"operationId,omitempty"`
	Params      map[string]string `json:"params"`
}

type DuplicateModDTO struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Version string `json:"version"`
}

type DecisionDTO struct {
	Kind           string            `json:"kind"`
	Choices        []string          `json:"choices"`
	Duplicates     []DuplicateModDTO `json:"duplicates"`
	SuggestedLabel string            `json:"suggestedLabel,omitempty"`
	Candidates     []string          `json:"candidates"`
	Folders        []string          `json:"folders"`
	Ratio          int64             `json:"ratio,omitempty"`
}

type QueueItemDTO struct {
	OperationID string       `json:"operationId"`
	Kind        string       `json:"kind"`
	Label       string       `json:"label"`
	Status      string       `json:"status"`
	Step        string       `json:"step,omitempty"`
	Decision    *DecisionDTO `json:"decision,omitempty"`
	Cancellable bool         `json:"cancellable"`
}

type AnswerDTO struct {
	Choice string `json:"choice"`
	Mod    string `json:"mod,omitempty"`
	Label  string `json:"label,omitempty"`
	Root   string `json:"root,omitempty"`
}

type RemovalPreviewDTO struct {
	Mods           []DuplicateModDTO `json:"mods"`
	OrphanRules    int               `json:"orphanRules"`
	SharedArchives []string          `json:"sharedArchives"`
	Deployed       bool              `json:"deployed"`
}

type ModAttributesDTO struct {
	Name      string   `json:"name"`
	Version   string   `json:"version"`
	Author    string   `json:"author"`
	Notes     string   `json:"notes"`
	Highlight string   `json:"highlight"`
	Tags      []string `json:"tags"`
}

type CategoryDTO struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Parent string `json:"parent,omitempty"`
	Order  int    `json:"order"`
}

func toModRowDTO(r library.ModRow) ModRowDTO {
	dto := ModRowDTO{
		ID: string(r.ID), Name: r.Name, DetectedName: r.DetectedName, Version: r.Version, Author: r.Author,
		Category: string(r.Category), CategoryPath: r.CategoryPath, State: string(r.State), Enabled: r.Enabled,
		Size: r.Size, Files: r.Files, Type: string(r.Type), TypeName: r.TypeName, Content: []string{},
		Installer: r.Installer, Source: r.Source, VariantOf: string(r.VariantOf), VariantLabel: r.VariantLabel,
		Highlight: r.Highlight.Color, HasNotes: r.HasNotes, Queued: r.Queued,
	}
	if dto.CategoryPath == nil {
		dto.CategoryPath = []string{}
	}
	for _, c := range r.Content {
		dto.Content = append(dto.Content, string(c))
	}
	if !r.EnabledAt.IsZero() {
		dto.EnabledAt = formatTime(r.EnabledAt)
	}
	if !r.InstalledAt.IsZero() {
		dto.InstalledAt = formatTime(r.InstalledAt)
	}
	return dto
}

func toDecisionDTO(d *library.Decision) *DecisionDTO {
	if d == nil {
		return nil
	}
	out := &DecisionDTO{
		Kind: d.Kind, Choices: d.Choices(), Duplicates: []DuplicateModDTO{}, SuggestedLabel: d.SuggestedLabel,
		Candidates: append([]string{}, d.Candidates...), Folders: append([]string{}, d.Folders...), Ratio: d.Ratio,
	}
	for _, m := range d.Duplicates {
		out.Duplicates = append(out.Duplicates, DuplicateModDTO{ID: string(m.ID), Name: m.Name, Version: m.Version})
	}
	return out
}

func modIDs(ids []string) []mod.ID {
	out := make([]mod.ID, len(ids))
	for i, id := range ids {
		out[i] = mod.ID(id)
	}
	return out
}

func opIDs(ids []operation.ID) []string {
	out := make([]string, len(ids))
	for i, id := range ids {
		out[i] = string(id)
	}
	return out
}

// ModList returns the rows of the Mods table.
func (a *App) ModList(instance string) ([]ModRowDTO, error) {
	rows, err := a.c.Library.ModList(a.context(), game.InstanceID(instance))
	if err != nil {
		return nil, a.fail("mod list", err, map[string]string{"instance": instance})
	}
	out := make([]ModRowDTO, len(rows))
	for i, r := range rows {
		out[i] = toModRowDTO(r)
	}
	return out, nil
}

// ModDetails returns the Inspector of one mod.
func (a *App) ModDetails(id string) (ModDetailsDTO, error) {
	d, err := a.c.Library.Details(a.context(), mod.ID(id))
	if err != nil {
		return ModDetailsDTO{}, a.fail("mod details", err, map[string]string{"mod": id})
	}
	out := ModDetailsDTO{
		ModRowDTO: toModRowDTO(d.ModRow), Description: d.Description, Notes: d.Notes, Tags: append([]string{}, d.Tags...),
		VariantOfName: d.VariantOfName, ModTypes: []ModTypeDTO{},
	}
	if d.Archive != nil {
		out.Archive = &ArchiveInfoDTO{Name: d.Archive.Name, Kind: string(d.Archive.Kind), Size: d.Archive.Size, Hash: d.Archive.Hash, Retained: d.Archive.Retained}
	}
	if d.Installation != nil {
		opts := map[string]string{}
		for k, v := range d.Installation.Options {
			opts[k] = v
		}
		out.Installation = &InstallationInfoDTO{
			ID: string(d.Installation.ID), Installer: d.Installation.Installer, Options: opts,
			Files: d.Installation.Files, Size: d.Installation.Size, CreatedAt: formatTime(d.Installation.CreatedAt),
		}
	}
	for _, t := range d.ModTypes {
		out.ModTypes = append(out.ModTypes, ModTypeDTO{ID: string(t.ID), Name: t.Name, Target: string(t.Target)})
	}
	return out, nil
}

// ModFiles returns a window of the files of a mod.
func (a *App) ModFiles(id, filter string, offset, limit int) (ModFilesDTO, error) {
	page, err := a.c.Library.Files(a.context(), mod.ID(id), filter, offset, limit)
	if err != nil {
		return ModFilesDTO{}, a.fail("mod files", err, map[string]string{"mod": id})
	}
	out := ModFilesDTO{Total: page.Total, Files: make([]ModFileDTO, len(page.Files))}
	for i, f := range page.Files {
		out.Files[i] = ModFileDTO{Path: f.Path, Target: string(f.Target), Size: f.Size}
	}
	return out, nil
}

// ModHistory returns the events about a mod, newest first.
func (a *App) ModHistory(id string) ([]ModHistoryDTO, error) {
	evs, err := a.c.Library.History(a.context(), mod.ID(id), 100)
	if err != nil {
		return nil, a.fail("mod history", err, map[string]string{"mod": id})
	}
	out := make([]ModHistoryDTO, 0, len(evs))
	for _, e := range evs {
		params := map[string]string{}
		if m, ok := e.Payload.(map[string]string); ok {
			params = m
		}
		out = append(out, ModHistoryDTO{ID: e.ID, Type: string(e.Type), OccurredAt: formatTime(e.OccurredAt), OperationID: e.OperationID, Params: params})
	}
	return out, nil
}

// ImportQueue returns the visible install queue of an instance.
func (a *App) ImportQueue(instance string) []QueueItemDTO {
	items := a.c.Library.Queue(game.InstanceID(instance))
	out := make([]QueueItemDTO, len(items))
	for i, it := range items {
		out[i] = QueueItemDTO{
			OperationID: string(it.Operation), Kind: string(it.Kind), Label: it.Label, Status: string(it.Status),
			Step: it.Step, Decision: toDecisionDTO(it.Decision), Cancellable: it.Cancellable,
		}
	}
	return out
}

// ImportFiles queues files or folders (dropped or picked) for import.
func (a *App) ImportFiles(instance string, paths []string) ([]string, error) {
	ids, err := a.c.Library.ImportFiles(a.context(), game.InstanceID(instance), paths)
	if err != nil {
		return nil, a.fail("import files", err, map[string]string{"instance": instance})
	}
	return opIDs(ids), nil
}

// PickImportFiles opens the native file picker and queues the choice. An
// empty choice queues nothing.
func (a *App) PickImportFiles(instance, title string) ([]string, error) {
	paths, err := runtime.OpenMultipleFilesDialog(a.context(), runtime.OpenDialogOptions{
		Title:   title,
		Filters: []runtime.FileFilter{{DisplayName: "Archives (*.zip;*.7z;*.rar)", Pattern: "*.zip;*.7z;*.rar"}},
	})
	if err != nil {
		return nil, a.fail("pick files", err, nil)
	}
	if len(paths) == 0 {
		return []string{}, nil
	}
	return a.ImportFiles(instance, paths)
}

// PickImportFolder opens the native folder picker and queues the folder
// (D048).
func (a *App) PickImportFolder(instance, title string) ([]string, error) {
	path, err := runtime.OpenDirectoryDialog(a.context(), runtime.OpenDialogOptions{Title: title})
	if err != nil {
		return nil, a.fail("pick folder", err, nil)
	}
	if path == "" {
		return []string{}, nil
	}
	return a.ImportFiles(instance, []string{path})
}

// ResolveImport answers the decision an import waits for.
func (a *App) ResolveImport(operationID string, answer AnswerDTO) error {
	err := a.c.Library.Resolve(operation.ID(operationID), library.Answer{
		Choice: answer.Choice, Mod: mod.ID(answer.Mod), Label: answer.Label, Root: answer.Root,
	})
	if err != nil {
		return a.fail("resolve import", err, map[string]string{"operation": operationID})
	}
	return nil
}

// CancelImport cancels one item of the install queue.
func (a *App) CancelImport(operationID string) error {
	if err := a.c.Library.CancelQueued(a.context(), operation.ID(operationID)); err != nil {
		return a.fail("cancel import", err, map[string]string{"operation": operationID})
	}
	return nil
}

// InstallMods installs imported ("not installed") mods.
func (a *App) InstallMods(instance string, ids []string) ([]string, error) {
	ops, err := a.c.Library.InstallMods(a.context(), game.InstanceID(instance), modIDs(ids))
	if err != nil {
		return nil, a.fail("install mods", err, map[string]string{"instance": instance})
	}
	return opIDs(ops), nil
}

// ReinstallMods reinstalls mods from their retained archives.
func (a *App) ReinstallMods(instance string, ids []string) ([]string, error) {
	ops, err := a.c.Library.ReinstallMods(a.context(), game.InstanceID(instance), modIDs(ids))
	if err != nil {
		return nil, a.fail("reinstall mods", err, map[string]string{"instance": instance})
	}
	return opIDs(ops), nil
}

// PreviewModRemoval returns what DLG-07 shows before removing.
func (a *App) PreviewModRemoval(instance string, ids []string) (RemovalPreviewDTO, error) {
	p, err := a.c.Library.PreviewRemoval(a.context(), game.InstanceID(instance), modIDs(ids))
	if err != nil {
		return RemovalPreviewDTO{}, a.fail("preview removal", err, map[string]string{"instance": instance})
	}
	out := RemovalPreviewDTO{Mods: []DuplicateModDTO{}, OrphanRules: p.OrphanRules, SharedArchives: append([]string{}, p.SharedArchives...), Deployed: p.Deployed}
	for _, m := range p.Mods {
		out.Mods = append(out.Mods, DuplicateModDTO{ID: string(m.ID), Name: m.Name, Version: m.Version})
	}
	return out, nil
}

// RemoveMods removes mods (and optionally their archives) as one operation.
func (a *App) RemoveMods(instance string, ids []string, withArchives bool) (string, error) {
	id, err := a.c.Library.RemoveMods(a.context(), game.InstanceID(instance), modIDs(ids), withArchives)
	if err != nil {
		return string(id), a.fail("remove mods", err, map[string]string{"instance": instance, "count": strconv.Itoa(len(ids))})
	}
	return string(id), nil
}

// SetModAttributes saves the editable metadata of a mod.
func (a *App) SetModAttributes(id string, attrs ModAttributesDTO) error {
	err := a.c.Library.SetAttributes(a.context(), mod.ID(id), library.AttributesInput{
		Name: attrs.Name, Version: attrs.Version, Author: attrs.Author, Notes: attrs.Notes,
		HighlightColor: attrs.Highlight, Tags: attrs.Tags,
	})
	if err != nil {
		return a.fail("set mod attributes", err, map[string]string{"mod": id})
	}
	return nil
}

// SetModsCategory assigns a category ("" for none) to mods.
func (a *App) SetModsCategory(instance string, ids []string, category string) error {
	if err := a.c.Library.SetCategory(a.context(), game.InstanceID(instance), modIDs(ids), mod.CategoryID(category)); err != nil {
		return a.fail("set category", err, map[string]string{"category": category})
	}
	return nil
}

// SetModType changes the mod type of a mod (Advanced).
func (a *App) SetModType(id, modType string) error {
	if err := a.c.Library.SetModType(a.context(), mod.ID(id), game.ModTypeID(modType)); err != nil {
		return a.fail("set mod type", err, map[string]string{"mod": id, "type": modType})
	}
	return nil
}

// Categories returns the category tree of an instance.
func (a *App) Categories(instance string) ([]CategoryDTO, error) {
	cats, err := a.c.Library.CategoryList(a.context(), game.InstanceID(instance))
	if err != nil {
		return nil, a.fail("categories", err, map[string]string{"instance": instance})
	}
	out := make([]CategoryDTO, len(cats))
	for i, c := range cats {
		out[i] = CategoryDTO{ID: string(c.ID), Name: c.Name, Parent: string(c.Parent), Order: c.Order}
	}
	return out, nil
}

// SaveCategory creates (empty id) or updates a category and returns its id.
func (a *App) SaveCategory(instance string, c CategoryDTO) (string, error) {
	id, err := a.c.Library.SaveCategory(a.context(), game.InstanceID(instance), library.CategoryInput{
		ID: mod.CategoryID(c.ID), Name: c.Name, Parent: mod.CategoryID(c.Parent), Order: c.Order,
	})
	if err != nil {
		return "", a.fail("save category", err, map[string]string{"name": c.Name})
	}
	return string(id), nil
}

// DeleteCategory deletes a category and its children.
func (a *App) DeleteCategory(instance, id string) error {
	if err := a.c.Library.DeleteCategory(a.context(), game.InstanceID(instance), mod.CategoryID(id)); err != nil {
		return a.fail("delete category", err, map[string]string{"category": id})
	}
	return nil
}

// OpenModFolder shows the staging folder of a mod.
func (a *App) OpenModFolder(id string) error {
	path, err := a.c.Library.ModFolder(a.context(), mod.ID(id))
	if err == nil {
		err = a.c.OpenFolder(path)
	}
	if err != nil {
		return a.fail("open mod folder", err, map[string]string{"folder": "mod"})
	}
	return nil
}

// OpenModArchive shows the ArchiveStore folder of a mod's archive.
func (a *App) OpenModArchive(id string) error {
	path, err := a.c.Library.ArchiveFolder(a.context(), mod.ID(id))
	if err == nil {
		err = a.c.OpenFolder(path)
	}
	if err != nil {
		return a.fail("open archive folder", err, map[string]string{"folder": "archive"})
	}
	return nil
}
