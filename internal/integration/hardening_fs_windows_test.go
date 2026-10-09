//go:build windows

package integration_test

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"golang.org/x/sys/windows"

	deploysvc "modorchestrator/internal/core/application/deployment"
	"modorchestrator/internal/core/application/library"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/deploystate"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/operation"
)

// F14: permissions, files an antivirus holds, other volumes and long paths.
// Each failure is reported with a stable reason, writes nothing it should
// not, and the next run finishes once the cause is gone; purge gives the
// original game back.

// lockExclusive opens path with no sharing at all, as an antivirus scan
// does: nobody can read, write, rename or delete it until release.
func lockExclusive(t *testing.T, path string) (release func()) {
	t.Helper()
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		t.Fatal(err)
	}
	h, err := windows.CreateFile(p, windows.GENERIC_READ, 0, nil, windows.OPEN_EXISTING, windows.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		t.Fatalf("lock %s: %v", path, err)
	}
	once := false
	release = func() {
		if !once {
			once = true
			windows.CloseHandle(h)
		}
	}
	t.Cleanup(release)
	return release
}

// An archive held by an antivirus fails its import with a stable code and
// leaves nothing behind; the same file imports once released.
func TestLockedArchiveImport(t *testing.T) {
	e := newEnv(t)
	p := e.zipFile("Held.zip", "textures/held.dds", "h")
	release := lockExclusive(t, p)
	ids := e.importAndWait(p)
	o := e.op(ids[0])
	if o.Status != operation.StatusFailed || o.Error == nil || o.Error.Code != library.CodeSourceUnreadable || o.Error.Params["reason"] != "file_locked" {
		t.Fatalf("import of a held archive = %s %+v", o.Status, o.Error)
	}
	if len(e.rows()) != 0 {
		t.Fatalf("no mod from a failed import: %+v", e.rows())
	}
	assertLibraryConsistent(t, e)
	release()
	ids = e.importAndWait(p)
	if o := e.op(ids[0]); o.Status != operation.StatusSucceeded {
		t.Fatalf("import after release: %+v", o.Error)
	}
}

// A staged file held while the copy method deploys fails only its
// location; the next deploy finishes.
func TestLockedStagingFileWithCopy(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodCopy})
	ids := e.installFiles(deployMods, "Alpha", "Charlie")
	release := lockExclusive(t, e.staged(ids[1], "meshes/charlie/c.nif"))
	o := e.deploy(deploysvc.KindDeploy)
	if o.Status != operation.StatusFailed || o.Error.Params["count"] != "1" || o.Error.Params["reason"] != deploysvc.CodeFileLocked {
		t.Fatalf("deploy = %s %+v", o.Status, o.Error)
	}
	if readFile(t, e.data("Alpha.esp")) != "alpha plugin" {
		t.Fatal("the other locations were applied")
	}
	release()
	if o := e.deploy(deploysvc.KindDeploy); o.Status != operation.StatusSucceeded {
		t.Fatalf("retry: %+v", o.Error)
	}
	e.wantStatus(deploystate.InSync)
}

// A game file held during purge stays (and is reported); everything else
// is purged, and the next purge restores the original game.
func TestLockedFileDuringPurge(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	original := snapshot(t, e.inst.Root)
	e.installFiles(deployMods, "Alpha", "Bravo", "Charlie")
	e.deploy(deploysvc.KindDeploy)
	release := lockExclusive(t, e.data("Alpha.esp"))
	o := e.deploy(deploysvc.KindPurge)
	if o.Status != operation.StatusFailed || o.Error.Params["reason"] != deploysvc.CodeFileLocked {
		t.Fatalf("purge = %s %+v", o.Status, o.Error)
	}
	if readFile(t, e.data("Skyrim.esm")) != "esm" {
		t.Fatal("the original under the held file's neighbours came back")
	}
	release()
	if o := e.deploy(deploysvc.KindPurge); o.Status != operation.StatusSucceeded {
		t.Fatalf("purge again: %+v", o.Error)
	}
	if d := diffSnapshots(original, snapshot(t, e.inst.Root)); len(d) != 0 {
		t.Fatalf("original game: %v", d)
	}
}

