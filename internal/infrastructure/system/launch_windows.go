//go:build windows

package system

import (
	"errors"
	"strings"
	"syscall"

	"golang.org/x/sys/windows"
)

// elevationRequired: CreateProcess refused an executable whose manifest
// asks for administrator rights (ERROR_ELEVATION_REQUIRED, 740).
func elevationRequired(err error) bool {
	return errors.Is(err, windows.ERROR_ELEVATION_REQUIRED)
}

// elevationCancelled: the user said no to the UAC prompt (ERROR_CANCELLED).
func elevationCancelled(err error) bool {
	return errors.Is(err, windows.ERROR_CANCELLED)
}

func startElevated(exe string, args []string, dir string) error {
	quoted := make([]string, len(args))
	for i, a := range args {
		quoted[i] = syscall.EscapeArg(a)
	}
	return shellExecute("runas", exe, strings.Join(quoted, " "), dir)
}

func openURI(uri string) error {
	return shellExecute("open", uri, "", "")
}

func shellExecute(verb, file, args, dir string) error {
	v, err := windows.UTF16PtrFromString(verb)
	if err != nil {
		return err
	}
	f, err := windows.UTF16PtrFromString(file)
	if err != nil {
		return err
	}
	var a, d *uint16
	if args != "" {
		if a, err = windows.UTF16PtrFromString(args); err != nil {
			return err
		}
	}
	if dir != "" {
		if d, err = windows.UTF16PtrFromString(dir); err != nil {
			return err
		}
	}
	return windows.ShellExecute(0, v, f, a, d, windows.SW_SHOWNORMAL)
}
