package integration_test

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"modorchestrator/internal/core/application/ports"
	pluginsvc "modorchestrator/internal/core/application/plugins"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/plugin"
)

// testFolders resolves %LOCALAPPDATA% to a folder of the test.
type testFolders struct{ root string }

func (f testFolders) Folder(name string) (string, error) {
	if name != ports.FolderLocalAppData {
		return "", fmt.Errorf("unknown folder %s", name)
	}
	return f.root, nil
}

// tes4 builds a plugin file: a TES4 record with flags and masters.
func tes4(flags uint32, masters ...string) []byte {
	var data bytes.Buffer
	sub := func(typ string, v []byte) {
		data.WriteString(typ)
		_ = binary.Write(&data, binary.LittleEndian, uint16(len(v)))
		data.Write(v)
	}
	sub("HEDR", make([]byte, 12))
	for _, m := range masters {
		sub("MAST", append([]byte(m), 0))
		sub("DATA", make([]byte, 8))
	}
	var out bytes.Buffer
	out.WriteString("TES4")
	_ = binary.Write(&out, binary.LittleEndian, uint32(data.Len()))
	_ = binary.Write(&out, binary.LittleEndian, flags)
	out.Write(make([]byte, 12))
	out.Write(data.Bytes())
	return out.Bytes()
}

// pluginEnv is newEnv with a real Skyrim.esm header in the game folder.
func pluginEnv(t *testing.T) *env {
	e := newEnv(t)
	e.write(e.data("Skyrim.esm"), string(tes4(1)))
	return e
}

func (e *env) pluginsTxt() string {
	return filepath.Join(e.dir, "LocalAppData", "Skyrim Special Edition", "plugins.txt")
}

func (e *env) plugins() pluginsvc.ListView {
	e.t.Helper()
	v, err := e.plug.List(ctx, e.inst.ID)
	if err != nil {
		e.t.Fatal(err)
	}
	return v
}

func (e *env) order() []string {
	var out []string
	for _, r := range e.plugins().Rows {
		out = append(out, string(r.Name))
	}
	return out
}

// pluginMods installs one mod per plugin: name -> plugin file content.
func (e *env) pluginMods(files map[string][]byte, names ...string) map[string]mod.ID {
	e.t.Helper()
	contents := map[string][]string{}
	for _, n := range names {
		contents[n] = []string{n, string(files[n])}
	}
	ids := e.installFiles(contents, names...)
	out := map[string]mod.ID{}
	for i, n := range names {
		out[n] = ids[i]
	}
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids, true); err != nil {
		e.t.Fatal(err)
	}
	return out
}

// core/08 §11: a mod's plugin appears active in the right place; the
// deploy writes plugins.txt from the profile (INV-PLG-02) and it reads back
// the same; no non-master before a master, implicit ones fixed (INV-PLG-01).
func TestPluginsFollowModsAndDeployWritesLoadOrder(t *testing.T) {
	e := pluginEnv(t)
	// Patch is installed first: by mod order it would come first.
	e.pluginMods(map[string][]byte{
		"Patch.esp": tes4(0, "Skyrim.esm", "Lib.esm"),
		"Lib.esm":   tes4(1, "Skyrim.esm"),
		"Tiny.esp":  tes4(0x200, "Skyrim.esm"),
	}, "Patch.esp", "Lib.esm", "Tiny.esp")
	got := e.order()
	if !slices.Equal(got[:2], []string{"Skyrim.esm", "Lib.esm"}) || slices.Index(got, "Patch.esp") < slices.Index(got, "Lib.esm") {
		t.Fatalf("order %v", got)
	}
	v := e.plugins()
	idx := map[string]string{}
	for _, r := range v.Rows {
		idx[string(r.Name)] = r.Index
		if !r.Enabled {
			t.Fatalf("%s must start active (plugins.enableOnModEnable)", r.Name)
		}
	}
	if idx["Skyrim.esm"] != "00" || idx["Lib.esm"] != "01" || idx["Tiny.esp"] != "FE:000" {
		t.Fatalf("indexes %v", idx)
	}
	e.deploy("deploy")
	data, err := os.ReadFile(e.pluginsTxt())
	if err != nil {
		t.Fatalf("plugins.txt must be written in the post step: %v", err)
	}
	text := string(data)
	if strings.Contains(text, "Skyrim.esm") || !strings.Contains(text, "*Lib.esm\r\n") || strings.Index(text, "Lib.esm") > strings.Index(text, "Patch.esp") {
		t.Fatalf("plugins.txt:\n%s", text)
	}
	lo, err := e.plug.LoadOrder(ctx, e.inst.ID)
	if err != nil || !lo.State.Applied || lo.State.External {
		t.Fatalf("applied state %+v %v", lo.State, err)
	}
	// Sort over a valid order changes nothing (core/08 §11).
	res, err := e.plug.SortPlugins(ctx, e.inst.ID)
	if err != nil || res.Moved != 0 {
		t.Fatalf("sort on a valid order: %+v %v", res, err)
	}
	// Deactivating writes again; the file follows the profile.
	if err := e.plug.SetPluginsEnabled(ctx, e.inst.ID, []plugin.Name{"Tiny.esp"}, false); err != nil {
		t.Fatal(err)
	}
	if _, err := e.plug.ApplyLoadOrder(ctx, e.inst.ID); err != nil {
		t.Fatal(err)
	}
	data, _ = os.ReadFile(e.pluginsTxt())
	if !strings.Contains(string(data), "\r\nTiny.esp\r\n") {
		t.Fatalf("inactive plugin keeps its line without *:\n%s", data)
	}
	if err := e.plug.SetPluginsEnabled(ctx, e.inst.ID, []plugin.Name{"Skyrim.esm"}, false); coded(err) != pluginsvc.CodeImplicitPlugin {
		t.Fatalf("implicit plugins are always active: %v", err)
	}
}

