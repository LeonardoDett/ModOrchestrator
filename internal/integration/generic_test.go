package integration_test

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/imports"
	pluginsvc "modorchestrator/internal/core/application/plugins"
	"modorchestrator/internal/core/domain/migration"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/plugin"
)

// D112: a game without a process is the normal case. With the generic
// adapter (no plugins, no load order) the common flow works end to end and
// every plugin command answers with the stable "unsupported" code, never
// with an unmapped error.
func TestGameWithoutPluginsWorksAndAnswersUnsupported(t *testing.T) {
	e := newEnvWith(t, envOptions{generic: true})

	w, err := e.games.Workspace(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if slices.Contains(w.Items, games.ItemPlugins) || slices.Contains(w.Items, games.ItemLoadOrder) {
		t.Fatalf("workspace of a game without plugins: %v", w.Items)
	}

	// Import, enable and deploy: the post step has no load order to write.
	ids := e.installFiles(map[string][]string{"A": {"a.txt", "a"}}, "A")
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids, true); err != nil {
		t.Fatal(err)
	}
	if op := e.deploy("deploy"); op.Status != operation.StatusSucceeded {
		t.Fatalf("deploy: %+v", op)
	}
	if _, err := os.Stat(filepath.Join(e.dir, "Game", "Mods", "a.txt")); err != nil {
		t.Fatalf("deployed file: %v", err)
	}
	if _, err := os.Stat(filepath.Join(e.dir, "LocalAppData")); !os.IsNotExist(err) {
		t.Fatalf("no load order file may be written for a game without the capability: %v", err)
	}

	if e.plug.Supported(ctx, e.inst.ID) {
		t.Fatal("plugins must be unsupported")
	}
	if d, err := e.plug.Diagnostics(ctx, e.inst.ID); err != nil || len(d) != 0 {
		t.Fatalf("plugin diagnostics of a game without plugins: %v %v", d, err)
	}
	if _, err := e.diag.Refresh(ctx, e.inst.ID); err != nil {
		t.Fatalf("diagnostics refresh: %v", err)
	}

	id, name := e.inst.ID, []plugin.Name{"x"}
	commands := map[string]func() error{
		"List":           func() error { _, err := e.plug.List(ctx, id); return err },
		"Details":        func() error { _, err := e.plug.Details(ctx, id, "x"); return err },
		"RulesAndGroups": func() error { _, err := e.plug.RulesAndGroups(ctx, id); return err },
		"LoadOrder":      func() error { _, err := e.plug.LoadOrder(ctx, id); return err },
		"Explain":        func() error { _, err := e.plug.Explain(ctx, id, "x"); return err },
		"DiffApplied":    func() error { _, err := e.plug.DiffApplied(ctx, id); return err },
		"SortPreview":    func() error { _, err := e.plug.SortPreview(ctx, id); return err },
		"Export":         func() error { _, err := e.plug.Export(ctx, id); return err },
		"Sync":           func() error { return e.plug.Sync(ctx, id) },
		"SetEnabled":     func() error { return e.plug.SetPluginsEnabled(ctx, id, name, true) },
		"Sort":           func() error { _, err := e.plug.SortPlugins(ctx, id); return err },
		"UndoLastSort":   func() error { return e.plug.UndoLastSort(ctx, id) },
		"Move":           func() error { _, err := e.plug.MovePlugins(ctx, id, name, 0); return err },
		"SetIndexLock":   func() error { return e.plug.SetIndexLock(ctx, id, name, true) },
		"CreateRule":     func() error { return e.plug.CreatePluginRule(ctx, id, "x", "y") },
		"SaveGroup":      func() error { return e.plug.SaveGroup(ctx, id, "g", nil, true) },
		"SetGroup":       func() error { return e.plug.SetPluginGroup(ctx, id, name, plugin.DefaultGroup) },
		"Apply":          func() error { _, err := e.plug.ApplyLoadOrder(ctx, id); return err },
		"Import":         func() error { _, err := e.plug.ImportLoadOrder(ctx, id, "x"); return err },
		"RestorePrev":    func() error { _, err := e.plug.RestorePreviousLoadOrder(ctx, id); return err },
		"ResolveExternal": func() error {
			_, err := e.plug.ResolveExternalChange(ctx, id, pluginsvc.ResolveRestore)
			return err
		},
	}
	for cmd, run := range commands {
		var perr *pluginsvc.Error
		if err := run(); !errors.As(err, &perr) || perr.Code() != pluginsvc.CodeNoPlugins {
			t.Errorf("%s on a game without plugins: want %s, got %v", cmd, pluginsvc.CodeNoPlugins, err)
		}
	}
	// Commands the redesign added (RD5–RD17) answer a game without plugins
	// with a result or a coded error, never an unmapped ("internal") one.
	other := map[string]func() error{
		"TagList":      func() error { _, err := e.lib.TagList(ctx, id); return err },
		"CategoryList": func() error { _, err := e.lib.CategoryList(ctx, id); return err },
		"ModListText":  func() error { _, err := e.lib.ModListText(ctx, id); return err },
		"ModFlags":     func() error { _, err := e.diag.ModFlags(ctx, id); return err },
		"Features":     func() error { _, err := e.games.Features(ctx, id); return err },
		"ProfileList":  func() error { _, err := e.prof.List(ctx, id); return err },
		"Pairs":        func() error { _, err := e.conf.Pairs(ctx, id, false, ""); return err },
		"ModConflicts": func() error { _, err := e.conf.ModConflicts(ctx, id, ids[0]); return err },
		"ImportSources": func() error {
			_, err := e.imp.Sources(ctx, id)
			return err
		},
		"ImportPreview": func() error {
			_, err := e.imp.Preview(ctx, id, migration.Source{Manager: "nobody", Path: e.dir})
			var ierr *imports.Error
			if errors.As(err, &ierr) && ierr.Code() == imports.CodeSourceUnknown {
				return nil
			}
			return err
		},
	}
	for cmd, run := range other {
		if err := run(); err != nil {
			t.Errorf("%s on a game without plugins: %v", cmd, err)
		}
	}
	if text, err := e.lib.ModListText(ctx, id); err != nil || !strings.Contains(text, "[x] A") {
		t.Errorf("mod list text: %q %v", text, err)
	}

	// The lock is released by every refused command.
	if holder, busy := instancelockHolder(e); busy {
		t.Fatalf("instance left locked by %s", holder)
	}
}
