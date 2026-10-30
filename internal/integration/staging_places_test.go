package integration_test

import (
	"fmt"
	"testing"

	"modorchestrator/internal/adapters/generic"
	deploysvc "modorchestrator/internal/core/application/deployment"
	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/testutil/memfs"
)

type knownPlaces map[string]string

func (f knownPlaces) Folder(name string) (string, error) {
	if p, ok := f[name]; ok {
		return p, nil
	}
	return "", fmt.Errorf("unknown folder %s", name)
}

func TestVerifyRiskyPlaces(t *testing.T) {
	for _, tt := range []struct {
		name, root, staging, problem, warning, reason, folder string
	}{
		{"WindowsApps root", `C:\Program Files\WindowsApps\Pkg`, `C:\Mods\staging`, "root_invalid", "", "windows_apps", ""},
		{"OneDrive staging", `C:\Games\Other`, `C:\Users\A\OneDrive\staging`, "", "folder_location_risky", "onedrive", "staging"},
		{"Program Files game", `C:\Program Files (x86)\Game`, `C:\Mods\staging`, "", "", "", ""},
		{"WindowsApps staging", `C:\Games\Other`, `C:\Program Files\WindowsApps\staging`, "folders_invalid", "", "windows_apps", "staging"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			e := newEnvWith(t, envOptions{generic: true})
			fs := memfs.New("C:")
			fs.AddDir(tt.root)
			e.games.FS = fs
			e.games.Folders = knownPlaces{ports.FolderOneDrive: `C:\Users\A\OneDrive`, ports.FolderProgramFilesX86: `C:\Program Files (x86)`}
			v, err := e.games.Verify(ctx, games.Setup{Game: generic.GameID, Name: "Other", Root: tt.root, Targets: genericTargets(nil), Folders: games.Folders{Staging: tt.staging, ArchiveStore: `C:\Mods\archives`, BackupStore: `C:\Mods\backups`}})
			if err != nil {
				t.Fatal(err)
			}
			if tt.problem != "" {
				found := false
				for _, p := range v.Problems {
					if p.Code == tt.problem && p.Params["reason"] == tt.reason && p.Params["folder"] == tt.folder {
						found = true
					}
				}
				if !found {
					t.Fatalf("problems = %+v", v.Problems)
				}
			} else if len(v.Problems) != 0 {
				t.Fatalf("problems = %+v", v.Problems)
			}
			found := false
			for _, w := range v.Warnings {
				if w.Code != "folder_location_risky" {
					continue
				}
				if tt.warning == "" || w.Params["folder"] == "game" {
					t.Fatalf("unexpected game/place warning = %+v", w)
				}
				if w.Params["reason"] == tt.reason && w.Params["folder"] == tt.folder {
					found = true
				}
			}
			if tt.warning != "" && !found {
				t.Fatalf("warnings = %+v", v.Warnings)
			}
		})
	}
}

func TestRelocateRefusesWindowsApps(t *testing.T) {
	e := newEnvWith(t, envOptions{generic: true})
	err := e.games.Relocate(ctx, e.inst.ID, `C:\Program Files\WindowsApps\Pkg`)
	code, params, ok := games.CodeOf(err)
	if !ok || code != "root_invalid" || params["reason"] != "windows_apps" {
		t.Fatalf("relocate = %v (%s, %v)", err, code, params)
	}
}

func TestPreviewMoveRiskyPlaces(t *testing.T) {
	for _, tt := range []struct{ name, to, problem, reason, place string }{
		{"WindowsApps", `C:\Program Files\WindowsApps\mods`, "folders_invalid", "windows_apps", ""},
		{"Downloads", `C:\Users\A\Downloads\mods`, "", "", "downloads"},
	} {
		for _, folder := range []string{"staging", "archives"} {
			t.Run(tt.name+"/"+folder, func(t *testing.T) {
				e := newEnvWith(t, envOptions{generic: true})
				e.dep.FS = memfs.New("C:")
				e.dep.Folders = knownPlaces{ports.FolderDownloads: `C:\Users\A\Downloads`}
				var problem, reason, place string
				if folder == "archives" {
					p, err := e.dep.PreviewMoveArchives(ctx, e.inst.ID, tt.to)
					if err != nil {
						t.Fatal(err)
					}
					problem, reason, place = p.Problem, p.Reason, p.Place
				} else {
					p, err := e.dep.PreviewMoveStaging(ctx, e.inst.ID, tt.to)
					if err != nil {
						t.Fatal(err)
					}
					problem, reason, place = p.Problem, p.Reason, p.Place
				}
				if problem != tt.problem || reason != tt.reason || place != tt.place {
					t.Fatalf("preview = %q %q %q", problem, reason, place)
				}
			})
		}
	}
}

func TestMoveStagingRefusesWindowsApps(t *testing.T) {
	e := newEnvWith(t, envOptions{generic: true})
	_, err := e.dep.MoveStaging(ctx, e.inst.ID, `C:\Program Files\WindowsApps\mods`)
	if coded(err) != deploysvc.CodeFolderInvalid {
		t.Fatalf("move = %v", err)
	}
}
