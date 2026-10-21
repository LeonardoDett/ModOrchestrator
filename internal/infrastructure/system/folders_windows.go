//go:build windows

package system

import "golang.org/x/sys/windows"

// documentsFolder is the Documents folder as the shell knows it, which
// follows a folder moved by the user (to another drive, or to OneDrive).
func documentsFolder() (string, error) {
	return windows.KnownFolderPath(windows.FOLDERID_Documents, 0)
}
