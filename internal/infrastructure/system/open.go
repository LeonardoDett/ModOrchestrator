package system

import (
	"fmt"
	"os/exec"
	"runtime"
)

// OpenFolder shows a folder in the OS file manager. It only opens folders
// the application owns (for example the log folder); it never runs files.
func OpenFolder(path string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer.exe", path)
	case "darwin":
		cmd = exec.Command("open", path)
	default:
		cmd = exec.Command("xdg-open", path)
	}
	// explorer.exe exits with 1 even on success; only a failure to start
	// is an error.
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("system: open folder: %w", err)
	}
	go cmd.Wait() //nolint:errcheck // exit status is meaningless for file managers
	return nil
}
