package diagnostics

import (
	"context"
	"fmt"
	"testing"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/testutil/memfs"
)

type knownFolders map[string]string

func (f knownFolders) Folder(name string) (string, error) {
	if p, ok := f[name]; ok {
		return p, nil
	}
	return "", fmt.Errorf("unknown folder %s", name)
}

func TestAppChecksRiskyFolders(t *testing.T) {
	for _, tt := range []struct {
		name          string
		folders       ports.KnownFolders
		root, staging string
		want          map[string]struct {
			kind     string
			severity diagnostic.Severity
		}
	}{
		{
			name:    "known places",
			folders: knownFolders{ports.FolderOneDrive: `C:\Users\A\OneDrive`, ports.FolderProgramFilesX86: `C:\Program Files (x86)`, ports.FolderDesktop: `C:\Users\A\Desktop`, ports.FolderDocuments: `C:\Users\A\Documents`, ports.FolderDownloads: `C:\Users\A\Downloads`},
			root:    `C:\Program Files (x86)\Game`, staging: `C:\Users\A\OneDrive\staging`,
			want: map[string]struct {
				kind     string
				severity diagnostic.Severity
			}{"game": {"program_files", diagnostic.SeverityInfo}, "staging": {"onedrive", diagnostic.SeverityWarning}},
		},
		{
			name: "WindowsApps without resolver", root: `C:\Program Files\WindowsApps\X`, staging: `C:\Staging`,
			want: map[string]struct {
				kind     string
				severity diagnostic.Severity
			}{"game": {"windows_apps", diagnostic.SeverityWarning}},
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s := &Service{Deps: Deps{FS: memfs.New("C:"), Folders: tt.folders}}
			// Folder checks apply to every game, including generic.
			inst := game.Instance{ID: "i1", Adapter: "generic", Root: tt.root, Staging: tt.staging, ArchiveStore: `C:\Mods`}
			ds, err := s.appChecks(context.Background(), inst)
			if err != nil {
				t.Fatal(err)
			}
			if len(ds) != len(tt.want) {
				t.Fatalf("diagnostics = %+v", ds)
			}
			seen := map[string]bool{}
			for _, d := range ds {
				want, ok := tt.want[d.Params["folder"]]
				if !ok || seen[d.Params["folder"]] || d.Code != diagnostic.CodeFolderLocationRisky || d.Severity != want.severity || d.Params["kind"] != want.kind {
					t.Fatalf("diagnostic = %+v", d)
				}
				seen[d.Params["folder"]] = true
			}
		})
	}
}
