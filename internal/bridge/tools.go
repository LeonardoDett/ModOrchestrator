package bridge

import (
	"encoding/base64"
	"errors"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/application/tools"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/tool"
)

// Tools bridge (capability `tools`, D146). Every method only translates
// between DTOs and the tools service; none decides anything.

type ToolEnvDTO struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type ToolDTO struct {
	ID           string       `json:"id"`
	Name         string       `json:"name"`
	Known        string       `json:"known"`
	Exe          string       `json:"exe"`
	Args         string       `json:"args"`
	WorkDir      string       `json:"workDir"`
	Env          []ToolEnvDTO `json:"env"`
	Icon         string       `json:"icon"`
	Exclusive    bool         `json:"exclusive"`
	DeployBefore bool         `json:"deployBefore"`
	Position     int          `json:"position"`
	// Running, ResolvedExe and Problem are read-only facts of the entry.
	Running     bool   `json:"running"`
	ResolvedExe string `json:"resolvedExe"`
	Problem     string `json:"problem"`
}

type KnownToolDTO struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Executables  []string `json:"executables"`
	Exclusive    bool     `json:"exclusive"`
	DeployBefore bool     `json:"deployBefore"`
	// Found is the executable found in the game folder ("" = locate).
	Found string `json:"found"`
}

type ToolVariableDTO struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type ToolsDTO struct {
	Instance    string            `json:"instance"`
	Tools       []ToolDTO         `json:"tools"`
	Suggestions []KnownToolDTO    `json:"suggestions"`
	Variables   []ToolVariableDTO `json:"variables"`
}

// ToolInputDTO is the edit form; id "" creates a tool.
type ToolInputDTO struct {
	ID           string       `json:"id"`
	Name         string       `json:"name"`
	Known        string       `json:"known"`
	Exe          string       `json:"exe"`
	Args         string       `json:"args"`
	WorkDir      string       `json:"workDir"`
	Env          []ToolEnvDTO `json:"env"`
	Icon         string       `json:"icon"`
	Exclusive    bool         `json:"exclusive"`
	DeployBefore bool         `json:"deployBefore"`
}

func toToolDTO(e tools.Entry) ToolDTO {
	t := e.Tool
	out := ToolDTO{
		ID: string(t.ID), Name: t.Name, Known: t.Known, Exe: t.Exe, Args: t.Args, WorkDir: t.WorkDir, Env: []ToolEnvDTO{},
		Icon: t.Icon, Exclusive: t.Exclusive, DeployBefore: t.DeployBefore, Position: t.Position,
		Running: e.Running, ResolvedExe: e.Exe, Problem: e.Problem,
	}
	for _, v := range t.Env {
		out.Env = append(out.Env, ToolEnvDTO{Name: v.Name, Value: v.Value})
	}
	return out
}

// Tools is the Tools screen of an instance: the registered tools, the
// suggestions of the adapter and the variables of the fields.
func (a *App) Tools(instance string) (ToolsDTO, error) {
	v, err := a.c.Tools.List(a.context(), game.InstanceID(instance))
	if err != nil {
		return ToolsDTO{}, a.fail("tools", err, map[string]string{"instance": instance})
	}
	out := ToolsDTO{Instance: instance, Tools: []ToolDTO{}, Suggestions: []KnownToolDTO{}, Variables: []ToolVariableDTO{}}
	for _, e := range v.Tools {
		out.Tools = append(out.Tools, toToolDTO(e))
	}
	for _, s := range v.Suggestions {
		k := KnownToolDTO{ID: s.Known.ID, Name: s.Known.Name, Exclusive: s.Known.Exclusive, DeployBefore: s.Known.DeployBefore, Found: s.Found, Executables: []string{}}
		for _, e := range s.Known.Executables {
			k.Executables = append(k.Executables, e.File)
		}
		out.Suggestions = append(out.Suggestions, k)
	}
	for _, x := range v.Variables {
		out.Variables = append(out.Variables, ToolVariableDTO{Name: x.Name, Value: x.Value})
	}
	return out, nil
}

// SaveTool creates or updates a tool and returns its id.
func (a *App) SaveTool(instance string, in ToolInputDTO) (string, error) {
	input := tools.Input{
		ID: tool.ID(in.ID), Name: in.Name, Known: in.Known, Exe: in.Exe, Args: in.Args, WorkDir: in.WorkDir,
		Icon: in.Icon, Exclusive: in.Exclusive, DeployBefore: in.DeployBefore,
	}
	for _, v := range in.Env {
		input.Env = append(input.Env, tool.EnvVar{Name: v.Name, Value: v.Value})
	}
	id, err := a.c.Tools.Save(a.context(), game.InstanceID(instance), input)
	if err != nil {
		return "", a.fail("save tool", err, map[string]string{"tool": in.ID})
	}
	return string(id), nil
}

// AddKnownTool registers a suggestion; exe "" uses the one found.
func (a *App) AddKnownTool(instance, known, exe string) (string, error) {
	id, err := a.c.Tools.AddKnown(a.context(), game.InstanceID(instance), known, exe)
	if err != nil {
		return "", a.fail("add known tool", err, map[string]string{"known": known})
	}
	return string(id), nil
}

// DeleteTool removes a tool from the list.
func (a *App) DeleteTool(instance, id string) error {
	if err := a.c.Tools.Delete(a.context(), game.InstanceID(instance), tool.ID(id)); err != nil {
		return a.fail("delete tool", err, map[string]string{"tool": id})
	}
	return nil
}

// MoveTool puts a tool at a position of the list (0 = first).
func (a *App) MoveTool(instance, id string, position int) error {
	if err := a.c.Tools.Move(a.context(), game.InstanceID(instance), tool.ID(id), position); err != nil {
		return a.fail("move tool", err, map[string]string{"tool": id})
	}
	return nil
}

// RunTool starts a tool and returns the launch_tool operation.
func (a *App) RunTool(instance, id string) (string, error) {
	op, err := a.c.Tools.Run(a.context(), game.InstanceID(instance), tool.ID(id))
	if err != nil {
		return "", a.fail("run tool", err, map[string]string{"tool": id})
	}
	return string(op), nil
}

// ToolIcon is the icon of a tool as a PNG data URL; "" when it has none.
func (a *App) ToolIcon(instance, id string) (string, error) {
	b, err := a.c.Tools.Icon(a.context(), game.InstanceID(instance), tool.ID(id))
	if errors.Is(err, ports.ErrNotFound) {
		return "", nil
	}
	if err != nil {
		return "", a.fail("tool icon", err, map[string]string{"tool": id})
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(b), nil
}

// PickToolExecutable asks for the executable of a tool; "" when the user
// cancels.
func (a *App) PickToolExecutable(title string) (string, error) {
	path, err := runtime.OpenFileDialog(a.context(), runtime.OpenDialogOptions{
		Title: title, Filters: []runtime.FileFilter{{DisplayName: "*.exe", Pattern: "*.exe"}},
	})
	if err != nil {
		return "", a.fail("pick tool executable", err, nil)
	}
	return path, nil
}

// PickToolIcon asks for an image for a tool (.ico, .exe, .png).
func (a *App) PickToolIcon(title string) (string, error) {
	path, err := runtime.OpenFileDialog(a.context(), runtime.OpenDialogOptions{
		Title: title, Filters: []runtime.FileFilter{{DisplayName: "*.ico; *.exe; *.png", Pattern: "*.ico;*.exe;*.png"}},
	})
	if err != nil {
		return "", a.fail("pick tool icon", err, nil)
	}
	return path, nil
}
