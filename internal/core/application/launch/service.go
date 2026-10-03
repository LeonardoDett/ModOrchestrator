// Package launch is the application service of the Play button (core/11
// §6, core/04 §9, D045): the pre-launch check (DLG-26), the launch
// operation, which deploys first when the user (or auto-deploy) asks, and
// the watch of the game process that turns Play into "Em execução" and
// keeps deploy/purge blocked while the game runs (game_running).
//
// Nothing here is persisted as truth: the check is recalculated on every
// read from the deploy status and the diagnostics. The facts recorded are
// events (game.launched, game.running_changed) and the instance's last use.
package launch

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"slices"
	"strings"
	"sync"
	"time"

	"modorchestrator/internal/core/application/deployment"
	"modorchestrator/internal/core/application/diagnostics"
	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/deploystate"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/health"
	"modorchestrator/internal/core/domain/operation"
)

// Operation and events of this module.
const (
	KindLaunch                     = health.OperationLaunch
	StepCheck                      = "check"
	StepDeploy                     = "deploy"
	StepStart                      = "start"
	EventLaunched       event.Type = "game.launched"
	EventRunningChanged event.Type = "game.running_changed"
	subjectInstance                = "instance"
)

// Error codes (core/00 §6).
const (
	CodeUnavailable   = "launch_unavailable"
	CodeBlocked       = "launch_blocked"
	CodeNeedsConfirm  = "launch_needs_confirmation"
	CodeRunning       = "game_running"
	CodeBusy          = "instance_busy"
	CodeDeployFailed  = "launch_deploy_failed"
	CodeOptionUnknown = "launch_option_unknown"
	CodeStartFailed   = "launch_start_failed"
)

// Error is a failure with a stable code and parameters (D053).
type Error struct {
	code   string
	params map[string]string
	cause  error
}

func (e *Error) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("launch: %s: %v", e.code, e.cause)
	}
	return "launch: " + e.code
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

// State is the variation of the Play button and of DLG-26.
type State string

const (
	// StateReady: Play launches at once.
	StateReady State = "ready"
	// StateDeploy: a deploy is pending; Play deploys first (DLG-26 "Deploy
	// necessário", or directly when auto-deploy is on).
	StateDeploy State = "deploy"
	// StateWarnings: problems that do not block ("Jogar mesmo assim").
	StateWarnings State = "warnings"
	// StateBlocked: only the actions that solve the problem.
	StateBlocked State = "blocked"
	// StateRunning: the game runs ("Em execução").
	StateRunning State = "running"
	// StateBusy: an operation holds the instance (deploy, import...).
	StateBusy State = "busy"
	// StateUnavailable: no way to start the game (generic game without an
	// executable, adapter without launch).
	StateUnavailable State = "unavailable"
)

// Option is a launch option shown in the Play menu.
type Option struct {
	ID      string
	Exe     string
	Default bool
}

// Check is the pre-launch check of an instance (core/04 §9, DLG-26).
type Check struct {
	Instance game.InstanceID
	State    State
	Options  []Option
	// Deploy is the deployment status; DeployNeeded means Play deploys
	// first; AutoDeploy means it does so without asking (D045).
	Deploy       deploystate.Status
	DeployNeeded bool
	AutoDeploy   bool
	// DeployProblem: the status is blocked/failed/unknown (a warning with
	// "Jogar mesmo assim" unless a blocking diagnostic exists).
	DeployProblem bool
	Busy          string
	Running       []string
	// Blocking are the visible diagnostics that block launch; Warnings the
	// ones core/10 marks "launch (aviso)".
	Blocking []diagnostic.Diagnostic
	Warnings []diagnostic.Diagnostic
	// Unavailable is why there is no launch option.
	Unavailable string
}

// Deploy is the deploy engine as Play sees it.
type Deploy interface {
	Status(ctx context.Context, instance game.InstanceID) (deployment.StatusView, error)
	Deploy(ctx context.Context, instance game.InstanceID) (operation.ID, error)
}

// Diagnostics gives the visible problems of an instance.
type Diagnostics interface {
	Problems(ctx context.Context, instance game.InstanceID) (diagnostics.View, error)
}

// Games answers the game facts.
type Games interface {
	RunningProcesses(ctx context.Context, inst game.Instance) ([]string, error)
	AcknowledgeVersion(ctx context.Context, id game.InstanceID) error
	MarkUsed(ctx context.Context, id game.InstanceID) error
}

