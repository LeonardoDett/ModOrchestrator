package bridge

import (
	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/domain/game"
)

// Games DTOs: transport only. Every label the user reads (reasons, finding
// kinds, methods) is a code the UI translates.

type TargetDTO struct {
	ID   string `json:"id"`
	Path string `json:"path"`
}

type TargetSpecDTO struct {
	ID   string `json:"id"`
	Path string `json:"path"`
}

type ModTypeDTO struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Target  string   `json:"target"`
	Methods []string `json:"methods,omitempty"`
}

type FindingDTO struct {
	Kind     string `json:"kind"`
	Target   string `json:"target,omitempty"`
	Name     string `json:"name"`
	Instance string `json:"instance,omitempty"`
}

type ProblemDTO struct {
	Code   string            `json:"code"`
	Params map[string]string `json:"params,omitempty"`
}

// ManagedGameDTO is a managed instance as the Games screen and the details
// popover show it.
type ManagedGameDTO struct {
	ID           string       `json:"id"`
	GameID       string       `json:"gameId"`
	GameName     string       `json:"gameName"`
	Custom       bool         `json:"custom"`
	Name         string       `json:"name"`
	Adapter      string       `json:"adapter"`
	Store        string       `json:"store"`
	Root         string       `json:"root"`
	Staging      string       `json:"staging"`
	ArchiveStore string       `json:"archiveStore"`
	BackupStore  string       `json:"backupStore"`
	Method       string       `json:"method"`
	Executable   string       `json:"executable,omitempty"`
	Version      string       `json:"version,omitempty"`
	Active       bool         `json:"active"`
	Hidden       bool         `json:"hidden"`
	Unavailable  bool         `json:"unavailable"`
	RootMissing  bool         `json:"rootMissing"`
	Deployed     bool         `json:"deployed"`
	Capabilities []string     `json:"capabilities"`
	Targets      []TargetDTO  `json:"targets"`
	ModTypes     []ModTypeDTO `json:"modTypes"`
	Foreign      []FindingDTO `json:"foreign"`
}

type DiscoveredGameDTO struct {
	GameID   string `json:"gameId"`
	GameName string `json:"gameName"`
	Root     string `json:"root"`
	Store    string `json:"store"`
	Version  string `json:"version,omitempty"`
	Hidden   bool   `json:"hidden"`
}

type SupportedGameDTO struct {
	GameID   string `json:"gameId"`
	GameName string `json:"gameName"`
	Hidden   bool   `json:"hidden"`
}

type GamesViewDTO struct {
	Managed     []ManagedGameDTO    `json:"managed"`
	Discovered  []DiscoveredGameDTO `json:"discovered"`
	Supported   []SupportedGameDTO  `json:"supported"`
	Scanned     bool                `json:"scanned"`
	HiddenCount int                 `json:"hiddenCount"`
}

// SetupDTO is what the "manage game" assistant sends back.
type SetupDTO struct {
	GameID       string          `json:"gameId"`
	Name         string          `json:"name"`
	Root         string          `json:"root"`
	Store        string          `json:"store"`
	Targets      []TargetSpecDTO `json:"targets"`
	Executable   string          `json:"executable"`
	Staging      string          `json:"staging"`
	ArchiveStore string          `json:"archiveStore"`
	BackupStore  string          `json:"backupStore"`
	Method       string          `json:"method"`
}

type FoldersDTO struct {
	Staging          string `json:"staging"`
	ArchiveStore     string `json:"archiveStore"`
	BackupStore      string `json:"backupStore"`
	SuggestedStaging string `json:"suggestedStaging,omitempty"`
}

type MethodStatusDTO struct {
	Method    string `json:"method"`
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"`
}

type VerificationDTO struct {
	Name         string            `json:"name"`
	Root         string            `json:"root"`
	Version      string            `json:"version,omitempty"`
	Targets      []TargetDTO       `json:"targets"`
	Staging      string            `json:"staging"`
	ArchiveStore string            `json:"archiveStore"`
	BackupStore  string            `json:"backupStore"`
	Methods      []MethodStatusDTO `json:"methods"`
	Foreign      []FindingDTO      `json:"foreign"`
	Problems     []ProblemDTO      `json:"problems"`
	Warnings     []ProblemDTO      `json:"warnings"`
}

type RootCheckDTO struct {
	Root    string      `json:"root"`
	Version string      `json:"version,omitempty"`
	Problem *ProblemDTO `json:"problem,omitempty"`
}

