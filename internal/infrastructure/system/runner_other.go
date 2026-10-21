//go:build !windows

package system

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"modorchestrator/internal/core/application/ports"
)

// Runner starts external tools outside Windows (D039): the arguments are
// split on spaces and only the process itself is waited for.
type Runner struct{}

var _ ports.ProcessRunner = Runner{}

func (Runner) Run(_ context.Context, spec ports.ProcessSpec) (ports.RunningProcess, error) {
	cmd := exec.Command(spec.Exe, strings.Fields(spec.Args)...)
	cmd.Dir = spec.WorkDir
	if len(spec.Env) > 0 {
		cmd.Env = append(os.Environ(), spec.Env...)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("system: start %s: %w", spec.Exe, err)
	}
	p := &process{cmd: cmd, exited: make(chan struct{})}
	go func() {
		err := cmd.Wait()
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			p.code = exit.ExitCode()
		} else if err != nil {
			p.code = -1
		}
		close(p.exited)
	}()
	return p, nil
}

type process struct {
	cmd    *exec.Cmd
	exited chan struct{}
	code   int
}

func (p *process) PID() int { return p.cmd.Process.Pid }

func (p *process) Wait(ctx context.Context) (ports.ProcessExit, error) {
	select {
	case <-p.exited:
		return ports.ProcessExit{Code: p.code}, nil
	case <-ctx.Done():
		return ports.ProcessExit{}, ctx.Err()
	}
}
