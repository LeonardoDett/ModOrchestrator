package integration_test

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"image/png"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	pluginsvc "modorchestrator/internal/core/application/plugins"
	savesvc "modorchestrator/internal/core/application/saves"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
)

// savesPlugins is the bootstrap's bridge between the two modules.
type savesPlugins struct{ p *pluginsvc.Service }

func (a savesPlugins) Presence(ctx context.Context, instance game.InstanceID, names []string) (map[string]savesvc.PluginPresence, error) {
	pres, ok, err := a.p.PresenceOf(ctx, instance, names)
	if err != nil || !ok {
		return nil, err
	}
	out := map[string]savesvc.PluginPresence{}
	for k, v := range pres {
		out[k] = savesvc.PluginPresence{Present: v.Present, Active: v.Active, Mods: v.Mods}
	}
	return out, nil
}

func (a savesPlugins) Enable(ctx context.Context, instance game.InstanceID, names []string) error {
	return a.p.EnableNames(ctx, instance, names)
}

func (e *env) myGames(parts ...string) string {
	return filepath.Join(append([]string{e.dir, "Documents", "My Games", "Skyrim Special Edition"}, parts...)...)
}

func (e *env) customINI() string { return e.myGames("SkyrimCustom.ini") }

func (e *env) readINI() string {
	e.t.Helper()
	b, err := os.ReadFile(e.customINI())
	if errors.Is(err, os.ErrNotExist) {
		return ""
	}
	if err != nil {
		e.t.Fatal(err)
	}
	return string(b)
}

func (e *env) deployOK() {
	e.t.Helper()
	if op := e.deploy("deploy"); op.Status != operation.StatusSucceeded {
		e.t.Fatalf("deploy: %+v", op)
	}
}

// essFile is a minimal uncompressed save of Skyrim SE (format 12) using
// the given plugins, with a 1×1 screenshot.
func essFile(character string, plugins ...string) string {
	var hdr, out bytes.Buffer
	le := func(b *bytes.Buffer, v any) { _ = binary.Write(b, binary.LittleEndian, v) }
	ws := func(b *bytes.Buffer, s string) { le(b, uint16(len(s))); b.WriteString(s) }
	le(&hdr, uint32(12))
	le(&hdr, uint32(7))
	ws(&hdr, character)
	le(&hdr, uint32(12))
	ws(&hdr, "Riverwood")
	ws(&hdr, "Day 3")
	ws(&hdr, "NordRace")
	le(&hdr, uint16(0))
	le(&hdr, float32(0))
	le(&hdr, float32(0))
	le(&hdr, uint64(0))
	le(&hdr, uint32(1))
	le(&hdr, uint32(1))
	le(&hdr, uint16(0))
	out.WriteString("TESV_SAVEGAME")
	le(&out, uint32(hdr.Len()))
	out.Write(hdr.Bytes())
	out.Write([]byte{1, 2, 3, 4})
	out.WriteByte(78)
	le(&out, uint32(0))
	out.WriteByte(byte(len(plugins)))
	for _, p := range plugins {
		ws(&out, p)
	}
	le(&out, uint16(0))
	return out.String()
}

