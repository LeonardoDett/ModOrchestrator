package launch

import (
	"context"
	"errors"
	"slices"
	"strconv"
	"time"

	"modorchestrator/internal/core/application/instancelock"
	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/operation"
)

// External tools (core/15 "Ferramentas externas", D146) start through the
// same service as Play: the same deploy before starting, the same refusal
// while an operation holds the instance, and one place for what LV6 adds
// (elevation, missing executable). Unlike Play, a blocking problem does not
// stop a tool: the tool is often what fixes it (xEdit cleaning a plugin).
const (
	KindTool                        = operation.Kind("launch_tool")
	EventToolLaunched    event.Type = "tool.launched"
	EventToolExited      event.Type = "tool.exited"
	CodeToolRunning                 = "tool_running"
	CodeToolStartFailed             = "tool_start_failed"
	CodeToolDeployFailed            = "tool_deploy_failed"
	// HolderTool is the holder of the instance lock while an exclusive
	// tool runs (instance_busy names it).
	HolderTool = "tool"
)

// ToolRun is a tool ready to start: the variables are already expanded.
type ToolRun struct {
	// Tool is the id of the tool in the registry; Name is shown in events.
	Tool         string
	Name         string
	Exe          string
	Args         string
	WorkDir      string
	Env          []string
	Exclusive    bool
	DeployBefore bool
}

// RunningTool is a tool started from the app that has not ended.
type RunningTool struct {
	Tool      string
	Name      string
	PID       int
	Exclusive bool
	Started   time.Time
}

// ToolOutputs looks at the game after a tool ends (core/09 §3): the
// changes the scan found and the new files it offers to capture. Scanned is
// false when the instance was busy and nothing was read (the next deploy
// scans anyway).
type ToolOutputs interface {
	AfterTool(ctx context.Context, instance game.InstanceID) (changes, newFiles int, scanned bool, err error)
}

type runningTool struct {
	RunningTool
	instance game.InstanceID
}

// RunTool starts the launch_tool operation: deploy first when the tool asks
// for it and a deploy is pending, then start the tool. The operation ends
// once the tool started; the tool is then followed until it ends, when the
// instance lock of an exclusive tool is released and the game is scanned
// for what the tool changed (tool.exited carries the counts, the UI offers
// the capture).
func (s *Service) RunTool(ctx context.Context, instance game.InstanceID, run ToolRun) (operation.ID, error) {
	if s.Runner == nil {
		return "", fail(CodeToolStartFailed, errors.New("no process runner"), "tool", run.Tool)
	}
	if s.toolRunning(instance, run.Tool) {
		return "", fail(CodeToolRunning, nil, "tool", run.Tool, "name", run.Name)
	}
	st, err := s.Deploy.Status(ctx, instance)
	if err != nil {
		return "", err
	}
	if st.Busy != "" {
		return "", fail(CodeBusy, nil, "holder", st.Busy)
	}
	deployFirst := false
	if run.DeployBefore {
		c, err := s.Check(ctx, instance)
		if err != nil {
			return "", err
		}
		deployFirst = c.DeployNeeded
	}
	t, err := s.Ops.Enqueue(ctx, operations.Spec{Kind: KindTool, Subject: event.EntityRef{Kind: subjectInstance, ID: string(instance)}, Steps: []string{StepCheck, StepDeploy, StepStart}})
	if err != nil {
		return "", err
	}
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		bg := context.WithoutCancel(ctx)
		_ = s.Ops.Execute(bg, t, func(ctx context.Context, t *operations.Tracker) error {
			return opError(s.runTool(ctx, t, instance, run, deployFirst))
		})
	}()
	return t.ID(), nil
}