// Settings reads instance settings.
type Settings interface {
	InstanceValue(ctx context.Context, instance, key string) (appsettings.Effective, error)
}

// Deps are the ports of the service.
type Deps struct {
	Registry    *games.Registry
	Instances   ports.GameInstances
	FS          ports.FileReader
	Launcher    ports.ProcessLauncher
	Deploy      Deploy
	Diagnostics Diagnostics
	Games       Games
	Settings    Settings
	Ops         *operations.Service
	UoW         ports.UnitOfWork
	Publisher   operations.Publisher
	IDs         operations.IDGenerator
	Clock       operations.Clock
	// Poll is how often a launch waiting for its deploy reads the deploy
	// operation (default 200 ms).
	Poll time.Duration
}

// Service implements the launch use cases.
type Service struct {
	Deps
	mu      sync.Mutex
	running map[game.InstanceID]string
	stop    chan struct{}
	done    chan struct{}
	wg      sync.WaitGroup
}

// NewService wires the service.
func NewService(d Deps) *Service {
	if d.Poll == 0 {
		d.Poll = 200 * time.Millisecond
	}
	return &Service{Deps: d, running: map[game.InstanceID]string{}}
}

// options returns the launch options of an instance: the adapter's when it
// declares the launch capability, else the executable of a generic game.
func (s *Service) options(ctx context.Context, inst game.Instance) ([]ports.LaunchOption, string, error) {
	if a, ok := s.Registry.ByName(inst.Adapter); ok {
		if def, err := a.InstanceDefinition(inst.Game, inst.Targets); err == nil && def.Capabilities.Has(game.CapLaunch) {
			if ls, ok := a.(ports.LaunchSupport); ok {
				opts, err := ls.LaunchOptions(ctx, s.FS, inst)
				if err != nil {
					return nil, "", err
				}
				if len(opts) > 0 {
					return opts, "", nil
				}
			}
		}
	}
	if inst.Executable != "" {
		return []ports.LaunchOption{{ID: "game", Exe: inst.Executable, Default: true}}, "", nil
	}
	return nil, "no_executable", nil
}

// Check computes the pre-launch check.
func (s *Service) Check(ctx context.Context, instance game.InstanceID) (Check, error) {
	inst, err := s.Instances.Get(ctx, instance)
	if err != nil {
		return Check{}, err
	}
	c := Check{Instance: instance}
	opts, why, err := s.options(ctx, inst)
	if err != nil {
		return Check{}, err
	}
	for _, o := range opts {
		c.Options = append(c.Options, Option{ID: o.ID, Exe: o.Exe, Default: o.Default})
	}
	c.Unavailable = why
	st, err := s.Deploy.Status(ctx, instance)
	if err != nil {
		return Check{}, err
	}
	c.Deploy, c.Busy, c.Running = st.Status, st.Busy, st.Running
	switch st.Status.Kind {
	case deploystate.Pending, deploystate.NeverDeployed:
		c.DeployNeeded = true
	case deploystate.Blocked, deploystate.Failed, deploystate.Unknown:
		// game_running is shown as the running state, not as a problem.
		c.DeployProblem = st.Status.Reason != deploystate.ReasonGameRunning
	}
	if v, err := s.Settings.InstanceValue(ctx, string(instance), "automation.deployOnChange"); err == nil {
		c.AutoDeploy = v.Value == "true"
	}
	view, err := s.Diagnostics.Problems(ctx, instance)
	if err != nil {
		return Check{}, err
	}
	for _, it := range view.Items {
		switch {
		case it.BlocksOperation(KindLaunch):
			c.Blocking = append(c.Blocking, it.Diagnostic)
		case diagnostic.WarnsBeforeLaunch(it.Code):
			c.Warnings = append(c.Warnings, it.Diagnostic)
		}
	}
	switch {
	case len(c.Running) > 0:
		c.State = StateRunning
	case len(c.Options) == 0:
		c.State = StateUnavailable
	case len(c.Blocking) > 0:
		c.State = StateBlocked
	case c.Busy != "":
		c.State = StateBusy
	case c.DeployNeeded:
		c.State = StateDeploy
	case c.DeployProblem || len(c.Warnings) > 0:
		c.State = StateWarnings
	default:
		c.State = StateReady
	}
	return c, nil
}

