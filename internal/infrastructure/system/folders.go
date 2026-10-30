package system

import (
	"fmt"
	"os"
	"path/filepath"

	"modorchestrator/internal/core/application/ports"
)

// EnvDocumentsDir replaces the Documents folder, like LOCALAPPDATA replaces
// the local application data: a development or test run points the games'
// settings and saves at a scratch folder instead of the user's own.
const EnvDocumentsDir = "MODORCHESTRATOR_DOCUMENTS_DIR"

// Folders resolves the known folders of the user (ports.KnownFolders).
type Folders struct{}

var _ ports.KnownFolders = Folders{}

// Folder returns the absolute path of a known folder.
func (Folders) Folder(name string) (string, error) {
	switch name {
	case ports.FolderLocalAppData:
		if v := os.Getenv("LOCALAPPDATA"); v != "" {
			return v, nil
		}
		dir, err := os.UserCacheDir() // %LocalAppData% on Windows
		if err != nil {
			return "", err
		}
		return dir, nil
	case ports.FolderDocuments:
		if v := os.Getenv(EnvDocumentsDir); v != "" {
			return v, nil
		}
		if dir, err := documentsFolder(); err == nil && dir != "" {
			return dir, nil
		}
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, "Documents"), nil
	case ports.FolderOneDrive, ports.FolderOneDriveCommercial:
		// The OneDrive client sets these for the signed-in accounts; without
		// it there is no synced folder.
		env := "OneDrive"
		if name == ports.FolderOneDriveCommercial {
			env = "OneDriveCommercial"
		}
		if v := os.Getenv(env); v != "" {
			return v, nil
		}
		return "", fmt.Errorf("system: no %s folder", name)
	case ports.FolderDesktop, ports.FolderDownloads, ports.FolderProgramFiles, ports.FolderProgramFilesX86:
		return shellFolder(name)
	}
	return "", fmt.Errorf("system: unknown folder %q", name)
}