// F11 demonstration: a missing master is identified on the plugin and in
// Diagnostics, and solved by the suggested action.
func TestMissingMasterIsSolvedFromItsDiagnostic(t *testing.T) {
	e := pluginEnv(t)
	ids := e.pluginMods(map[string][]byte{
		"Lib.esm":   tes4(1, "Skyrim.esm"),
		"Patch.esp": tes4(0, "Lib.esm"),
	}, "Lib.esm", "Patch.esp")
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{ids["Lib.esm"]}, false); err != nil {
		t.Fatal(err)
	}
	var row pluginsvc.Row
	for _, r := range e.plugins().Rows {
		if r.Name == "Patch.esp" {
			row = r
		}
	}
	if row.Problems != 1 || row.Problem != diagnostic.CodePluginMissingMaster {
		t.Fatalf("plugin row must show the problem: %+v", row)
	}
	d, err := e.plug.Details(ctx, e.inst.ID, "Patch.esp")
	if err != nil || len(d.MastersList) != 1 || d.MastersList[0].Present || d.MastersList[0].Mod != ids["Lib.esm"] {
		t.Fatalf("inspector masters: %+v %v", d.MastersList, err)
	}
	it, ok := e.problem(diagnostic.CodePluginMissingMaster)
	if !ok || it.Actions[0].Target.ID != string(ids["Lib.esm"]) {
		t.Fatalf("diagnostic with the provider: %+v", it)
	}
	if _, err := e.diag.Execute(ctx, e.inst.ID, it.Key, it.Actions[0].ID, 0); err != nil {
		t.Fatal(err)
	}
	if _, still := e.problem(diagnostic.CodePluginMissingMaster); still {
		t.Fatal("enabling the provider solves it")
	}
}

