//go:build windows

package system

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"modorchestrator/internal/core/application/ports"
)

func cmdExe(t *testing.T) string {
	p := filepath.Join(os.Getenv("SystemRoot"), "System32", "cmd.exe")
	if _, err := os.Stat(p); err != nil {
		t.Skip("cmd.exe not found")
	}
	return p
}

// D146: the command line goes as typed, the environment is added, and the
// exit code comes back.
func TestRunnerPassesTheCommandLineAndExitCode(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "out.txt")
	p, err := Runner{Poll: 20 * time.Millisecond}.Run(context.Background(), ports.ProcessSpec{
		Exe: cmdExe(t), Args: `/c "echo %TOOL_VAR%> "` + out + `" & exit 3"`, WorkDir: dir, Env: []string{"TOOL_VAR=hello"},
	})
	if err != nil {
		t.Fatal(err)
	}
	exit, err := p.Wait(context.Background())
	if err != nil || exit.Code != 3 {
		t.Fatalf("exit = %+v, %v", exit, err)
	}
	if b, _ := os.ReadFile(out); !bytes.HasPrefix(b, []byte("hello")) {
		t.Fatalf("output = %q", b)
	}
}

// The wait covers a process the tool started and left running (a
// launcher that opens the real program and exits).
func TestRunnerWaitsForTheProcessesTheToolStarts(t *testing.T) {
	dir := t.TempDir()
	marker := filepath.Join(dir, "child.txt")
	cmd := cmdExe(t)
	start := time.Now()
	p, err := Runner{Poll: 20 * time.Millisecond}.Run(context.Background(), ports.ProcessSpec{
		Exe: cmd, Args: `/c start "" /b "` + cmd + `" /c "ping -n 3 127.0.0.1 >nul & echo done> "` + marker + `""`, WorkDir: dir,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := p.Wait(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(marker); err != nil || time.Since(start) < time.Second {
		t.Fatalf("returned before the child ended (%v, %v)", time.Since(start), err)
	}
}

func TestRunnerWaitStopsWithTheContext(t *testing.T) {
	p, err := Runner{}.Run(context.Background(), ports.ProcessSpec{Exe: cmdExe(t), Args: "/c ping -n 3 127.0.0.1 >nul", WorkDir: os.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := p.Wait(ctx); err == nil {
		t.Fatal("wait ignored the context")
	}
	_, _ = p.Wait(context.Background())
}

func TestIconOfAnExecutable(t *testing.T) {
	b, err := Icons{}.Icon(context.Background(), cmdExe(t), 32)
	if err != nil || !bytes.HasPrefix(b, pngMagic) {
		t.Fatalf("icon = %d bytes, %v", len(b), err)
	}
	if _, err := (Icons{}).Icon(context.Background(), filepath.Join(t.TempDir(), "none.exe"), 32); err == nil {
		t.Fatal("icon of a missing file")
	}
}
