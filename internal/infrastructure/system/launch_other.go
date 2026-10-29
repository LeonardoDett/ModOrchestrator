//go:build !windows

package system

import (
	"errors"
	"os/exec"
	"runtime"
)

func elevationRequired(error) bool { return false }

func elevationCancelled(error) bool { return false }

func startElevated(string, []string, string) error {
	return errors.New("elevated start is only supported on Windows")
}

func openURI(uri string) error {
	name := "xdg-open"
	if runtime.GOOS == "darwin" {
		name = "open"
	}
	cmd := exec.Command(name, uri)
	if err := cmd.Start(); err != nil {
		return err
	}
	go cmd.Wait() //nolint:errcheck // the opener's exit status says nothing about the game
	return nil
}
