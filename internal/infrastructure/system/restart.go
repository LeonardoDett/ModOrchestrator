package system

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// RestartFlag is passed to the new process of a restart with the pid of
// the old one, so it waits for the old process to release the database
// before opening it (a pending restore replaces the file).
const RestartFlag = "--restart-after="

// Restart starts a new instance of the application that waits for this
// process to exit. The caller quits right after.
func Restart() error {
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("system: restart: %w", err)
	}
	var args []string
	for _, a := range os.Args[1:] {
		if !strings.HasPrefix(a, RestartFlag) {
			args = append(args, a)
		}
	}
	args = append(args, RestartFlag+strconv.Itoa(os.Getpid()))
	cmd := exec.Command(exe, args...)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("system: restart: %w", err)
	}
	go cmd.Process.Release() //nolint:errcheck // the new process outlives this one
	return nil
}

// WaitForPrevious waits (up to timeout) for the process named by the
// restart flag in args to exit. Without the flag it returns at once.
func WaitForPrevious(args []string, timeout time.Duration) {
	for _, a := range args {
		v, ok := strings.CutPrefix(a, RestartFlag)
		if !ok {
			continue
		}
		pid, err := strconv.Atoi(v)
		if err != nil {
			return
		}
		p, err := os.FindProcess(pid)
		if err != nil {
			return
		}
		done := make(chan struct{})
		go func() {
			_, _ = p.Wait()
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(timeout):
		}
		return
	}
}