// Request is what the user chose in DLG-26.
type Request struct {
	// Option is the launch option id ("" = default).
	Option string
	// Deploy deploys first when a deploy is pending ("Implantar e jogar").
	Deploy bool
	// Confirmed accepts the warnings ("Jogar mesmo assim") or skipping a
	// pending deploy ("Jogar sem implantar").
	Confirmed bool
}

// Launch starts the launch operation: check, deploy when asked (the deploy
// is its own operation, so a decision uses the usual dialog), start. A
// blocking problem, a running game or an unconfirmed warning refuses it.
func (s *Service) Launch(ctx context.Context, instance game.InstanceID, req Request) (operation.ID, error) {
	c, err := s.Check(ctx, instance)
	if err != nil {
		return "", err
	}
	if err := s.admit(c, req); err != nil {
		return "", err
	}
	opt, err := pick(c, req.Option)
	if err != nil {
		return "", err
	}
	deployFirst := c.DeployNeeded && (req.Deploy || (c.AutoDeploy && !req.Confirmed))
	t, err := s.Ops.Enqueue(ctx, operations.Spec{Kind: KindLaunch, Subject: event.EntityRef{Kind: subjectInstance, ID: string(instance)}, Steps: []string{StepCheck, StepDeploy, StepStart}})
	if err != nil {
		return "", err
	}
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		bg := context.WithoutCancel(ctx)
		_ = s.Ops.Execute(bg, t, func(ctx context.Context, t *operations.Tracker) error {
			return opError(s.run(ctx, t, instance, opt, deployFirst, req.Confirmed))
		})
	}()
	return t.ID(), nil
}

// admit applies DLG-26: blocked never launches; warnings and a pending
// deploy need the user's choice.
func (s *Service) admit(c Check, req Request) error {
	switch c.State {
	case StateUnavailable:
		return fail(CodeUnavailable, nil, "reason", c.Unavailable)
	case StateRunning:
		return fail(CodeRunning, nil, "processes", strings.Join(c.Running, ", "))
	case StateBlocked:
		return fail(CodeBlocked, nil, "code", string(c.Blocking[0].Code))
	case StateBusy:
		return fail(CodeBusy, nil, "holder", c.Busy)
	}
	if c.DeployNeeded && !req.Deploy && !req.Confirmed && !c.AutoDeploy {
		return fail(CodeNeedsConfirm, nil, "reason", "deploy")
	}
	if (c.DeployProblem || len(c.Warnings) > 0) && !req.Confirmed {
		return fail(CodeNeedsConfirm, nil, "reason", "warnings")
	}
	return nil
}

// opError keeps the code and parameters of a failure in the operation
// (INV-OPS-05).
func opError(err error) error {
	var e *Error
	if err == nil || !errors.As(err, &e) {
		return err
	}
	return &operation.Error{Code: e.code, Message: err.Error(), Params: maps.Clone(e.params)}
}

func pick(c Check, id string) (Option, error) {
	for _, o := range c.Options {
		if (id == "" && o.Default) || (id != "" && o.ID == id) {
			return o, nil
		}
	}
	return Option{}, fail(CodeOptionUnknown, nil, "option", id)
}

