// Package tools is the tools feature module (core/15 "Ferramentas
// externas", capability `tools`, D146): the registry of the external tools
// of an instance, the suggestions of the tools the adapter knows, and the
// start of a tool through the launch service, followed by a scan of what
// the tool changed in the game (core/09), offered for capture.
//
// What a tool is called and where it usually lives are the adapter's
// (ports.ToolSupport); the module never names a tool. A game without the
// capability (or with the feature turned off) gets nothing: every command
// answers tools_unsupported.
package tools

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"path"
	"strconv"
	"strings"
	"time"

	"modorchestrator/internal/core/application/deployment"
	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/instancelock"
	"modorchestrator/internal/core/application/launch"
	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/tool"
)

// Error codes (core/00 §6, INV-OPS-05).
const (
	CodeUnsupported       = "tools_unsupported"
	CodeInstanceNotFound  = "instance_not_found"
	CodeNotFound          = "tool_not_found"
	CodeInvalid           = "tool_invalid"
	CodeKnownUnknown      = "tool_known_unknown"
	CodeNotDetected       = "tool_not_detected"
	CodeExecutableMissing = "tool_executable_missing"
	CodeFolderMissing     = "tool_folder_missing"
)

// Events of the registry.
const (
	EventSaved     event.Type = "tool.saved"
	EventDeleted   event.Type = "tool.deleted"
	EventReordered event.Type = "tool.reordered"
)

const subjectInstance = "instance"

// IconSize is the size of the icon read for a tool (the list and the menu
// show it at 16 to 32 px).
const IconSize = 32

// Error is a coded error of the module.
type Error struct {
	code   string
	cause  error
	params map[string]string
}

func (e *Error) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("tools: %s: %v", e.code, e.cause)
	}
	return "tools: " + e.code
}

func (e *Error) Unwrap() error             { return e.cause }
func (e *Error) Code() string              { return e.code }
func (e *Error) Params() map[string]string { return maps.Clone(e.params) }

func fail(code string, cause error, kv ...string) *Error {
	e := &Error{code: code, cause: cause, params: map[string]string{}}
	for i := 0; i+1 < len(kv); i += 2 {
		e.params[kv[i]] = kv[i+1]
	}
	return e
}

// Launcher is the launch service as the module sees it.
type Launcher interface {
	RunTool(ctx context.Context, instance game.InstanceID, run launch.ToolRun) (operation.ID, error)
	RunningTools(instance game.InstanceID) []launch.RunningTool
}

// Scanner is the deploy engine's look at the game (Verificar implantação).
type Scanner interface {
	Verify(ctx context.Context, instance game.InstanceID) (deployment.ChangesView, error)
}

// Deps are the ports the module needs.
type Deps struct {
	Registry  *games.Registry
	Instances ports.GameInstances
	Profiles  ports.Profiles
	Tools     ports.Tools
	UoW       ports.UnitOfWork
	Publisher operations.Publisher
	FS        ports.FileReader
	Icons     ports.ExecutableIcons
	Launch    Launcher
	Scanner   Scanner
	Locks     *instancelock.Locks
	IDs       operations.IDGenerator
	Clock     operations.Clock
}

// Service implements the tool use cases.
type Service struct{ Deps }

// NewService wires the module.
func NewService(d Deps) *Service { return &Service{Deps: d} }

type support struct {
	inst  game.Instance
	known []tool.Known
	vars  map[string]string
	ctx   tool.Context
}

// support resolves an instance with the tools feature in effect.
func (s *Service) support(ctx context.Context, instance game.InstanceID) (*support, error) {
	inst, err := s.Instances.Get(ctx, instance)
	if errors.Is(err, ports.ErrNotFound) {
		return nil, fail(CodeInstanceNotFound, err, "instance", string(instance))
	}
	if err != nil {
		return nil, err
	}
	adapter, ok := s.Registry.ByName(inst.Adapter)
	if !ok {
		return nil, fail(CodeUnsupported, nil, "game", string(inst.Game))
	}
	def, err := ports.InstanceDefinition(adapter, inst)
	if err != nil {
		return nil, err
	}
	ts, ok := adapter.(ports.ToolSupport)
	if !ok || !def.Capabilities.Has(game.CapTools) {
		return nil, fail(CodeUnsupported, nil, "game", string(inst.Game))
	}
	sp := &support{inst: inst}
	for _, k := range ts.KnownTools(inst.Game) {
		if k.Valid() {
			sp.known = append(sp.known, k)
		}
	}
	sp.ctx = tool.Context{Instance: inst}
	if id, err := s.Profiles.Active(ctx, instance); err == nil {
		sp.ctx.Profile = string(id)
		if p, err := s.Profiles.Get(ctx, id); err == nil {
			sp.ctx.ProfileName = p.Name()
		}
	}
	sp.vars = tool.VariablesOf(sp.ctx)
	return sp, nil
}