type ManageResultDTO struct {
	InstanceID  string `json:"instanceId"`
	OperationID string `json:"operationId"`
}

type UnmanageOptionsDTO struct {
	DeleteFiles bool   `json:"deleteFiles"`
	ConfirmName string `json:"confirmName"`
}

type InstanceRefDTO struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	GameName string `json:"gameName"`
}

// WorkspaceDTO is the navigation of the shell: the active instance, the
// instances to switch to and the workspace screens the active game offers.
// The UI does not decide which screens exist (anti-pattern 1).
type WorkspaceDTO struct {
	Active    *InstanceRefDTO  `json:"active,omitempty"`
	Instances []InstanceRefDTO `json:"instances"`
	Items     []string         `json:"items"`
}

func toManagedDTO(m games.Managed) ManagedGameDTO {
	i := m.Instance
	dto := ManagedGameDTO{
		ID: string(i.ID), GameID: string(i.Game), GameName: m.Definition.Name, Custom: m.Definition.CustomTargets,
		Name: i.DisplayName, Adapter: i.Adapter, Store: i.Store, Root: i.Root, Staging: i.Staging,
		ArchiveStore: i.ArchiveStore, BackupStore: i.BackupStore, Method: string(i.PreferredMethod),
		Executable: i.Executable, Version: m.Version, Active: m.Active, Hidden: i.Hidden,
		Unavailable: m.Unavailable, RootMissing: m.RootMissing, Deployed: m.Deployed,
		Capabilities: []string{}, Targets: []TargetDTO{}, ModTypes: []ModTypeDTO{}, Foreign: []FindingDTO{},
	}
	for _, c := range m.Definition.Capabilities.List() {
		dto.Capabilities = append(dto.Capabilities, string(c))
	}
	for _, t := range i.Targets {
		dto.Targets = append(dto.Targets, TargetDTO{ID: string(t.ID), Path: t.Path})
	}
	for _, t := range m.Definition.ModTypes {
		mt := ModTypeDTO{ID: string(t.ID), Name: t.Name, Target: string(t.Target)}
		for _, method := range t.Methods {
			mt.Methods = append(mt.Methods, string(method))
		}
		dto.ModTypes = append(dto.ModTypes, mt)
	}
	dto.Foreign = toFindingDTOs(m.Foreign)
	return dto
}

func toFindingDTOs(in []games.Finding) []FindingDTO {
	out := make([]FindingDTO, 0, len(in))
	for _, f := range in {
		out = append(out, FindingDTO{Kind: string(f.Kind), Target: string(f.Target), Name: f.Name, Instance: string(f.Instance)})
	}
	return out
}

func toProblemDTOs(in []games.Problem) []ProblemDTO {
	out := make([]ProblemDTO, 0, len(in))
	for _, p := range in {
		out = append(out, ProblemDTO{Code: p.Code, Params: p.Params})
	}
	return out
}

func toSetup(d SetupDTO) games.Setup {
	su := games.Setup{
		Game: game.ID(d.GameID), Name: d.Name, Root: d.Root, Store: d.Store, Executable: d.Executable,
		Folders: games.Folders{Staging: d.Staging, ArchiveStore: d.ArchiveStore, BackupStore: d.BackupStore},
		Method:  game.DeploymentMethod(d.Method),
	}
	for _, t := range d.Targets {
		su.Targets = append(su.Targets, game.TargetSpec{ID: game.TargetID(t.ID), Path: t.Path})
	}
	return su
}

func toVerificationDTO(v games.Verification) VerificationDTO {
	dto := VerificationDTO{
		Name: v.Name, Root: v.Root, Version: v.Version,
		Staging: v.Folders.Staging, ArchiveStore: v.Folders.ArchiveStore, BackupStore: v.Folders.BackupStore,
		Targets: []TargetDTO{}, Methods: []MethodStatusDTO{},
		Foreign: toFindingDTOs(v.Foreign), Problems: toProblemDTOs(v.Problems), Warnings: toProblemDTOs(v.Warnings),
	}
	for _, t := range v.Targets {
		dto.Targets = append(dto.Targets, TargetDTO{ID: string(t.ID), Path: t.Path})
	}
	for _, m := range v.Methods {
		dto.Methods = append(dto.Methods, MethodStatusDTO{Method: string(m.Method), Available: m.Available, Reason: m.Reason})
	}
	return dto
}