func (s *Service) run(ctx context.Context, t *operations.Tracker, instance game.InstanceID, opt Option, deployFirst, confirmed bool) error {
	if err := t.BeginStep(ctx, StepCheck); err != nil {
		return err
	}
	if err := t.CompleteStep(ctx, StepCheck); err != nil {
		return err
	}
	if deployFirst {
		if err := t.BeginStep(ctx, StepDeploy); err != nil {
			return err
		}
		if err := s.deployAndWait(ctx, instance); err != nil {
			return err
		}
		if err := t.CompleteStep(ctx, StepDeploy); err != nil {
			return err
		}
		// What the deploy changed is checked again: a problem that now
		// blocks launch stops here; warnings were accepted or are shown
		// only when the user had not confirmed.
		c, err := s.Check(ctx, instance)
		if err != nil {
			return err
		}
		if len(c.Blocking) > 0 {
			return fail(CodeBlocked, nil, "code", string(c.Blocking[0].Code))
		}
		if len(c.Running) > 0 {
			return fail(CodeRunning, nil, "processes", strings.Join(c.Running, ", "))
		}
		if !confirmed && (c.DeployProblem || len(c.Warnings) > 0) {
			return fail(CodeNeedsConfirm, nil, "reason", "warnings")
		}
	} else if err := t.SkipStep(ctx, StepDeploy); err != nil {
		return err
	}
	if err := t.BeginStep(ctx, StepStart); err != nil {
		return err
	}
	inst, err := s.Instances.Get(ctx, instance)
	if err != nil {
		return err
	}
	exe := game.JoinPath(inst.Root, strings.ReplaceAll(opt.Exe, "/", `\`))
	var args []string
	work := inst.Root
	if a, ok := s.Registry.ByName(inst.Adapter); ok {
		if ls, ok := a.(ports.LaunchSupport); ok {
			if opts, err := ls.LaunchOptions(ctx, s.FS, inst); err == nil {
				for _, o := range opts {
					if o.ID == opt.ID {
						args = o.Args
						if o.WorkDir != "" {
							work = game.JoinPath(inst.Root, o.WorkDir)
						}
					}
				}
			}
		}
	}
	if err := s.Launcher.Start(ctx, exe, args, work); err != nil {
		return fail(CodeStartFailed, err, "exe", opt.Exe)
	}
	// The version seen at launch is the one game_version_changed compares
	// with (D084 item 5); the instance becomes the most recently used.
	_ = s.Games.AcknowledgeVersion(ctx, instance)
	_ = s.Games.MarkUsed(ctx, instance)
	if err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		tx.Emit(s.newEvent(EventLaunched, instance, t.ID(), map[string]string{"instance": string(instance), "option": opt.ID, "exe": opt.Exe}))
		return nil
	}); err != nil {
		return err
	}
	return t.CompleteStep(ctx, StepStart)
}

// deployAndWait starts a deploy and waits for its end. A deploy that stops
// for a decision waits for it in the usual dialog.
func (s *Service) deployAndWait(ctx context.Context, instance game.InstanceID) error {
	id, err := s.Deploy.Deploy(ctx, instance)
	if err != nil {
		return fail(CodeDeployFailed, err, "status", "refused")
	}
	tick := time.NewTicker(s.Poll)
	defer tick.Stop()
	for {
		op, err := s.Ops.Get(ctx, id)
		if err != nil {
			return err
		}
		if op.Status.IsTerminal() {
			if op.Status != operation.StatusSucceeded {
				return fail(CodeDeployFailed, nil, "status", string(op.Status), "operation", string(id))
			}
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-tick.C:
		}
	}
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

func (s *Service) newEvent(t event.Type, instance game.InstanceID, op operation.ID, payload map[string]string) event.Event {
	return event.Event{ID: s.IDs.NewID(), Type: t, OccurredAt: s.Clock.Now(), OperationID: string(op), Subject: event.EntityRef{Kind: subjectInstance, ID: string(instance)}, Payload: payload}
}

// Watch compares the running processes of every instance with the last
// look and records a game.running_changed event on each transition, so the
// diagnostics, the deploy status and Play are read again (D021).
func (s *Service) Watch(ctx context.Context) error {
	list, err := s.Instances.List(ctx)
	if err != nil {
		return err
	}
	var errs []error
	for _, inst := range list {
		procs, err := s.Games.RunningProcesses(ctx, inst)
		if err != nil {
			errs = append(errs, err)
			continue
		}
		slices.Sort(procs)
		now := strings.Join(procs, ",")
		s.mu.Lock()
		before, seen := s.running[inst.ID]
		s.running[inst.ID] = now
		s.mu.Unlock()
		if !seen && now == "" || before == now {
			continue
		}
		running := now != ""
		if err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
			tx.Emit(s.newEvent(EventRunningChanged, inst.ID, "", map[string]string{"instance": string(inst.ID), "running": fmt.Sprint(running), "processes": now}))
			return nil
		}); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// StartMonitor runs Watch every interval until Close.
func (s *Service) StartMonitor(interval time.Duration) {
	s.stop, s.done = make(chan struct{}), make(chan struct{})
	go func() {
		defer close(s.done)
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-s.stop:
				return
			case <-t.C:
				_ = s.Watch(context.Background())
			}
		}
	}()
}

// Close stops the monitor and waits for launches in flight.
func (s *Service) Close() {
	if s.stop != nil {
		close(s.stop)
		<-s.done
		s.stop = nil
	}
	s.wg.Wait()
}

// Wait waits for launches in flight (tests).
func (s *Service) Wait() { s.wg.Wait() }