// Supported reports whether the instance has the tools feature in effect.
func (s *Service) Supported(ctx context.Context, instance game.InstanceID) bool {
	_, err := s.support(ctx, instance)
	return err == nil
}

// Entry is one registered tool as the screen shows it.
type Entry struct {
	Tool    tool.Tool
	Running bool
	// Started is when the running tool started (zero when it does not run).
	Started time.Time
	// Exe is the executable with the variables expanded ("" when they do
	// not expand any more, e.g. a target was removed).
	Exe string
	// Problem says why the tool cannot start now: "" (it can),
	// CodeExecutableMissing or CodeInvalid.
	Problem string
}

// Suggestion is a tool the adapter knows that is not registered yet.
type Suggestion struct {
	Known tool.Known
	// Found is the executable found in the game folder, as a path with the
	// {game} variable; "" when the user has to locate it.
	Found string
}

// Variable is one variable the fields of a tool may use, with its value
// for this instance.
type Variable struct {
	Name  string
	Value string
}

// View is the Tools screen of an instance.
type View struct {
	Instance game.InstanceID
	// Blocker is the name of the exclusive tool that runs now: while it
	// runs, the others cannot start (the instance is busy).
	Blocker     string
	Tools       []Entry
	Suggestions []Suggestion
	Variables   []Variable
}

// List returns the tools of an instance, the suggestions and the
// variables.
func (s *Service) List(ctx context.Context, instance game.InstanceID) (View, error) {
	sp, err := s.support(ctx, instance)
	if err != nil {
		return View{}, err
	}
	list, err := s.Tools.List(ctx, instance)
	if err != nil {
		return View{}, err
	}
	tool.Sort(list)
	running := map[string]launch.RunningTool{}
	v := View{Instance: instance}
	for _, r := range s.Launch.RunningTools(instance) {
		running[r.Tool] = r
		if r.Exclusive && v.Blocker == "" {
			v.Blocker = r.Name
		}
	}
	registered := map[string]bool{}
	for _, t := range list {
		r, on := running[string(t.ID)]
		e := Entry{Tool: t, Running: on, Started: r.Started}
		if t.Known != "" {
			registered[t.Known] = true
		}
		if err := t.Validate(sp.vars); err != nil {
			e.Problem = CodeInvalid
		} else if exe, _ := tool.Expand(t.Exe, sp.vars); exe != "" {
			e.Exe = exe
			if info, err := s.FS.Stat(ctx, exe); err != nil || !info.Exists || info.IsDir {
				e.Problem = CodeExecutableMissing
			}
		}
		v.Tools = append(v.Tools, e)
	}
	for _, k := range sp.known {
		if registered[k.ID] {
			continue
		}
		v.Suggestions = append(v.Suggestions, Suggestion{Known: k, Found: s.detect(ctx, sp, k)})
	}
	for _, n := range tool.Names(sp.ctx) {
		v.Variables = append(v.Variables, Variable{Name: n, Value: sp.vars[n]})
	}
	return v, nil
}

// detect looks for a known tool in the folders the adapter declares, below
// the game root.
func (s *Service) detect(ctx context.Context, sp *support, k tool.Known) string {
	for _, dir := range k.Paths {
		for _, e := range k.Executables {
			p := game.JoinPath(sp.inst.Root, dir, e.File)
			if info, err := s.FS.Stat(ctx, p); err == nil && info.Exists && !info.IsDir {
				return game.JoinPath("{"+tool.VarGame+"}", dir, e.File)
			}
		}
	}
	return ""
}

// Input is a tool as the edit form sends it. ID "" creates a tool.
type Input struct {
	ID           tool.ID
	Name         string
	Known        string
	Exe          string
	Args         string
	WorkDir      string
	Env          []tool.EnvVar
	Icon         string
	Exclusive    bool
	DeployBefore bool
}