// A managed file made read-only by the user (or a tool) cannot be removed:
// the deploy reports "permission" for it and changes nothing else of it;
// once writable again, the next deploy finishes.
func TestReadOnlyManagedFile(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodCopy})
	ids := e.installFiles(deployMods, "Alpha", "Charlie")
	e.deploy(deploysvc.KindDeploy)
	if err := os.Chmod(e.data("meshes/charlie/c.nif"), 0o444); err != nil {
		t.Fatal(err)
	}
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids[1:], false); err != nil {
		t.Fatal(err)
	}
	o := e.deploy(deploysvc.KindDeploy)
	t.Logf("read-only: %s %+v", o.Status, o.Error)
	if o.Status == operation.StatusSucceeded {
		// Windows lets the owner delete a read-only file only through
		// FILE_DISPOSITION_IGNORE_READONLY_ATTRIBUTE; os.Remove clears it.
		if _, err := os.Stat(e.data("meshes/charlie/c.nif")); !os.IsNotExist(err) {
			t.Fatal("reported success but the file is still there")
		}
		return
	}
	if o.Error.Params["reason"] != deploysvc.CodePermission {
		t.Fatalf("reason = %+v", o.Error)
	}
	if err := os.Chmod(e.data("meshes/charlie/c.nif"), 0o644); err != nil {
		t.Fatal(err)
	}
	if o := e.deploy(deploysvc.KindDeploy); o.Status != operation.StatusSucceeded {
		t.Fatalf("retry: %+v", o.Error)
	}
	e.wantStatus(deploystate.InSync)
}

// icacls changes the ACL of a folder this test owns.
func icacls(t *testing.T, args ...string) {
	t.Helper()
	if out, err := exec.Command("icacls", args...).CombinedOutput(); err != nil {
		t.Fatalf("icacls %v: %v\n%s", args, err, out)
	}
}

// A game folder the user cannot write to (ACL) fails the deploy with
// "permission" and writes nothing; once granted, the deploy finishes.
func TestDeniedGameFolder(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	e.installFiles(deployMods, "Alpha")
	data := filepath.Join(e.inst.Root, "Data")
	user := os.Getenv("USERNAME")
	icacls(t, data, "/deny", user+":(OI)(CI)(W,D,DC)")
	t.Cleanup(func() { _ = exec.Command("icacls", data, "/remove:d", user).Run() })
	before := snapshot(t, e.inst.Root)
	o := e.deploy(deploysvc.KindDeploy)
	if o.Status != operation.StatusFailed {
		t.Fatalf("deploy into a denied folder = %s", o.Status)
	}
	if o.Error.Code != deploysvc.CodeDeployFailed || o.Error.Params["reason"] != deploysvc.CodePermission {
		t.Fatalf("reason = %+v", o.Error)
	}
	if d := diffSnapshots(before, snapshot(t, e.inst.Root)); len(d) != 0 {
		t.Fatalf("nothing is written: %v", d)
	}
	icacls(t, data, "/remove:d", user)
	if o := e.deploy(deploysvc.KindDeploy); o.Status != operation.StatusSucceeded {
		t.Fatalf("deploy once granted: %+v", o.Error)
	}
	e.wantStatus(deploystate.InSync)
}

// otherVolume pretends the game is on another drive (or a FAT32 one):
// hardlinks from the staging fail as Windows fails them.
type otherVolume struct {
	ports.FileSystem
	root   string
	on     atomic.Bool
	format string
}

func (o *otherVolume) inGame(p string) bool {
	return o.on.Load() && strings.HasPrefix(strings.ToLower(filepath.Clean(p)), strings.ToLower(o.root))
}

func (o *otherVolume) SameVolume(ctx context.Context, a, b string) (bool, error) {
	if o.inGame(a) != o.inGame(b) {
		return false, nil
	}
	return o.FileSystem.SameVolume(ctx, a, b)
}

func (o *otherVolume) VolumeFormat(ctx context.Context, p string) (string, error) {
	if o.inGame(p) && o.format != "" {
		return o.format, nil
	}
	return o.FileSystem.VolumeFormat(ctx, p)
}

func (o *otherVolume) Hardlink(ctx context.Context, src, dst string) error {
	if o.inGame(dst) && !o.inGame(src) {
		return fmt.Errorf("link %s: %w", dst, windows.ERROR_NOT_SAME_DEVICE)
	}
	return o.FileSystem.Hardlink(ctx, src, dst)
}

