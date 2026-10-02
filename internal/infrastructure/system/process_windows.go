//go:build windows

package system

import (
	"context"
	"errors"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Processes tells which executables are running (game_running, core/11 §6).
type Processes struct{}

// Running returns the names in names that match a running process image,
// compared without case.
func (Processes) Running(_ context.Context, names []string) ([]string, error) {
	if len(names) == 0 {
		return nil, nil
	}
	want := map[string]string{}
	for _, n := range names {
		want[strings.ToLower(n)] = n
	}
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, err
	}
	defer windows.CloseHandle(snap)
	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))
	seen := map[string]bool{}
	var out []string
	for err = windows.Process32First(snap, &entry); err == nil; err = windows.Process32Next(snap, &entry) {
		exe := strings.ToLower(windows.UTF16ToString(entry.ExeFile[:]))
		if n, ok := want[exe]; ok && !seen[exe] {
			seen[exe] = true
			out = append(out, n)
		}
	}
	if !errors.Is(err, windows.ERROR_NO_MORE_FILES) {
		return out, err
	}
	return out, nil
}
