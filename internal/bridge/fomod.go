package bridge

import (
	"encoding/base64"

	"modorchestrator/internal/core/application/library"
	"modorchestrator/internal/core/domain/fomod"
	"modorchestrator/internal/core/domain/installer"
	"modorchestrator/internal/core/domain/operation"
)

// FOMOD wizard bridge (DLG-06). The UI sends the groups the user visited
// and shows what the backend evaluates; it never evaluates conditions
// (anti-pattern 1).

type FomodSelectionDTO struct {
	Step    int   `json:"step"`
	Group   int   `json:"group"`
	Options []int `json:"options"`
}

type FomodWarningDTO struct {
	Code   string            `json:"code"`
	Params map[string]string `json:"params"`
}

type FomodDecisionDTO struct {
	Module   string              `json:"module"`
	HasImage bool                `json:"hasImage"`
	Previous []FomodSelectionDTO `json:"previous"`
	Warnings []FomodWarningDTO   `json:"warnings"`
}

type FomodOptionDTO struct {
	Index       int    `json:"index"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Image       string `json:"image,omitempty"`
	Type        string `json:"type"`
	Selected    bool   `json:"selected"`
	Locked      bool   `json:"locked"`
	Disabled    bool   `json:"disabled"`
}

type FomodGroupDTO struct {
	Index   int              `json:"index"`
	Name    string           `json:"name"`
	Type    string           `json:"type"`
	Options []FomodOptionDTO `json:"options"`
	Problem string           `json:"problem,omitempty"`
}

type FomodStepDTO struct {
	Index   int             `json:"index"`
	Name    string          `json:"name"`
	Visible bool            `json:"visible"`
	Groups  []FomodGroupDTO `json:"groups"`
}

type FomodFolderDTO struct {
	Folder string `json:"folder"`
	Files  int    `json:"files"`
}

type FomodRequirementDTO struct {
	File    string `json:"file"`
	Mod     string `json:"mod,omitempty"`
	ModName string `json:"modName,omitempty"`
}

type FomodSummaryDTO struct {
	Files        int                   `json:"files"`
	Size         int64                 `json:"size"`
	Folders      []FomodFolderDTO      `json:"folders"`
	Warnings     []FomodWarningDTO     `json:"warnings"`
	Requirements []FomodRequirementDTO `json:"requirements"`
}

type FomodViewDTO struct {
	Steps     []FomodStepDTO      `json:"steps"`
	Selection []FomodSelectionDTO `json:"selection"`
	Problems  []FomodSelectionDTO `json:"problems"`
	Summary   *FomodSummaryDTO    `json:"summary,omitempty"`
	PlanError string              `json:"planError,omitempty"`
}

func toFomodWarnings(ws []installer.Warning) []FomodWarningDTO {
	out := make([]FomodWarningDTO, 0, len(ws))
	for _, w := range ws {
		p := map[string]string{}
		for k, v := range w.Params {
			p[k] = v
		}
		out = append(out, FomodWarningDTO{Code: w.Code, Params: p})
	}
	return out
}

func toFomodSelection(cs []fomod.Choice) []FomodSelectionDTO {
	out := make([]FomodSelectionDTO, 0, len(cs))
	for _, c := range cs {
		out = append(out, FomodSelectionDTO{Step: c.Step, Group: c.Group, Options: append([]int{}, c.Options...)})
	}
	return out
}

func fromFomodSelection(list []FomodSelectionDTO) fomod.Selection {
	sel := fomod.Selection{}
	for _, s := range list {
		sel[fomod.GroupKey{Step: s.Step, Group: s.Group}] = append([]int{}, s.Options...)
	}
	return sel
}

func toFomodDecisionDTO(d *library.FomodDecision) *FomodDecisionDTO {
	if d == nil {
		return nil
	}
	return &FomodDecisionDTO{Module: d.Module, HasImage: d.HasImage, Previous: toFomodSelection(d.Previous), Warnings: toFomodWarnings(d.Warnings)}
}

func toFomodViewDTO(v library.FomodView) FomodViewDTO {
	out := FomodViewDTO{Steps: []FomodStepDTO{}, Selection: toFomodSelection(v.Selection), Problems: []FomodSelectionDTO{}, PlanError: v.PlanError}
	for _, s := range v.Steps {
		step := FomodStepDTO{Index: s.Index, Name: s.Name, Visible: s.Visible, Groups: []FomodGroupDTO{}}
		for _, g := range s.Groups {
			group := FomodGroupDTO{Index: g.Index, Name: g.Name, Type: string(g.Type), Problem: g.Problem, Options: []FomodOptionDTO{}}
			for _, o := range g.Options {
				group.Options = append(group.Options, FomodOptionDTO{
					Index: o.Index, Name: o.Name, Description: o.Description, Image: o.Image, Type: string(o.Type),
					Selected: o.Selected, Locked: o.Locked, Disabled: o.Disabled,
				})
			}
			step.Groups = append(step.Groups, group)
		}
		out.Steps = append(out.Steps, step)
	}
	for _, p := range v.Problems {
		out.Problems = append(out.Problems, FomodSelectionDTO{Step: p.Step, Group: p.Group, Options: []int{}})
	}
	if s := v.Summary; s != nil {
		sum := &FomodSummaryDTO{Files: s.Files, Size: s.Size, Folders: []FomodFolderDTO{}, Warnings: toFomodWarnings(s.Warnings), Requirements: []FomodRequirementDTO{}}
		for _, f := range s.Folders {
			sum.Folders = append(sum.Folders, FomodFolderDTO{Folder: f.Folder, Files: f.Files})
		}
		for _, r := range s.Requirements {
			sum.Requirements = append(sum.Requirements, FomodRequirementDTO{File: r.File, Mod: string(r.Mod), ModName: r.ModName})
		}
		out.Summary = sum
	}
	return out
}

// FomodState evaluates the wizard of a waiting import for the groups the
// user visited.
func (a *App) FomodState(operationID string, selection []FomodSelectionDTO) (FomodViewDTO, error) {
	v, err := a.c.Library.FomodState(a.context(), operation.ID(operationID), fromFomodSelection(selection))
	if err != nil {
		return FomodViewDTO{}, a.fail("fomod state", err, map[string]string{"operation": operationID})
	}
	return toFomodViewDTO(v), nil
}

// FomodImage returns an image of the installer as a data URL ("" for the
// module image): the UI never receives a file path (core/03 §7).
func (a *App) FomodImage(operationID, image string) (string, error) {
	img, err := a.c.Library.FomodImage(a.context(), operation.ID(operationID), image)
	if err != nil {
		return "", a.fail("fomod image", err, map[string]string{"operation": operationID})
	}
	return "data:" + img.Mime + ";base64," + base64.StdEncoding.EncodeToString(img.Data), nil
}
