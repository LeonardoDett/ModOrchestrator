//go:build windows

package system

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"

	"modorchestrator/internal/core/application/ports"
)

// Runner starts external tools (ports.ProcessRunner, D146). Each tool runs
// in a job object of its own, so the wait covers the processes it starts
// (a launcher that opens the real program and exits). The job never kills
// anything: closing the app leaves the tools running.
type Runner struct {
	// Poll is how often the job is asked whether processes remain
	// (default 500 ms).
	Poll time.Duration
}

var _ ports.ProcessRunner = Runner{}

// jobBasicAccounting is JOBOBJECT_BASIC_ACCOUNTING_INFORMATION.
type jobBasicAccounting struct {
	TotalUserTime             int64
	TotalKernelTime           int64
	ThisPeriodTotalUserTime   int64
	ThisPeriodTotalKernelTime int64
	TotalPageFaultCount       uint32
	TotalProcesses            uint32
	ActiveProcesses           uint32
	TotalTerminatedProcesses  uint32
}

const jobObjectBasicAccountingInformation = 1

// Run starts spec.Exe with the command line the user typed: the executable
// quoted, then spec.Args as written.
func (r Runner) Run(_ context.Context, spec ports.ProcessSpec) (ports.RunningProcess, error) {
	cmd := exec.Command(spec.Exe)
	line := syscall.EscapeArg(spec.Exe)
	if spec.Args != "" {
		line += " " + spec.Args
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{CmdLine: line}
	cmd.Dir = spec.WorkDir
	if len(spec.Env) > 0 {
		cmd.Env = append(os.Environ(), spec.Env...)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("system: start %s: %w", spec.Exe, err)
	}
	p := &process{cmd: cmd, poll: r.Poll, exited: make(chan struct{})}
	if p.poll == 0 {
		p.poll = 500 * time.Millisecond
	}
	p.job = attachJob(cmd.Process.Pid)
	go func() {
		err := cmd.Wait()
		var exit *exec.ExitError
		switch {
		case err == nil:
		case errors.As(err, &exit):
			p.code = exit.ExitCode()
		default:
			p.code = -1
		}
		close(p.exited)
	}()
	return p, nil
}

// attachJob puts the process in a new job; 0 when the system refuses it
// (the wait then covers only the process itself).
func attachJob(pid int) windows.Handle {
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return 0
	}
	h, err := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE, false, uint32(pid))
	if err != nil {
		windows.CloseHandle(job)
		return 0
	}
	defer windows.CloseHandle(h)
	if err := windows.AssignProcessToJobObject(job, h); err != nil {
		windows.CloseHandle(job)
		return 0
	}
	return job
}

type process struct {
	cmd    *exec.Cmd
	job    windows.Handle
	poll   time.Duration
	exited chan struct{}
	code   int
}

func (p *process) PID() int { return p.cmd.Process.Pid }

// Wait returns when the process and every process of its job ended.
func (p *process) Wait(ctx context.Context) (ports.ProcessExit, error) {
	select {
	case <-p.exited:
	case <-ctx.Done():
		return ports.ProcessExit{}, ctx.Err()
	}
	if p.job != 0 {
		defer windows.CloseHandle(p.job)
		t := time.NewTicker(p.poll)
		defer t.Stop()
		for p.active() > 0 {
			select {
			case <-ctx.Done():
				return ports.ProcessExit{Code: p.code}, ctx.Err()
			case <-t.C:
			}
		}
	}
	return ports.ProcessExit{Code: p.code}, nil
}

func (p *process) active() uint32 {
	var info jobBasicAccounting
	if err := windows.QueryInformationJobObject(p.job, jobObjectBasicAccountingInformation,
		uintptr(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info)), nil); err != nil {
		return 0
	}
	return info.ActiveProcesses
}
