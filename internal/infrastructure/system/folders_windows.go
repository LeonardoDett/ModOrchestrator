//go:build windows

package system

import (
	"fmt"

	"golang.org/x/sys/windows"

	"modorchestrator/internal/core/application/ports"
)

// documentsFolder is the Documents folder as the shell knows it, which
// follows a folder moved by the user (to another drive, or to OneDrive).
func documentsFolder() (string, error) {
	return windows.KnownFolderPath(windows.FOLDERID_Documents, 0)
}

// shellFolder resolves the other known folders through the shell, which
// follows a folder the user moved.
func shellFolder(name string) (string, error) {
	ids := map[string]*windows.KNOWNFOLDERID{
		ports.FolderDesktop:         windows.FOLDERID_Desktop,
		ports.FolderDownloads:       windows.FOLDERID_Downloads,
		ports.FolderProgramFiles:    windows.FOLDERID_ProgramFiles,
		ports.FolderProgramFilesX86: windows.FOLDERID_ProgramFilesX86,
	}
	id, ok := ids[name]
	if !ok {
		return "", fmt.Errorf("system: unknown folder %q", name)
	}
	return windows.KnownFolderPath(id, 0)
}