// Save creates or updates a tool.
func (s *Service) Save(ctx context.Context, instance game.InstanceID, in Input) (tool.ID, error) {
	sp, err := s.support(ctx, instance)
	if err != nil {
		return "", err
	}
	t := tool.Tool{
		ID: in.ID, Instance: instance, Name: in.Name, Known: in.Known, Exe: in.Exe, Args: in.Args, WorkDir: in.WorkDir,
		Env: append([]tool.EnvVar(nil), in.Env...), Icon: in.Icon, Exclusive: in.Exclusive, DeployBefore: in.DeployBefore,
	}
	t.Normalize()
	if err := t.Validate(sp.vars); err != nil {
		var e *tool.Error
		if errors.As(err, &e) {
			return "", fail(CodeInvalid, err, "reason", e.Reason, "detail", e.Detail)
		}
		return "", err
	}
	if t.Known != "" && !knows(sp, t.Known) {
		// A known id the adapter dropped is kept as a plain tool.
		t.Known = ""
	}
	return s.store(ctx, instance, t)
}

func knows(sp *support, id string) bool {
	for _, k := range sp.known {
		if k.ID == id {
			return true
		}
	}
	return false
}

func (s *Service) store(ctx context.Context, instance game.InstanceID, t tool.Tool) (tool.ID, error) {
	created := t.ID == ""
	err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		list, err := tx.Tools().List(ctx, instance)
		if err != nil {
			return err
		}
		if created {
			t.ID = tool.ID(s.IDs.NewID())
			t.Position = len(list)
		} else {
			found := false
			for _, old := range list {
				if old.ID == t.ID {
					found, t.Position = true, old.Position
				}
			}
			if !found {
				return fail(CodeNotFound, nil, "tool", string(t.ID))
			}
		}
		if err := tx.Tools().Save(ctx, t); err != nil {
			return err
		}
		tx.Emit(s.newEvent(EventSaved, instance, map[string]string{
			"instance": string(instance), "tool": string(t.ID), "name": t.Name, "created": strconv.FormatBool(created),
		}))
		return nil
	})
	return t.ID, err
}

// AddKnown registers a tool the adapter knows, with its defaults. exe is
// the executable the user located; "" uses the one found in the game
// folder.
func (s *Service) AddKnown(ctx context.Context, instance game.InstanceID, known, exe string) (tool.ID, error) {
	sp, err := s.support(ctx, instance)
	if err != nil {
		return "", err
	}
	var k tool.Known
	for _, c := range sp.known {
		if c.ID == known {
			k = c
		}
	}
	if k.ID == "" {
		return "", fail(CodeKnownUnknown, nil, "known", known)
	}
	if exe = strings.TrimSpace(exe); exe == "" {
		if exe = s.detect(ctx, sp, k); exe == "" {
			return "", fail(CodeNotDetected, nil, "known", known)
		}
	}
	args := ""
	if e, ok := k.Match(exe); ok {
		args = e.Args
	}
	return s.Save(ctx, instance, Input{Name: k.Name, Known: k.ID, Exe: exe, Args: args, Exclusive: k.Exclusive, DeployBefore: k.DeployBefore})
}

// Delete removes a tool from the registry. A running tool keeps running.
func (s *Service) Delete(ctx context.Context, instance game.InstanceID, id tool.ID) error {
	if _, err := s.support(ctx, instance); err != nil {
		return err
	}
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		list, err := tx.Tools().List(ctx, instance)
		if err != nil {
			return err
		}
		tool.Sort(list)
		var name string
		rest := list[:0:0]
		for _, t := range list {
			if t.ID == id {
				name = t.Name
				continue
			}
			rest = append(rest, t)
		}
		if err := tx.Tools().Delete(ctx, instance, id); errors.Is(err, ports.ErrNotFound) {
			return fail(CodeNotFound, err, "tool", string(id))
		} else if err != nil {
			return err
		}
		if err := renumber(ctx, tx, rest); err != nil {
			return err
		}
		tx.Emit(s.newEvent(EventDeleted, instance, map[string]string{"instance": string(instance), "tool": string(id), "name": name}))
		return nil
	})
}

// Move puts a tool at a position of the list (0 = first).
func (s *Service) Move(ctx context.Context, instance game.InstanceID, id tool.ID, position int) error {
	if _, err := s.support(ctx, instance); err != nil {
		return err
	}
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		list, err := tx.Tools().List(ctx, instance)
		if err != nil {
			return err
		}
		tool.Sort(list)
		from := -1
		for i, t := range list {
			if t.ID == id {
				from = i
			}
		}
		if from < 0 {
			return fail(CodeNotFound, nil, "tool", string(id))
		}
		position = max(0, min(position, len(list)-1))
		moved := list[from]
		list = append(list[:from], list[from+1:]...)
		list = append(list[:position], append([]tool.Tool{moved}, list[position:]...)...)
		if err := renumber(ctx, tx, list); err != nil {
			return err
		}
		tx.Emit(s.newEvent(EventReordered, instance, map[string]string{"instance": string(instance), "tool": string(id), "position": strconv.Itoa(position)}))
		return nil
	})
}

