package integration_test

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"modorchestrator/internal/bootstrap"
	deploysvc "modorchestrator/internal/core/application/deployment"
	"modorchestrator/internal/core/domain/deploystate"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/infrastructure/appdata"
	"modorchestrator/internal/infrastructure/persistence/sqlite"
)

// TestScaleBenchmark measures the non-functional requirements of
// 00-visao-e-escopo.md (F14 "benchmarks de escala") on the real stack:
// SQLite on disk, NTFS, the extractor, the deploy engine with hardlinks.
// It is opt-in (MO_BENCH=1): the full size writes half a million files.
// MO_BENCH_MODS and MO_BENCH_FILES change the size; MO_BENCH_OUT names a
// JSON file for the report.
//
// Library: N mods, each with F files: 90% of its own, 10% from a shared
// pool (conflicts); a plugin per mod and a second one every other mod
// (3,000 plugins for 2,000 mods), most of them light (an 8% of full
// plugins stays under the 254 limit).
func TestScaleBenchmark(t *testing.T) {
	if os.Getenv("MO_BENCH") == "" {
		t.Skip("set MO_BENCH=1 (F14 benchmarks)")
	}
	mods, files := envInt("MO_BENCH_MODS", 2000), envInt("MO_BENCH_FILES", 250)
	report := map[string]any{"mods": mods, "filesPerMod": files}
	measure := func(name string, f func()) time.Duration {
		start := time.Now()
		f()
		d := time.Since(start)
		report[name+"Ms"] = d.Milliseconds()
		t.Logf("%-28s %10.1f ms", name, float64(d.Microseconds())/1000)
		return d
	}

	dir := t.TempDir()
	e := newEnvWith(t, envOptions{dir: dir, dbPath: filepath.Join(dir, "state.db"), method: game.MethodHardlink})
	e.write(e.data("Skyrim.esm"), string(tes4(1)))

	var paths []string
	measure("generateArchives", func() { paths = benchArchives(t, filepath.Join(dir, "downloads"), mods, files) })
	measure("import", func() {
		// The queue is fed in batches, as a drop of many files does.
		for i := 0; i < len(paths); i += 200 {
			if _, err := e.lib.ImportFiles(ctx, e.inst.ID, paths[i:min(i+200, len(paths))]); err != nil {
				t.Fatal(err)
			}
		}
		e.lib.Wait()
	})
	var rows []string
	measure("modList", func() {
		list, err := e.lib.ModList(ctx, e.inst.ID)
		if err != nil {
			t.Fatal(err)
		}
		for _, r := range list {
			if r.State != mod.StateInstalled {
				t.Fatalf("%s is %s", r.Name, r.State)
			}
			rows = append(rows, string(r.ID))
		}
	})
	if len(rows) != mods {
		t.Fatalf("%d mods installed of %d", len(rows), mods)
	}
	report["importFilesPerSecond"] = int(float64(mods*files) / (float64(report["importMs"].(int64)) / 1000))

	measure("conflictsCold", func() { benchIndicators(t, e) })
	pairs, err := e.conf.Pairs(ctx, e.inst.ID, false, "")
	if err != nil {
		t.Fatal(err)
	}
	report["conflictPairs"] = len(pairs.Pairs)
	one := []mod.ID{mod.ID(rows[len(rows)/2])}
	measure("disableOneMod", func() {
		if err := e.prof.SetModsEnabled(ctx, e.inst.ID, one, false); err != nil {
			t.Fatal(err)
		}
	})
	measure("conflictsAfterDisable", func() { benchIndicators(t, e) })
	measure("enableOneMod", func() {
		if err := e.prof.SetModsEnabled(ctx, e.inst.ID, one, true); err != nil {
			t.Fatal(err)
		}
	})
	measure("conflictsAfterEnable", func() { benchIndicators(t, e) })

	measure("pluginList", func() {
		v, err := e.plug.List(ctx, e.inst.ID)
		if err != nil {
			t.Fatal(err)
		}
		report["plugins"] = len(v.Rows)
	})
	measure("pluginListWarm", func() {
		if _, err := e.plug.List(ctx, e.inst.ID); err != nil {
			t.Fatal(err)
		}
	})
	measure("sortPreview", func() {
		if _, err := e.plug.SortPreview(ctx, e.inst.ID); err != nil {
			t.Fatal(err)
		}
	})

	measure("deployInitial", func() { benchDeploy(t, e, deploysvc.KindDeploy) })
	h, err := sqlite.NewManifestRepository(e.db).Header(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	report["deployedEntries"] = h.Entries
	report["hardlinksPerSecond"] = int(float64(h.Entries) / (float64(report["deployInitialMs"].(int64)) / 1000))
	e.wantStatus(deploystate.InSync)
	measure("deployNothing", func() { benchDeploy(t, e, deploysvc.KindDeploy) })
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, one, false); err != nil {
		t.Fatal(err)
	}
	measure("deployDisableOne", func() { benchDeploy(t, e, deploysvc.KindDeploy) })
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, one, true); err != nil {
		t.Fatal(err)
	}
	measure("deployEnableOne", func() { benchDeploy(t, e, deploysvc.KindDeploy) })
	e.wantStatus(deploystate.InSync)
	measure("verify", func() { e.verify() })

	// Opening the app over this database (the window waits for New and the
	// first reads of the Mods screen).
	e.auto.Close()
	e.dep.Wait()
	e.conf.Wait()
	_ = e.db.Close()
	if info, err := os.Stat(filepath.Join(dir, "state.db")); err == nil {
		report["databaseBytes"] = info.Size()
	}
	db, err := sqlite.Open(ctx, filepath.Join(dir, "state.db"))
	if err != nil {
		t.Fatal(err)
	}
	// Where the bytes are (backups copy the whole file every hour).
	if rows, err := db.QueryContext(ctx, `SELECT name, SUM(pgsize) FROM dbstat GROUP BY name ORDER BY 2 DESC LIMIT 8`); err == nil {
		sizes := map[string]int64{}
		for rows.Next() {
			var n string
			var b int64
			if rows.Scan(&n, &b) == nil {
				sizes[n] = b
			}
		}
		rows.Close()
		report["tableBytes"] = sizes
		t.Logf("table bytes: %v", sizes)
	}
	measure("integrityCheck", func() {
		if err := sqlite.CheckIntegrity(ctx, db); err != nil {
			t.Fatal(err)
		}
	})
	// Backups leave out the free pages (D138).
	backup := filepath.Join(dir, "backup.db")
	measure("backup", func() {
		if err := sqlite.NewBackups(db).Create(ctx, backup); err != nil {
			t.Fatal(err)
		}
	})
	if info, err := os.Stat(backup); err == nil {
		report["backupBytes"] = info.Size()
	}
	db.Close()
	t.Setenv(appdata.EnvDataDir, dir)
	var c *bootstrap.Container
	measure("openApp", func() {
		var err error
		if c, err = bootstrap.New(context.Background()); err != nil {
			t.Fatal(err)
		}
	})
	measure("openFirstScreen", func() {
		if _, err := c.Library.ModList(ctx, e.inst.ID); err != nil {
			t.Fatal(err)
		}
		if _, err := c.Conflicts.Indicators(ctx, e.inst.ID); err != nil {
			t.Fatal(err)
		}
		if _, err := c.Deployment.Status(ctx, e.inst.ID); err != nil {
			t.Fatal(err)
		}
	})
	c.Close()

	// Purge through the test wiring again (bootstrap would use the real
	// LocalAppData for plugins.txt).
	r := newEnvWith(t, envOptions{dir: dir, dbPath: filepath.Join(dir, "state.db"), existing: true})
	measure("purge", func() { benchDeploy(t, r, deploysvc.KindPurge) })
	if out := os.Getenv("MO_BENCH_OUT"); out != "" {
		body, _ := json.MarshalIndent(report, "", "  ")
		if err := os.WriteFile(out, body, 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

// benchDeploy runs a deploy or purge to its end. The load order is applied
// in the background after a deploy changes plugins and holds the instance
// meanwhile (D038): a start refused as busy is tried again, and the wait
// counts in the measure, as it would for the user.
func benchDeploy(t *testing.T, e *env, kind operation.Kind) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Minute)
	for {
		id, err := e.dep.RunSync(ctx, e.inst.ID, kind)
		if codeOf(err) == "instance_busy" && time.Now().Before(deadline) {
			time.Sleep(20 * time.Millisecond)
			continue
		}
		if err != nil {
			t.Fatalf("%s: %v", kind, err)
		}
		o := e.op(id)
		if o.Status != operation.StatusSucceeded {
			t.Fatalf("%s: %+v", kind, o.Error)
		}
		var steps []string
		for _, st := range o.Steps {
			if st.StartedAt != nil && st.FinishedAt != nil {
				steps = append(steps, fmt.Sprintf("%s=%dms", st.Name, st.FinishedAt.Sub(*st.StartedAt).Milliseconds()))
			}
		}
		t.Logf("  steps: %s", strings.Join(steps, " "))
		return
	}
}