// core/07 §4 step 6 and §7: the game saves in the folder of the profile in
// the game folder; the key changes in the post step of the deploy, only
// that line of the file changes, and a purge gives the key back.
func TestSaveFolderFollowsTheDeployedProfile(t *testing.T) {
	e := pluginEnv(t)
	e.write(e.customINI(), "[Display]\r\nfGamma=1.2\r\n")
	e.deployOK()
	if got := e.readINI(); got != "[Display]\r\nfGamma=1.2\r\n" {
		t.Fatalf("a profile without saves of its own changes nothing: %q", got)
	}
	a := e.active()
	if err := e.saves.SetLocalSaves(ctx, a.ID(), true); err != nil {
		t.Fatal(err)
	}
	want := "[Display]\r\nfGamma=1.2\r\n[General]\r\nSLocalSavePath=Saves\\" + string(a.ID()) + "\\\r\n"
	if got := e.readINI(); got != want {
		t.Fatalf("deployed profile turned on: %q", got)
	}
	if _, err := os.Stat(filepath.Join(e.dir, "mo", "backups", "game_settings", "SkyrimCustom.ini")); err != nil {
		t.Fatalf("the file found before the first write is kept: %v", err)
	}

	bID, err := e.prof.Create(ctx, e.inst.ID, "B", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := e.prof.Activate(ctx, bID); err != nil {
		t.Fatal(err)
	}
	if got := e.readINI(); got != want {
		t.Fatalf("activating never changes the key before the deploy: %q", got)
	}
	e.deployOK()
	if got := e.readINI(); got != "[Display]\r\nfGamma=1.2\r\n[General]\r\n" {
		t.Fatalf("a profile with shared saves gets the original key (absent): %q", got)
	}
	if err := e.prof.Activate(ctx, a.ID()); err != nil {
		t.Fatal(err)
	}
	e.deployOK()
	if got := e.readINI(); !strings.Contains(got, `SLocalSavePath=Saves\`+string(a.ID())+`\`) {
		t.Fatalf("back to A: %q", got)
	}
	if op := e.deploy("purge"); op.Status != operation.StatusSucceeded {
		t.Fatalf("purge: %+v", op)
	}
	if got := e.readINI(); strings.Contains(got, "SLocalSavePath") {
		t.Fatalf("purge gives the key back: %q", got)
	}
}

// D008 for the save key: a value written outside the app is not overwritten
// by a deploy; the diagnostic asks, and its action applies the profile's.
func TestSaveKeyChangedOutsideNeedsTriage(t *testing.T) {
	e := pluginEnv(t)
	e.deployOK()
	a := e.active()
	if err := e.saves.SetLocalSaves(ctx, a.ID(), true); err != nil {
		t.Fatal(err)
	}
	e.write(e.customINI(), "[General]\r\nSLocalSavePath=Saves\\Other\\\r\n")
	ids := e.installFiles(map[string][]string{"A": {"meshes/a.nif", "a"}}, "A")
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids, true); err != nil {
		t.Fatal(err)
	}
	e.deployOK()
	if got := e.readINI(); !strings.Contains(got, `Saves\Other\`) {
		t.Fatalf("the external value was overwritten: %q", got)
	}
	it, ok := e.problem(diagnostic.CodeSavePathExternal)
	if !ok {
		t.Fatalf("no save_path_external: %+v", e.problems())
	}
	if err := e.saves.Execute(ctx, e.inst.ID, diagnostic.Action{ID: savesvc.ActionApplyPath}); err != nil {
		t.Fatal(err)
	}
	_ = it
	if got := e.readINI(); !strings.Contains(got, `SLocalSavePath=Saves\`+string(a.ID())+`\`) {
		t.Fatalf("apply path: %q", got)
	}
	if d, _ := e.saves.Diagnostics(ctx, e.inst.ID); len(d) != 0 {
		t.Fatalf("solved: %v", d)
	}
	if entries, _ := os.ReadDir(filepath.Join(e.dir, "mo", "backups", "game_settings")); len(entries) != 1 {
		t.Fatalf("the external version is kept: %v", entries)
	}
}

func TestSavesListMissingPluginsTransferDeleteAndClone(t *testing.T) {
	e := pluginEnv(t)
	lantern := e.installFiles(map[string][]string{"Lanterns": {"Lanterns.esp", string(tes4(0))}}, "Lanterns")[0]
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{lantern}, false); err != nil {
		t.Fatal(err)
	}
	e.deployOK()
	a := e.active()
	if err := e.saves.SetLocalSaves(ctx, a.ID(), true); err != nil {
		t.Fatal(err)
	}
	dirA := e.myGames("Saves", string(a.ID()))
	e.write(filepath.Join(dirA, "Save7_Ysolda.ess"), essFile("Ysolda", "Skyrim.esm", "Lanterns.esp", "Gold.esp"))
	e.write(filepath.Join(dirA, "Save7_Ysolda.skse"), "co-save")
	e.write(filepath.Join(dirA, "notes.txt"), "not a save")

	ls, err := e.saves.List(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !ls.Local || ls.Profile != a.ID() || len(ls.Saves) != 1 || !ls.PluginsChecked {
		t.Fatalf("listing %+v", ls)
	}
	sv := ls.Saves[0]
	if sv.Header == nil || sv.Header.Character != "Ysolda" || !sv.HasScreenshot || !slices.Equal(sv.Companions, []string{"Save7_Ysolda.skse"}) {
		t.Fatalf("save %+v", sv)
	}
	if len(sv.Missing) != 2 || sv.Missing[0].Name != "Lanterns.esp" || len(sv.Missing[0].Mods) != 1 || sv.Missing[0].Mods[0].ID != lantern || len(sv.Missing[1].Mods) != 0 {
		t.Fatalf("missing %+v", sv.Missing)
	}
	png1, err := e.saves.Screenshot(ctx, e.inst.ID, sv.Name)
	if err != nil {
		t.Fatal(err)
	}
	if img, err := png.Decode(bytes.NewReader(png1)); err != nil || img.Bounds().Dx() != 1 {
		t.Fatalf("screenshot: %v", err)
	}

	res, err := e.saves.EnableProviders(ctx, e.inst.ID, sv.Name)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Mods) != 1 || !slices.Equal(res.Absent, []string{"Gold.esp"}) {
		t.Fatalf("enable providers %+v", res)
	}
	ls, _ = e.saves.List(ctx, e.inst.ID)
	if m := ls.Saves[0].Missing; len(m) != 1 || m[0].Name != "Gold.esp" {
		t.Fatalf("after enabling: %+v", m)
	}

	// Copy to a profile with shared saves: the shared folder, never replacing.
	bID, err := e.prof.Create(ctx, e.inst.ID, "B", "")
	if err != nil {
		t.Fatal(err)
	}
	shared := e.myGames("Saves")
	e.write(filepath.Join(shared, "Save7_Ysolda.ess"), "older save of the shared folder")
	plan, err := e.saves.PreviewTransfer(ctx, e.inst.ID, []string{sv.Name}, bID)
	if err != nil || plan.Renamed[sv.Name] != "Save7_Ysolda (2).ess" {
		t.Fatalf("preview %+v %v", plan, err)
	}
	if _, err := e.saves.Transfer(ctx, e.inst.ID, []string{sv.Name}, bID, false); err != nil {
		t.Fatal(err)
	}
	for _, f := range []string{"Save7_Ysolda.ess", "Save7_Ysolda (2).ess", "Save7_Ysolda (2).skse"} {
		if _, err := os.Stat(filepath.Join(shared, f)); err != nil {
			t.Fatalf("%s: %v", f, err)
		}
	}
	if b, _ := os.ReadFile(filepath.Join(shared, "Save7_Ysolda.ess")); string(b) != "older save of the shared folder" {
		t.Fatal("a save of the destination was replaced")
	}
	if _, err := e.saves.Transfer(ctx, e.inst.ID, []string{"../x.ess"}, bID, false); err == nil {
		t.Fatal("a path outside the folder was accepted")
	}

	// Clone with saves: the clone gets its own folder with a copy.
	opts, err := e.prof.CopyOptions(ctx, a.ID())
	if err != nil || len(opts) != 1 || opts[0].ID != "saves" || opts[0].Files != 1 {
		t.Fatalf("copy options %+v %v", opts, err)
	}
	cID, err := e.prof.Clone(ctx, e.inst.ID, "A2", a.ID(), []string{"saves"})
	if err != nil {
		t.Fatal(err)
	}
	if !e.profile(cID).Features().LocalSaves {
		t.Fatal("the clone keeps saves of its own")
	}
	if _, err := os.Stat(e.myGames("Saves", string(cID), "Save7_Ysolda.skse")); err != nil {
		t.Fatalf("clone copy: %v", err)
	}
	if opts, _ := e.prof.CopyOptions(ctx, bID); len(opts) != 0 {
		t.Fatalf("a profile with shared saves has nothing to copy: %+v", opts)
	}

	// Move then delete.
	if _, err := e.saves.Transfer(ctx, e.inst.ID, []string{sv.Name}, cID, true); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dirA, sv.Name)); !os.IsNotExist(err) {
		t.Fatalf("moved save still there: %v", err)
	}
	if err := e.prof.Activate(ctx, cID); err != nil {
		t.Fatal(err)
	}
	ls, _ = e.saves.List(ctx, e.inst.ID)
	var names []string
	for _, s := range ls.Saves {
		names = append(names, s.Name)
	}
	if len(names) != 2 {
		t.Fatalf("clone folder: %v", names)
	}
	if err := e.saves.Delete(ctx, e.inst.ID, names); err != nil {
		t.Fatal(err)
	}
	// The clone copied the whole folder; only what is not a save remains.
	if entries, _ := os.ReadDir(e.myGames("Saves", string(cID))); len(entries) != 1 || entries[0].Name() != "notes.txt" {
		t.Fatalf("delete removes the companions too: %v", entries)
	}
}

// D112: a game without save_games gets nothing from the module.
func TestGameWithoutSavesIsLeftAlone(t *testing.T) {
	e := newEnvWith(t, envOptions{generic: true})
	e.deployOK()
	if e.saves.Supported(ctx, e.inst.ID) {
		t.Fatal("generic game has no saves")
	}
	if _, err := e.saves.List(ctx, e.inst.ID); codeOf(err) != savesvc.CodeUnsupported {
		t.Fatalf("list: %v", err)
	}
	if err := e.saves.SetLocalSaves(ctx, e.active().ID(), true); codeOf(err) != savesvc.CodeUnsupported {
		t.Fatalf("set: %v", err)
	}
	if d, err := e.saves.Diagnostics(ctx, e.inst.ID); err != nil || len(d) != 0 {
		t.Fatalf("diagnostics %v %v", d, err)
	}
	if opts, err := e.prof.CopyOptions(ctx, e.active().ID()); err != nil || len(opts) != 0 {
		t.Fatalf("copy options %v %v", opts, err)
	}
	if _, err := os.Stat(filepath.Join(e.dir, "Documents")); !os.IsNotExist(err) {
		t.Fatalf("nothing is written in the Documents folder: %v", err)
	}
}