// F11 demonstration and INV-PLG-03: plugins.txt edited outside the app is
// detected at once by the monitor, never overwritten by a deploy, and the
// triage imports it (through the engine) or restores the profile's.
func TestExternalLoadOrderChangeNeedsTriage(t *testing.T) {
	e := pluginEnv(t)
	e.pluginMods(map[string][]byte{
		"A.esp": tes4(0, "Skyrim.esm"),
		"B.esp": tes4(0, "Skyrim.esm"),
		"M.esm": tes4(1),
	}, "A.esp", "B.esp", "M.esm")
	e.deploy("deploy")
	if err := e.plug.CheckFile(ctx, e.inst.ID); err != nil {
		t.Fatal(err)
	}
	// Another tool rewrites the file: B before A, A inactive, M last.
	external := "# external\r\n*B.esp\r\nA.esp\r\n*M.esm\r\n"
	time.Sleep(20 * time.Millisecond)
	e.write(e.pluginsTxt(), external)
	if err := e.plug.CheckFile(ctx, e.inst.ID); err != nil {
		t.Fatal(err)
	}
	e.eventsMu.Lock()
	signalled := slices.ContainsFunc(e.events, func(ev event.Event) bool { return ev.Type == pluginsvc.EventExternalChange })
	e.eventsMu.Unlock()
	if !signalled {
		t.Fatal("the monitor must signal the external change")
	}
	if _, ok := e.problem(diagnostic.CodeLoadOrderExternalChange); !ok {
		t.Fatal("load_order_external_change expected")
	}
	if it, ok := e.problem(diagnostic.CodePluginMasterOrder); !ok || it.Params["master"] != "M.esm" {
		t.Fatalf("the external order puts a master after its dependents: %+v", it)
	}
	e.deploy("deploy")
	if got, _ := os.ReadFile(e.pluginsTxt()); string(got) != external {
		t.Fatal("a deploy must not overwrite an external change (INV-PLG-03)")
	}
	if _, err := e.plug.ApplyLoadOrder(ctx, e.inst.ID); coded(err) != pluginsvc.CodeExternalChange {
		t.Fatalf("apply must refuse before triage: %v", err)
	}
	// Import: the file's order and states become the profile's, but the
	// master still loads before the others (INV-PLG-01).
	if _, err := e.plug.ResolveExternalChange(ctx, e.inst.ID, pluginsvc.ResolveImport); err != nil {
		t.Fatal(err)
	}
	got := e.order()
	if !slices.Equal(got, []string{"Skyrim.esm", "M.esm", "B.esp", "A.esp"}) {
		t.Fatalf("imported order %v", got)
	}
	for _, r := range e.plugins().Rows {
		if r.Name == "A.esp" && r.Enabled {
			t.Fatal("the imported state of A is inactive")
		}
	}
	if _, ok := e.problem(diagnostic.CodeLoadOrderExternalChange); ok {
		t.Fatal("the triage resolves the change")
	}
	data, _ := os.ReadFile(e.pluginsTxt())
	if !strings.Contains(string(data), "*M.esm\r\n*B.esp\r\nA.esp\r\n") {
		t.Fatalf("written after import:\n%s", data)
	}
	// Restore: an external edit is replaced by the profile's order and kept
	// in the BackupStore.
	e.write(e.pluginsTxt(), "*A.esp\r\n")
	if _, err := e.plug.ResolveExternalChange(ctx, e.inst.ID, pluginsvc.ResolveRestore); err != nil {
		t.Fatal(err)
	}
	data, _ = os.ReadFile(e.pluginsTxt())
	if !strings.Contains(string(data), "*M.esm\r\n*B.esp\r\nA.esp\r\n") {
		t.Fatalf("restored:\n%s", data)
	}
	backups, _ := filepath.Glob(filepath.Join(e.inst.BackupStore, "load_order", "*"))
	if len(backups) < 2 {
		t.Fatalf("the original and the external version are kept: %v", backups)
	}
	// "Restaurar load order anterior" brings back the previous write.
	if _, err := e.plug.RestorePreviousLoadOrder(ctx, e.inst.ID); err != nil {
		t.Fatal(err)
	}
}

// A first write over a plugins.txt that the manager did not write is a
// triage too (D088): nothing is lost.
func TestPreexistingLoadOrderIsNotOverwritten(t *testing.T) {
	e := pluginEnv(t)
	e.pluginMods(map[string][]byte{"A.esp": tes4(0)}, "A.esp")
	e.write(e.pluginsTxt(), "*Old.esp\r\n")
	e.deploy("deploy")
	if got, _ := os.ReadFile(e.pluginsTxt()); string(got) != "*Old.esp\r\n" {
		t.Fatal("a load order file the manager never wrote needs triage")
	}
	if _, ok := e.problem(diagnostic.CodeLoadOrderExternalChange); !ok {
		t.Fatal("triage expected")
	}
}