func (s *Service) runTool(ctx context.Context, t *operations.Tracker, instance game.InstanceID, run ToolRun, deployFirst bool) error {
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
			var e *Error
			if errors.As(err, &e) && e.code == CodeDeployFailed {
				return fail(CodeToolDeployFailed, e.cause, append(flat(e.params), "tool", run.Tool)...)
			}
			return err
		}
		if err := t.CompleteStep(ctx, StepDeploy); err != nil {
			return err
		}
	} else if err := t.SkipStep(ctx, StepDeploy); err != nil {
		return err
	}
	if err := t.BeginStep(ctx, StepStart); err != nil {
		return err
	}
	var release func()
	if run.Exclusive && s.Locks != nil {
		r, err := s.Locks.Acquire(instance, HolderTool)
		if err != nil {
			var busy *instancelock.BusyError
			if errors.As(err, &busy) {
				return fail(CodeBusy, err, "holder", busy.Holder)
			}
			return err
		}
		release = r
	}
	proc, err := s.Runner.Run(ctx, ports.ProcessSpec{Exe: run.Exe, Args: run.Args, WorkDir: run.WorkDir, Env: run.Env})
	if err != nil {
		if release != nil {
			release()
		}
		return fail(CodeToolStartFailed, err, "tool", run.Tool, "exe", run.Exe)
	}
	rt := &runningTool{RunningTool: RunningTool{Tool: run.Tool, Name: run.Name, PID: proc.PID(), Exclusive: run.Exclusive, Started: s.Clock.Now()}, instance: instance}
	s.addTool(rt)
	if err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		tx.Emit(s.newEvent(EventToolLaunched, instance, t.ID(), map[string]string{
			"instance": string(instance), "tool": run.Tool, "name": run.Name, "exclusive": strconv.FormatBool(run.Exclusive),
		}))
		return nil
	}); err != nil {
		return err
	}
	s.follow(instance, rt, proc, release, t.ID())
	return t.CompleteStep(ctx, StepStart)
}

// follow waits for the end of a tool outside the operation: a tool may run
// for hours, and closing the app stops the wait (the tool keeps running).
func (s *Service) follow(instance game.InstanceID, rt *runningTool, proc ports.RunningProcess, release func(), op operation.ID) {
	s.toolsOnce.Do(func() { s.toolsCtx, s.toolsCancel = context.WithCancel(context.Background()) })
	ctx := s.toolsCtx
	s.toolWG.Add(1)
	go func() {
		defer s.toolWG.Done()
		exit, err := proc.Wait(ctx)
		s.removeTool(rt)
		if release != nil {
			release()
		}
		if ctx.Err() != nil {
			return // the app is closing
		}
		payload := map[string]string{
			"instance": string(instance), "tool": rt.Tool, "name": rt.Name,
			"code": strconv.Itoa(exit.Code), "started": rt.Started.UTC().Format(time.RFC3339), "duration": s.Clock.Now().Sub(rt.Started).Round(time.Second).String(),
		}
		if err != nil {
			payload["error"] = err.Error()
		}
		if s.Outputs != nil {
			changes, newFiles, scanned, err := s.Outputs.AfterTool(ctx, instance)
			payload["scanned"] = strconv.FormatBool(scanned && err == nil)
			if err == nil && scanned {
				payload["changes"] = strconv.Itoa(changes)
				payload["newFiles"] = strconv.Itoa(newFiles)
			}
		}
		_ = s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
			tx.Emit(s.newEvent(EventToolExited, instance, op, payload))
			return nil
		})
	}()
}

// RunningTools lists the tools of an instance that run now, oldest first.
func (s *Service) RunningTools(instance game.InstanceID) []RunningTool {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []RunningTool
	for _, t := range s.tools {
		if t.instance == instance {
			out = append(out, t.RunningTool)
		}
	}
	return out
}

func (s *Service) toolRunning(instance game.InstanceID, id string) bool {
	return slices.ContainsFunc(s.RunningTools(instance), func(t RunningTool) bool { return t.Tool == id })
}

func (s *Service) addTool(rt *runningTool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tools = append(s.tools, rt)
}

func (s *Service) removeTool(rt *runningTool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tools = slices.DeleteFunc(s.tools, func(t *runningTool) bool { return t == rt })
}

// WaitTools waits for the end of every followed tool (tests).
func (s *Service) WaitTools() { s.toolWG.Wait() }

func (s *Service) stopTools() {
	s.toolsOnce.Do(func() { s.toolsCtx, s.toolsCancel = context.WithCancel(context.Background()) })
	s.toolsCancel()
	s.toolWG.Wait()
}

func flat(m map[string]string) []string {
	out := make([]string, 0, 2*len(m))
	for k, v := range m {
		out = append(out, k, v)
	}
	return out
}