func renumber(ctx context.Context, tx ports.Tx, list []tool.Tool) error {
	for i, t := range list {
		if t.Position == i {
			continue
		}
		t.Position = i
		if err := tx.Tools().Save(ctx, t); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) find(ctx context.Context, instance game.InstanceID, id tool.ID) (tool.Tool, error) {
	list, err := s.Tools.List(ctx, instance)
	if err != nil {
		return tool.Tool{}, err
	}
	for _, t := range list {
		if t.ID == id {
			return t, nil
		}
	}
	return tool.Tool{}, fail(CodeNotFound, nil, "tool", string(id))
}

// Run starts a tool (the title bar menu, the Tools screen): the variables
// are expanded for the active profile, the executable and the folder must
// exist, and the launch service deploys first when the tool asks for it.
func (s *Service) Run(ctx context.Context, instance game.InstanceID, id tool.ID) (operation.ID, error) {
	sp, err := s.support(ctx, instance)
	if err != nil {
		return "", err
	}
	t, err := s.find(ctx, instance, id)
	if err != nil {
		return "", err
	}
	if err := t.Validate(sp.vars); err != nil {
		var e *tool.Error
		if errors.As(err, &e) {
			return "", fail(CodeInvalid, err, "reason", e.Reason, "detail", e.Detail)
		}
		return "", err
	}
	run := launch.ToolRun{Tool: string(t.ID), Name: t.Name, Exclusive: t.Exclusive, DeployBefore: t.DeployBefore}
	run.Exe, _ = tool.Expand(t.Exe, sp.vars)
	run.Args, _ = tool.Expand(t.Args, sp.vars)
	run.WorkDir, _ = tool.Expand(t.WorkDir, sp.vars)
	if info, err := s.FS.Stat(ctx, run.Exe); err != nil || !info.Exists || info.IsDir {
		return "", fail(CodeExecutableMissing, err, "tool", string(t.ID), "path", run.Exe)
	}
	if run.WorkDir == "" {
		run.WorkDir = parentDir(run.Exe)
	}
	if info, err := s.FS.Stat(ctx, run.WorkDir); err != nil || !info.Exists || !info.IsDir {
		return "", fail(CodeFolderMissing, err, "tool", string(t.ID), "path", run.WorkDir)
	}
	for _, v := range t.Env {
		val, _ := tool.Expand(v.Value, sp.vars)
		run.Env = append(run.Env, v.Name+"="+val)
	}
	return s.Launch.RunTool(ctx, instance, run)
}

func parentDir(p string) string {
	d := path.Dir(strings.ReplaceAll(p, `\`, "/"))
	return strings.ReplaceAll(d, "/", `\`)
}

// Icon returns the icon of a tool as PNG: the image the user chose, or the
// executable's own.
func (s *Service) Icon(ctx context.Context, instance game.InstanceID, id tool.ID) ([]byte, error) {
	sp, err := s.support(ctx, instance)
	if err != nil {
		return nil, err
	}
	t, err := s.find(ctx, instance, id)
	if err != nil {
		return nil, err
	}
	src := t.Icon
	if src == "" {
		src = t.Exe
	}
	p, err := tool.Expand(src, sp.vars)
	if err != nil || s.Icons == nil {
		return nil, ports.ErrNotFound
	}
	return s.Icons.Icon(ctx, p, IconSize)
}

// AfterTool is the scan made when a tool ends (launch.ToolOutputs, core/09
// §3): every deployed file and the folders around them and the tool
// outputs the adapter declares. A busy instance is left to its operation.
func (s *Service) AfterTool(ctx context.Context, instance game.InstanceID) (int, int, bool, error) {
	if s.Locks != nil {
		if _, busy := s.Locks.Holder(instance); busy {
			return 0, 0, false, nil
		}
	}
	v, err := s.Scanner.Verify(ctx, instance)
	if err != nil {
		return 0, 0, false, err
	}
	return v.ChangeCount, v.NewFileCount, true, nil
}

func (s *Service) commit(ctx context.Context, fn func(ctx context.Context, tx ports.Tx) error) error {
	stored, err := s.UoW.Do(ctx, fn)
	if err != nil {
		return err
	}
	if len(stored) > 0 {
		s.Publisher.Publish(stored...)
	}
	return nil
}

func (s *Service) newEvent(t event.Type, instance game.InstanceID, payload map[string]string) event.Event {
	return event.Event{ID: s.IDs.NewID(), Type: t, OccurredAt: s.Clock.Now(), Subject: event.EntityRef{Kind: subjectInstance, ID: string(instance)}, Payload: payload}
}
