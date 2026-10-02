package system

import (
	"fmt"
	"os"

	"modorchestrator/internal/core/application/ports"
)

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
	}
	return "", fmt.Errorf("system: unknown folder %q", name)
}