// core/04 §6: hardlinks need the staging on the same NTFS volume. A game
// on another volume (or on FAT32) gets copies only after the user accepts
// the fallback; auto-deploy never accepts it (INV-DEP-06).
func TestOtherVolumeFallsBackOnlyWithConsent(t *testing.T) {
	for _, format := range []string{"", "FAT32"} {
		t.Run("format="+format, func(t *testing.T) {
			var vol *otherVolume
			e := newEnvWith(t, envOptions{method: game.MethodHardlink, fs: func(f ports.FileSystem) ports.FileSystem {
				vol = &otherVolume{FileSystem: f, format: format}
				return vol
			}})
			original := snapshot(t, e.inst.Root)
			ids := e.installFiles(deployMods, "Alpha", "Charlie")
			vol.root = filepath.Clean(e.inst.Root)
			vol.on.Store(true)

			methods, _ := e.dep.Methods(ctx, e.inst.ID)
			for _, m := range methods {
				if m.Method == game.MethodHardlink && m.Available {
					t.Fatalf("hardlink offered across volumes: %+v", methods)
				}
			}
			before := snapshot(t, e.inst.Root)
			if _, err := e.dep.AutoDeploy(ctx, e.inst.ID); err == nil {
				e.dep.Wait()
			}
			if d := diffSnapshots(before, snapshot(t, e.inst.Root)); len(d) != 0 {
				t.Fatalf("auto-deploy wrote across volumes without consent: %v", d)
			}
			op, err := e.dep.Deploy(ctx, e.inst.ID)
			if err != nil {
				t.Fatal(err)
			}
			v := e.waitDeployDecision(op)
			if len(v.Fallbacks) == 0 || v.Fallbacks[0].To != game.MethodCopy {
				t.Fatalf("decision = %+v", v)
			}
			if err := e.dep.ResolveDecision(e.inst.ID, op, []string{v.Fallbacks[0].Key}, nil); err != nil {
				t.Fatal(err)
			}
			e.dep.Wait()
			if o := e.op(op); o.Status != operation.StatusSucceeded {
				t.Fatalf("deploy with copies: %+v", o.Error)
			}
			if fileID(t, e.data("Alpha.esp")) == fileID(t, e.staged(ids[0], "Alpha.esp")) || readFile(t, e.data("Alpha.esp")) != "alpha plugin" {
				t.Fatal("the game got copies")
			}
			if o := e.deploy(deploysvc.KindPurge); o.Status != operation.StatusSucceeded {
				t.Fatalf("purge: %+v", o.Error)
			}
			if d := diffSnapshots(original, snapshot(t, e.inst.Root)); len(d) != 0 {
				t.Fatalf("original game: %v", d)
			}
		})
	}
}

// Paths past MAX_PATH (260) import, deploy with hardlinks and purge (D039;
// the app adds the \\?\ prefix itself).
func TestLongPaths(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	original := snapshot(t, e.inst.Root)
	seg := strings.Repeat("d", 90)
	rel := "meshes/" + seg + "1/" + seg + "2/" + seg + "3/long.nif"
	ids := e.installFiles(map[string][]string{"Long": {rel, "long"}}, "Long")
	if n := len(e.data(rel)); n <= 260 {
		t.Fatalf("path is only %d characters", n)
	}
	if o := e.deploy(deploysvc.KindDeploy); o.Status != operation.StatusSucceeded {
		t.Fatalf("deploy: %+v", o.Error)
	}
	e.wantStatus(deploystate.InSync)
	got, err := os.ReadFile(`\\?\` + e.data(rel))
	if err != nil || string(got) != "long" {
		t.Fatalf("deployed long path: %q %v", got, err)
	}
	if files := e.files(ids[0]); len(files) != 1 {
		t.Fatalf("files = %v", files)
	}
	if o := e.deploy(deploysvc.KindPurge); o.Status != operation.StatusSucceeded {
		t.Fatalf("purge: %+v", o.Error)
	}
	if d := diffSnapshots(original, snapshot(t, e.inst.Root)); len(d) != 0 {
		t.Fatalf("original game: %v", d)
	}
}