func envInt(name string, def int) int {
	if v, err := strconv.Atoi(os.Getenv(name)); err == nil && v > 0 {
		return v
	}
	return def
}

func benchIndicators(t *testing.T, e *env) {
	t.Helper()
	if _, err := e.conf.Indicators(ctx, e.inst.ID); err != nil {
		t.Fatal(err)
	}
}

// benchArchives writes one zip per mod and returns their paths.
func benchArchives(t *testing.T, dir string, mods, files int) []string {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	const pool = 5000
	out := make([]string, mods)
	for m := range mods {
		var buf bytes.Buffer
		zw := zip.NewWriter(&buf)
		add := func(name string, body []byte) {
			w, err := zw.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Store})
			if err != nil {
				t.Fatal(err)
			}
			_, _ = w.Write(body)
		}
		flags := uint32(0x200) // light
		if m%12 == 0 {
			flags = 0
		}
		add(fmt.Sprintf("Bench%04d.esp", m), tes4(flags, "Skyrim.esm"))
		if m%2 == 0 {
			add(fmt.Sprintf("Bench%04d_Patch.esp", m), tes4(0x200, "Skyrim.esm"))
		}
		for f := range files - 2 {
			if f%10 == 0 { // shared: another mod provides the same path
				p := (m*7 + f*13) % pool
				add(fmt.Sprintf("textures/shared/%02d/s%05d.dds", p%50, p), []byte(fmt.Sprintf("mod %d shared %d", m, p)))
				continue
			}
			add(fmt.Sprintf("meshes/bench%04d/%02d/f%04d.nif", m, f%20, f), []byte(fmt.Sprintf("mod %d file %d", m, f)))
		}
		if err := zw.Close(); err != nil {
			t.Fatal(err)
		}
		out[m] = filepath.Join(dir, fmt.Sprintf("Bench%04d.zip", m))
		if err := os.WriteFile(out[m], buf.Bytes(), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return out
}