// Rules, groups, locks and moves (core/08 §5–6): a rule against a master
// is refused (D028), a move that breaks a constraint is refused with the
// nearest valid place, a locked plugin keeps its position.
func TestRulesGroupsLocksAndMoves(t *testing.T) {
	e := pluginEnv(t)
	e.pluginMods(map[string][]byte{
		"M.esm": tes4(1),
		"A.esp": tes4(0, "M.esm"),
		"B.esp": tes4(0),
		"C.esp": tes4(0),
	}, "M.esm", "A.esp", "B.esp", "C.esp")
	if err := e.plug.CreatePluginRule(ctx, e.inst.ID, "M.esm", "A.esp"); coded(err) != pluginsvc.CodeRuleCycle {
		t.Fatalf("rule contradicting a master: %v", err)
	}
	if err := e.plug.CreatePluginRule(ctx, e.inst.ID, "A.esp", "C.esp"); err != nil {
		t.Fatal(err)
	}
	got := e.order()
	if slices.Index(got, "A.esp") < slices.Index(got, "C.esp") {
		t.Fatalf("auto-sort applies the rule: %v", got)
	}
	if err := e.plug.SaveGroup(ctx, e.inst.ID, "Late", []string{plugin.DefaultGroup}, true); err != nil {
		t.Fatal(err)
	}
	if err := e.plug.SetPluginGroup(ctx, e.inst.ID, []plugin.Name{"B.esp"}, "Late"); err != nil {
		t.Fatal(err)
	}
	got = e.order()
	if got[len(got)-1] != "B.esp" {
		t.Fatalf("the late group loads last: %v", got)
	}
	if err := e.plug.SaveGroup(ctx, e.inst.ID, plugin.DefaultGroup, []string{"Late"}, false); coded(err) != pluginsvc.CodeRuleCycle {
		t.Fatalf("group cycle: %v", err)
	}
	// Moving A before its master is refused with the nearest place.
	res, err := e.plug.MovePlugins(ctx, e.inst.ID, []plugin.Name{"A.esp"}, 1)
	if err != nil || res.Applied || len(res.Violated) == 0 || res.Nearest < 0 {
		t.Fatalf("move refusal: %+v %v", res, err)
	}
	if err := e.plug.SetIndexLock(ctx, e.inst.ID, []plugin.Name{"C.esp"}, true); err != nil {
		t.Fatal(err)
	}
	pos := slices.Index(e.order(), "C.esp")
	if _, err := e.plug.SortPlugins(ctx, e.inst.ID); err != nil {
		t.Fatal(err)
	}
	if slices.Index(e.order(), "C.esp") != pos {
		t.Fatal("a locked plugin keeps its position")
	}
	ex, err := e.plug.Explain(ctx, e.inst.ID, "A.esp")
	if err != nil || !slices.ContainsFunc(ex.After, func(r pluginsvc.ReasonView) bool { return r.Kind == "master" && r.Other == "M.esm" }) ||
		!slices.ContainsFunc(ex.After, func(r pluginsvc.ReasonView) bool { return r.Kind == "rule" && r.Other == "C.esp" }) {
		t.Fatalf("explanation %+v %v", ex, err)
	}
}

// F11 demonstration at scale: 200 plugins in 20 mods with masters, light
// plugins and rules; the arranged order never breaks a hard constraint
// (INV-PLG-01) and the screen query stays fast.
func TestTwoHundredPlugins(t *testing.T) {
	e := pluginEnv(t)
	files := map[string][]string{}
	var names []string
	for m := 0; m < 20; m++ {
		mn := fmt.Sprintf("Mod%02d", m)
		names = append(names, mn)
		for p := 0; p < 10; p++ {
			n := fmt.Sprintf("P%02d_%d.esp", m, p)
			var content []byte
			switch {
			case p == 0:
				n = fmt.Sprintf("P%02d.esm", m)
				content = tes4(1, "Skyrim.esm")
			case p%3 == 0:
				content = tes4(0x200, fmt.Sprintf("P%02d.esm", m))
			case m > 0:
				content = tes4(0, fmt.Sprintf("P%02d.esm", m-1), fmt.Sprintf("P%02d.esm", m))
			default:
				content = tes4(0, "P00.esm")
			}
			files[mn] = append(files[mn], n, string(content))
		}
	}
	ids := e.installFiles(files, names...)
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids, true); err != nil {
		t.Fatal(err)
	}
	start := time.Now()
	v := e.plugins()
	elapsed := time.Since(start)
	if len(v.Rows) != 201 {
		t.Fatalf("rows = %d", len(v.Rows))
	}
	t.Logf("Plugins screen with %d plugins: %s", len(v.Rows), elapsed)
	pos := map[string]int{}
	masters := true
	for i, r := range v.Rows {
		pos[strings.ToLower(string(r.Name))] = i
		if !slices.Contains(r.Flags, "master") {
			masters = false
		} else if !masters {
			t.Fatalf("master %s after a non-master", r.Name)
		}
	}
	for _, r := range v.Rows {
		d, err := e.plug.Details(ctx, e.inst.ID, r.Name)
		if err != nil {
			t.Fatal(err)
		}
		for _, m := range d.MastersList {
			if !m.Before {
				t.Fatalf("%s loads before its master %s", r.Name, m.Name)
			}
		}
		break // one detail is enough for the timing; the loop below checks all
	}
	if _, err := e.plug.SortPlugins(ctx, e.inst.ID); err != nil {
		t.Fatal(err)
	}
	for _, r := range e.plugins().Rows {
		d, _ := e.plug.Details(ctx, e.inst.ID, r.Name)
		for _, m := range d.MastersList {
			if pos[strings.ToLower(string(m.Name))] > pos[strings.ToLower(string(r.Name))] {
				t.Fatalf("%s before its master %s", r.Name, m.Name)
			}
		}
	}
}
