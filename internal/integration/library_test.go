// Package integration_test runs the library use cases end to end over the
// real SQLite store, the real filesystem, the real extractor and the
// compiled adapters (F4 demonstration as automated tests).
package integration_test

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"modorchestrator/internal/adapters/generic"
	"modorchestrator/internal/adapters/skyrimse"
	conflictsvc "modorchestrator/internal/core/application/conflicts"
	diagsvc "modorchestrator/internal/core/application/diagnostics"
	historysvc "modorchestrator/internal/core/application/history"
	deploysvc "modorchestrator/internal/core/application/deployment"
	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/instancelock"
	"modorchestrator/internal/core/application/library"
	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	pluginsvc "modorchestrator/internal/core/application/plugins"
	profilesvc "modorchestrator/internal/core/application/profiles"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/rules"
	"modorchestrator/internal/core/domain/settings"
	"modorchestrator/internal/infrastructure/archive"
	"modorchestrator/internal/infrastructure/eventbus"
	"modorchestrator/internal/infrastructure/filesystem"
	"modorchestrator/internal/infrastructure/hashing"
	"modorchestrator/internal/infrastructure/persistence/sqlite"
	"modorchestrator/internal/infrastructure/plugincache"
	"modorchestrator/internal/infrastructure/system"
)

var ctx = context.Background()

type env struct {
	t        *testing.T
	dir      string
	lib      *library.Service
	prof     *profilesvc.Service
	conf     *conflictsvc.Service
	newConf  func() *conflictsvc.Service
	games    *games.Service
	ops      *operations.Service
	mods     *sqlite.ModRepository
	rules    *sqlite.RuleRepository
	profiles *sqlite.ProfileRepository
	inst     game.Instance
	events   []event.Event
	dep      *deploysvc.Service
	auto     *deploysvc.AutoDeployer
	diag     *diagsvc.Service
	hist     *historysvc.Service
	plug     *pluginsvc.Service
	db       *sql.DB
	bus      *eventbus.Bus
	eventsMu sync.Mutex
}

// envOptions vary the wiring: the deploy method of the managed game, a
// database file shared with another process, and a filesystem wrapper.
type envOptions struct {
	method game.DeploymentMethod
	dir    string
	dbPath string
	fs     func(ports.FileSystem) ports.FileSystem
	// existing skips managing the game: the database already has it.
	existing bool
}

func newEnv(t *testing.T) *env { return newEnvWith(t, envOptions{}) }

func newEnvWith(t *testing.T, o envOptions) *env {
	t.Helper()
	dir := o.dir
	if dir == "" {
		dir = t.TempDir()
	}
	dbPath := o.dbPath
	if dbPath == "" {
		dbPath = ":memory:"
	}
	if o.method == "" {
		o.method = game.MethodCopy
	}
	db, err := sqlite.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	e := &env{t: t, dir: dir, db: db}
	bus := eventbus.New()
	e.bus = bus
	bus.Subscribe(func(ev event.Event) {
		e.eventsMu.Lock()
		e.events = append(e.events, ev)
		e.eventsMu.Unlock()
	})
	ids, clock := system.IDs{}, system.Clock{}
	e.ops = operations.NewService(sqlite.NewOperationRepository(db), bus, ids, clock)
	registry, err := games.NewRegistry(generic.Adapter{}, skyrimse.Adapter{})
	if err != nil {
		t.Fatal(err)
	}
	var fsys ports.FileSystem = filesystem.New()
	if o.fs != nil {
		fsys = o.fs(fsys)
	}
	locks := instancelock.New()
	profiles := sqlite.NewProfileRepository(db)
	e.profiles = profiles
	e.games = games.NewService(games.Deps{
		Registry: registry, Instances: sqlite.NewGameInstanceRepository(db), Profiles: profiles,
		State: sqlite.NewAppState(db), Deployments: sqlite.NewDeploymentState(db), FS: fsys, Drives: filesystem.New(),
		Versions: system.FileVersions{}, Ops: e.ops, IDs: ids, Clock: clock, Locks: locks,
	})
	e.mods = sqlite.NewModRepository(db)
	e.rules = sqlite.NewRuleRepository(db)
	e.lib = library.NewService(library.Deps{
		Registry: registry, Instances: sqlite.NewGameInstanceRepository(db), Mods: e.mods,
		Archives: sqlite.NewArchiveRepository(db), Installations: sqlite.NewInstallationRepository(db),
		Categories: sqlite.NewCategoryRepository(db), Profiles: profiles, Rules: e.rules,
		State: sqlite.NewAppState(db), Events: sqlite.NewEventLog(db), UoW: sqlite.NewUnitOfWork(db), Publisher: bus,
		FS: fsys, Extractor: archive.New(), Hasher: hashing.SHA256{},
		Settings: appsettings.NewService(sqlite.NewSettingsRepository(db), system.Locale{}, settings.V1),
		Ops:      e.ops, Locks: locks, IDs: ids, Clock: clock,
	})

	e.prof = profilesvc.NewService(profilesvc.Deps{
		Instances: sqlite.NewGameInstanceRepository(db), Profiles: profiles, Rules: e.rules, Mods: e.mods,
		Events: sqlite.NewEventLog(db), UoW: sqlite.NewUnitOfWork(db), Publisher: bus,
		Settings: appsettings.NewService(sqlite.NewSettingsRepository(db), system.Locale{}, settings.V1),
		Locks:    locks, IDs: ids, Clock: clock,
	})
	e.newConf = func() *conflictsvc.Service {
		return conflictsvc.NewService(conflictsvc.Deps{
			Instances: sqlite.NewGameInstanceRepository(db), Mods: e.mods, Installations: sqlite.NewInstallationRepository(db),
			Profiles: profiles, Rules: e.rules, Overrides: sqlite.NewOverrideRepository(db), UoW: sqlite.NewUnitOfWork(db),
			Publisher: bus, FS: fsys, Hasher: hashing.SHA256{},
			Settings:   appsettings.NewService(sqlite.NewSettingsRepository(db), system.Locale{}, settings.V1),
			OrderRules: e.prof, IDs: ids, Clock: clock,
		})
	}
	e.conf = e.newConf()
	t.Cleanup(func() { e.conf.Wait() })
	e.plug = pluginsvc.NewService(pluginsvc.Deps{
		Registry: registry, Instances: sqlite.NewGameInstanceRepository(db), Mods: e.mods,
		Installations: sqlite.NewInstallationRepository(db), Profiles: profiles, Rules: e.rules,
		Overrides: sqlite.NewOverrideRepository(db), PluginRules: sqlite.NewPluginRuleRepository(db),
		Manifests: sqlite.NewManifestRepository(db), State: sqlite.NewAppState(db), UoW: sqlite.NewUnitOfWork(db),
		Publisher: bus, FS: fsys, Hasher: hashing.SHA256{}, Folders: testFolders{root: filepath.Join(dir, "LocalAppData")},
		Cache:    plugincache.New(filepath.Join(dir, "cache")),
		Settings: appsettings.NewService(sqlite.NewSettingsRepository(db), system.Locale{}, settings.V1),
		Ops:      e.ops, Locks: locks, IDs: ids, Clock: clock,
	})
	t.Cleanup(e.plug.Close)
	e.dep = deploysvc.NewService(deploysvc.Deps{
		Registry: registry, Instances: sqlite.NewGameInstanceRepository(db), Mods: e.mods,
		Installations: sqlite.NewInstallationRepository(db), Profiles: profiles, Rules: e.rules,
		Overrides: sqlite.NewOverrideRepository(db), Manifests: sqlite.NewManifestRepository(db),
		Journals: sqlite.NewJournalRepository(db), State: sqlite.NewAppState(db), UoW: sqlite.NewUnitOfWork(db),
		Publisher: bus, FS: fsys, Foreign: e.games,
		Settings: appsettings.NewService(sqlite.NewSettingsRepository(db), system.Locale{}, settings.V1),
		Archives: sqlite.NewArchiveRepository(db), Decisions: sqlite.NewExternalDecisionRepository(db),
		Hasher: hashing.SHA256{}, Library: e.lib, Exclusions: e.conf, LoadOrder: e.plug,
		Ops: e.ops, Locks: locks, IDs: ids, Clock: clock,
	})
	e.auto = deploysvc.NewAutoDeployer(e.dep)
	t.Cleanup(func() { e.auto.Close(); e.dep.Wait() })
	e.diag = diagsvc.NewService(diagsvc.Deps{
		Registry: registry, Instances: sqlite.NewGameInstanceRepository(db), Profiles: profiles, Mods: e.mods, Rules: e.rules,
		Suppressions: sqlite.NewSuppressionRepository(db), Presence: sqlite.NewPresenceRepository(db),
		Notifs: sqlite.NewNotificationRepository(db), State: sqlite.NewAppState(db), UoW: sqlite.NewUnitOfWork(db),
		Publisher: bus, FS: fsys, Settings: appsettings.NewService(sqlite.NewSettingsRepository(db), system.Locale{}, settings.V1),
		Conflicts: e.conf, Deploy: e.dep, Games: e.games, Library: e.lib, Commands: e.prof, Plugins: e.plug, IDs: ids, Clock: clock,
	})
	t.Cleanup(e.diag.Close)
	e.hist = historysvc.NewService(historysvc.Deps{
		History: sqlite.NewHistoryRepository(db), Mods: e.mods, Profiles: profiles,
		Settings: appsettings.NewService(sqlite.NewSettingsRepository(db), system.Locale{}, settings.V1),
		Commands: e.prof, Conflicts: e.conf, Library: e.lib, Clock: clock,
	})

	if o.existing {
		list, err := sqlite.NewGameInstanceRepository(db).List(ctx)
		if err != nil || len(list) != 1 {
			t.Fatalf("existing instance: %v %v", list, err)
		}
		e.inst = list[0]
		return e
	}
	root := filepath.Join(dir, "Skyrim")
	e.write(filepath.Join(root, "SkyrimSE.exe"), "exe")
	e.write(filepath.Join(root, "Data", "Skyrim.esm"), "esm")
	res, err := e.games.Manage(ctx, games.Setup{
		Game: skyrimse.GameID, Root: root, Method: o.method,
		Folders: games.Folders{
			Staging: filepath.Join(dir, "mo", "staging"), ArchiveStore: filepath.Join(dir, "mo", "archives"),
			BackupStore: filepath.Join(dir, "mo", "backups"),
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	e.inst, _ = sqlite.NewGameInstanceRepository(db).Get(ctx, res.Instance)
	return e
}

func (e *env) write(path, data string) {
	e.t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		e.t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(data), 0o644); err != nil {
		e.t.Fatal(err)
	}
}

// zipFile writes an archive with name -> content entries.
func (e *env) zipFile(name string, files ...string) string {
	e.t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for i := 0; i+1 < len(files); i += 2 {
		w, err := zw.Create(files[i])
		if err != nil {
			e.t.Fatal(err)
		}
		_, _ = w.Write([]byte(files[i+1]))
	}
	_ = zw.Close()
	p := filepath.Join(e.dir, "downloads", name)
	e.write(p, buf.String())
	return p
}

// importAndWait queues paths and waits for the queue to drain.
func (e *env) importAndWait(paths ...string) []operation.ID {
	e.t.Helper()
	ids, err := e.lib.ImportFiles(ctx, e.inst.ID, paths)
	if err != nil {
		e.t.Fatal(err)
	}
	e.lib.Wait()
	return ids
}

func (e *env) waitDecision(op operation.ID) *library.Decision {
	e.t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		for _, it := range e.lib.Queue(e.inst.ID) {
			if it.Operation == op && it.Decision != nil {
				return it.Decision
			}
		}
		time.Sleep(5 * time.Millisecond)
	}
	e.t.Fatalf("no decision for %s", op)
	return nil
}

func (e *env) op(id operation.ID) *operation.Operation {
	e.t.Helper()
	o, err := e.ops.Get(ctx, id)
	if err != nil {
		e.t.Fatal(err)
	}
	return o
}

func (e *env) rows() []library.ModRow {
	e.t.Helper()
	rows, err := e.lib.ModList(ctx, e.inst.ID)
	if err != nil {
		e.t.Fatal(err)
	}
	return rows
}

func (e *env) only() library.ModRow {
	e.t.Helper()
	rows := e.rows()
	if len(rows) != 1 {
		e.t.Fatalf("want one mod, got %+v", rows)
	}
	return rows[0]
}

// tree lists every path below root, relative, "/" separated.
func tree(t *testing.T, root string) []string {
	t.Helper()
	var out []string
	_ = filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err == nil && p != root {
			rel, _ := filepath.Rel(root, p)
			out = append(out, filepath.ToSlash(rel))
		}
		return nil
	})
	return out
}

func (e *env) files(id mod.ID) []string {
	e.t.Helper()
	page, err := e.lib.Files(ctx, id, "", 0, 0)
	if err != nil {
		e.t.Fatal(err)
	}
	var out []string
	for _, f := range page.Files {
		out = append(out, string(f.Target)+":"+f.Path)
	}
	return out
}

// core/02 §13: a wrapper folder installs the right content without asking;
// the archive is retained, the mod is enabled in the active profile and the
// state and its events are committed together.
func TestImportWrapperArchive(t *testing.T) {
	e := newEnv(t)
	ids := e.importAndWait(e.zipFile("Cool Mod-1234-1-2-1690000000.zip",
		"Cool Mod/readme.txt", "read me",
		"Cool Mod/Cool Mod/textures/a.dds", "dds",
		"Cool Mod/Cool Mod/CoolMod.esp", "esp",
	))
	if o := e.op(ids[0]); o.Status != operation.StatusSucceeded {
		t.Fatalf("operation = %s %+v", o.Status, o.Error)
	}
	m := e.only()
	if m.Name != "Cool Mod" || m.Version != "1.2" || m.State != mod.StateInstalled || !m.Enabled || m.Files != 2 {
		t.Fatalf("row = %+v", m)
	}
	if got := e.files(m.ID); !slices.Equal(got, []string{"data:CoolMod.esp", "data:textures/a.dds"}) {
		t.Fatalf("files = %v", got)
	}
	if !slices.Contains(m.Content, "plugin") || !slices.Contains(m.Content, "textures") {
		t.Fatalf("content = %v", m.Content)
	}
	// INV-ID-03: the staging folder is the mod id.
	if got := tree(t, e.inst.Staging); !slices.Equal(got, []string{".modorchestrator-staging", string(m.ID), string(m.ID) + "/CoolMod.esp", string(m.ID) + "/textures", string(m.ID) + "/textures/a.dds"}) {
		t.Fatalf("staging = %v", got)
	}
	arch := tree(t, e.inst.ArchiveStore)
	if !slices.Contains(arch, string(ids[0])+"/Cool Mod-1234-1-2-1690000000.zip") {
		t.Fatalf("archive store = %v", arch)
	}
	var types []event.Type
	for _, ev := range e.events {
		if ev.OperationID == string(ids[0]) && !strings.HasPrefix(string(ev.Type), "operation.") {
			types = append(types, ev.Type)
		}
	}
	if !slices.Equal(types, []event.Type{library.EventArchiveRetained, library.EventModImported, library.EventModInstalled}) {
		t.Fatalf("domain events = %v", types)
	}
}

// core/02 §13: two option folders ask; reinstall does not ask again.
func TestAmbiguousRootAsksOnceAndReinstallRepeats(t *testing.T) {
	e := newEnv(t)
	ids, err := e.lib.ImportFiles(ctx, e.inst.ID, []string{e.zipFile("Options.zip",
		"Option A/textures/a.dds", "a", "Option B/textures/b.dds", "b")})
	if err != nil {
		t.Fatal(err)
	}
	d := e.waitDecision(ids[0])
	if d.Kind != "root_ambiguous" || !slices.Equal(d.Candidates, []string{"Option A", "Option B"}) {
		t.Fatalf("decision = %+v", d)
	}
	// INV-OPS-02: while the queue holds the instance nothing else mutates it.
	var busy *instancelock.BusyError
	if _, err := e.lib.RemoveMods(ctx, e.inst.ID, []mod.ID{"x"}, false); !errors.As(err, &busy) {
		t.Fatalf("remove during import = %v", err)
	}
	if err := e.games.Relocate(ctx, e.inst.ID, e.inst.Root); !errors.As(err, &busy) {
		t.Fatalf("relocate during import = %v", err)
	}
	if err := e.lib.Resolve(ids[0], library.Answer{Choice: library.ChoiceRoot, Root: "Option B"}); err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	m := e.only()
	if got := e.files(m.ID); !slices.Equal(got, []string{"data:textures/b.dds"}) {
		t.Fatalf("files = %v", got)
	}
	re, err := e.lib.ReinstallMods(ctx, e.inst.ID, []mod.ID{m.ID})
	if err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	if o := e.op(re[0]); o.Status != operation.StatusSucceeded {
		t.Fatalf("reinstall = %s %+v", o.Status, o.Error)
	}
	if got := e.files(m.ID); !slices.Equal(got, []string{"data:textures/b.dds"}) {
		t.Fatalf("files after reinstall = %v", got)
	}
	if got := tree(t, e.inst.Staging); slices.ContainsFunc(got, func(p string) bool {
		return strings.HasPrefix(p, ".tmp") || strings.Contains(p, ".installing") || strings.Contains(p, ".replaced")
	}) {
		t.Fatalf("leftovers in staging: %v", got)
	}
}

// INV-ID-04: an archive with ../evil.dll is refused listing the entry and
// nothing is written outside the operation's temporary folder.
func TestZipSlipIsRefused(t *testing.T) {
	e := newEnv(t)
	ids := e.importAndWait(e.zipFile("Evil.zip", "textures/a.dds", "a", "../evil.dll", "MZ"))
	o := e.op(ids[0])
	if o.Status != operation.StatusFailed || o.Error.Code != library.CodeArchiveUnsafe || !strings.Contains(o.Error.Detail, "../evil.dll") {
		t.Fatalf("operation = %s %+v", o.Status, o.Error)
	}
	for _, p := range tree(t, e.dir) {
		if strings.HasSuffix(p, "evil.dll") {
			t.Fatalf("evil.dll written at %s", p)
		}
	}
	m := e.only()
	if m.State != mod.StateImported {
		t.Fatalf("mod after refused archive = %s", m.State)
	}
	if got := tree(t, e.inst.Staging); !slices.Equal(got, []string{".modorchestrator-staging"}) {
		t.Fatalf("staging = %v", got)
	}
}

// INV-LIB-04: importing never executes anything. The service has no way to
// start a process, and an executable is refused as an archive.
func TestNothingIsExecuted(t *testing.T) {
	launcher := reflect.TypeOf((*ports.ProcessLauncher)(nil)).Elem()
	deps := reflect.TypeOf(library.Deps{})
	for i := 0; i < deps.NumField(); i++ {
		f := deps.Field(i).Type
		if f.Kind() == reflect.Interface && f.Implements(launcher) || f.Implements(launcher) {
			t.Fatalf("library.Deps.%s can launch processes", deps.Field(i).Name)
		}
	}
	e := newEnv(t)
	exe := filepath.Join(e.dir, "downloads", "setup.zip")
	e.write(exe, "MZ\x90\x00 this is an executable")
	ids := e.importAndWait(exe)
	if o := e.op(ids[0]); o.Error == nil || o.Error.Code != library.CodeUnsupportedFormat {
		t.Fatalf("executable import = %+v", o.Error)
	}
	ids = e.importAndWait(e.zipFile("Scripted.zip", "Mod/textures/a.dds", "a", "Mod/install.bat", "del *", "Mod/tool.exe", "MZ"))
	if o := e.op(ids[0]); o.Status != operation.StatusSucceeded {
		t.Fatalf("scripted archive = %s %+v", o.Status, o.Error)
	}
	if got := e.files(e.only().ID); !slices.Contains(got, "data:install.bat") {
		t.Fatalf("files are only copied: %v", got)
	}
}

// core/02 §6: the same archive twice asks; a variant goes right below the
// original, disabled only if enable-on-install is off.
func TestDuplicateAsVariant(t *testing.T) {
	e := newEnv(t)
	p := e.zipFile("Tex.zip", "textures/a.dds", "a")
	e.importAndWait(p)
	orig := e.only()
	e.importAndWait(e.zipFile("Other.zip", "textures/o.dds", "o"))
	ids, _ := e.lib.ImportFiles(ctx, e.inst.ID, []string{p})
	d := e.waitDecision(ids[0])
	if d.Kind != library.DecisionDuplicateArchive || len(d.Duplicates) != 1 || d.Duplicates[0].ID != orig.ID {
		t.Fatalf("decision = %+v", d)
	}
	if err := e.lib.Resolve(ids[0], library.Answer{Choice: library.ChoiceVariant, Mod: orig.ID, Label: "Dark"}); err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	var variant library.ModRow
	for _, r := range e.rows() {
		if r.VariantOf == orig.ID {
			variant = r
		}
	}
	if variant.VariantLabel != "Dark" || variant.State != mod.StateInstalled {
		t.Fatalf("variant = %+v", variant)
	}
	active, _ := e.profiles.Active(ctx, e.inst.ID)
	p1, _ := e.profiles.Get(ctx, active)
	order := p1.Mods()
	if i := slices.Index(order, orig.ID); i < 0 || i+1 >= len(order) || order[i+1] != variant.ID {
		t.Fatalf("variant must follow the original: %v", order)
	}
	// Same content is stored once.
	if n := len(tree(t, e.inst.ArchiveStore)); n != 5 { // marker + 2 × (folder + file)
		t.Fatalf("archive store = %v", tree(t, e.inst.ArchiveStore))
	}
}

// Renaming a mod never moves files (INV-ID-03).
func TestRenameDoesNotMoveFiles(t *testing.T) {
	e := newEnv(t)
	e.importAndWait(e.zipFile("A.zip", "textures/a.dds", "a"))
	m := e.only()
	before := tree(t, e.inst.Staging)
	if err := e.lib.SetAttributes(ctx, m.ID, library.AttributesInput{Name: "Renamed", Notes: "n"}); err != nil {
		t.Fatal(err)
	}
	if got := e.only(); got.Name != "Renamed" || !got.HasNotes || got.DetectedName != "A" {
		t.Fatalf("row = %+v", got)
	}
	if after := tree(t, e.inst.Staging); !slices.Equal(before, after) {
		t.Fatalf("staging changed: %v -> %v", before, after)
	}
}

// INV-LIB-05: removing a mod removes its profile entries; rules that cite it
// stay and are reported as orphans.
func TestRemoveKeepsRulesAsOrphans(t *testing.T) {
	e := newEnv(t)
	e.importAndWait(e.zipFile("A.zip", "textures/a.dds", "a"), e.zipFile("B.zip", "textures/b.dds", "b"))
	rows := e.rows()
	a, b := rows[0], rows[1]
	set, _ := e.rules.Get(ctx, e.inst.ID)
	if err := set.AddOrderRule(rules.OrderRule{ID: "r1", Before: a.ID, After: b.ID, Source: rules.SourceUser}); err != nil {
		t.Fatal(err)
	}
	_ = e.rules.Save(ctx, set)

	pre, err := e.lib.PreviewRemoval(ctx, e.inst.ID, []mod.ID{a.ID})
	if err != nil || pre.OrphanRules != 1 {
		t.Fatalf("preview = %+v %v", pre, err)
	}
	if _, err := e.lib.RemoveMods(ctx, e.inst.ID, []mod.ID{a.ID}, true); err != nil {
		t.Fatal(err)
	}
	if got := e.rows(); len(got) != 1 || got[0].ID != b.ID {
		t.Fatalf("rows = %+v", got)
	}
	set, _ = e.rules.Get(ctx, e.inst.ID)
	if len(set.OrderRules()) != 1 {
		t.Fatal("the rule must be kept")
	}
	if orphans := set.Orphans(map[mod.ID]bool{b.ID: true}); !slices.Equal(orphans, []rules.ID{"r1"}) {
		t.Fatalf("orphans = %v", orphans)
	}
	active, _ := e.profiles.Active(ctx, e.inst.ID)
	p, _ := e.profiles.Get(ctx, active)
	if _, ok := p.ModState(a.ID); ok {
		t.Fatal("removed mod still in the profile")
	}
	if _, err := os.Stat(filepath.Join(e.inst.Staging, string(a.ID))); !os.IsNotExist(err) {
		t.Fatal("staging folder of the removed mod still exists")
	}
	for _, p := range tree(t, e.inst.ArchiveStore) {
		if strings.HasSuffix(p, "A.zip") {
			t.Fatal("archive was asked to be removed")
		}
	}
}

// core/02 §13: several archives form a visible queue processed one at a
// time; cancelling one item does not affect the others.
func TestQueueCancelOneItem(t *testing.T) {
	e := newEnv(t)
	ids, err := e.lib.ImportFiles(ctx, e.inst.ID, []string{
		e.zipFile("Ask.zip", "A/textures/a.dds", "a", "B/textures/b.dds", "b"),
		e.zipFile("Second.zip", "textures/s.dds", "s"),
		e.zipFile("Third.zip", "textures/t.dds", "t"),
	})
	if err != nil {
		t.Fatal(err)
	}
	e.waitDecision(ids[0])
	q := e.lib.Queue(e.inst.ID)
	if len(q) != 3 || q[1].Status != operation.StatusPending {
		t.Fatalf("queue = %+v", q)
	}
	more, err := e.lib.ImportFiles(ctx, e.inst.ID, []string{e.zipFile("Fourth.zip", "textures/f.dds", "f")})
	if err != nil || len(e.lib.Queue(e.inst.ID)) != 4 {
		t.Fatalf("appending to a running queue: %v", err)
	}
	if err := e.lib.CancelQueued(ctx, ids[1]); err != nil {
		t.Fatal(err)
	}
	if err := e.lib.CancelQueued(ctx, ids[0]); err != nil { // cancels while waiting
		t.Fatal(err)
	}
	e.lib.Wait()
	want := map[operation.ID]operation.Status{
		ids[0]: operation.StatusCancelled, ids[1]: operation.StatusCancelled,
		ids[2]: operation.StatusSucceeded, more[0]: operation.StatusSucceeded,
	}
	for id, st := range want {
		if got := e.op(id).Status; got != st {
			t.Fatalf("%s = %s, want %s", id, got, st)
		}
	}
	// The lock is released once the queue is empty.
	if _, held := instancelockHolder(e); held {
		t.Fatal("instance still locked")
	}
}

func instancelockHolder(e *env) (string, bool) {
	_, err := e.lib.RemoveMods(ctx, e.inst.ID, nil, false)
	return "", err != nil
}

// core/02 §13: the SKSE runtime goes to the game root, the ENB preset too.
func TestAdapterInstallers(t *testing.T) {
	e := newEnv(t)
	e.importAndWait(e.zipFile("skse64_2_02_06.7z.zip",
		"skse64_2_02_06/skse64_loader.exe", "exe", "skse64_2_02_06/skse64_1_6_1170.dll", "dll",
		"skse64_2_02_06/Data/Scripts/Actor.pex", "pex", "skse64_2_02_06/src/main.cpp", "c"))
	m := e.only()
	if m.Type != skyrimse.ModTypeSKSE || m.Installer != skyrimse.SKSERuntimeID {
		t.Fatalf("row = %+v", m)
	}
	if got := e.files(m.ID); !slices.Equal(got, []string{"root:Data/Scripts/Actor.pex", "root:skse64_1_6_1170.dll", "root:skse64_loader.exe"}) {
		t.Fatalf("files = %v", got)
	}
}

// Killing the process in the middle leaves, after restart, no .tmp,
// .installing or .replaced folder and every mod in a committed state.
func TestRecoveryAfterInterruptedWork(t *testing.T) {
	e := newEnv(t)
	e.importAndWait(e.zipFile("Old.zip", "textures/old.dds", "old"))
	m := e.only()
	folder := filepath.Join(e.inst.Staging, string(m.ID))

	// Reinstall interrupted after the swap, before the commit.
	stored, _ := e.mods.Get(ctx, m.ID)
	_ = stored.BeginInstall(time.Now())
	_ = e.mods.Save(ctx, stored)
	if err := os.Rename(folder, folder+".replaced"); err != nil {
		t.Fatal(err)
	}
	e.write(filepath.Join(folder, "textures", "new.dds"), "new")
	// Other leftovers of an interrupted import.
	e.write(filepath.Join(e.inst.Staging, ".tmp", "op1", "x.dds"), "x")
	e.write(filepath.Join(e.inst.Staging, "someid.installing", "y.dds"), "y")
	e.write(filepath.Join(e.inst.ArchiveStore, "op2.partial", "Z.zip"), "z")

	if err := e.lib.Recover(ctx); err != nil {
		t.Fatal(err)
	}
	if got := tree(t, e.inst.Staging); !slices.Equal(got, []string{".modorchestrator-staging", string(m.ID), string(m.ID) + "/textures", string(m.ID) + "/textures/old.dds"}) {
		t.Fatalf("staging after recovery = %v", got)
	}
	if got := e.only(); got.State != mod.StateInstalled {
		t.Fatalf("mod after recovery = %s", got.State)
	}
	for _, p := range tree(t, e.inst.ArchiveStore) {
		if strings.Contains(p, ".partial") {
			t.Fatalf("partial archive left: %s", p)
		}
	}
}

func TestCategoriesSeedAndDelete(t *testing.T) {
	e := newEnv(t)
	cats, err := e.lib.CategoryList(ctx, e.inst.ID)
	if err != nil || len(cats) == 0 {
		t.Fatalf("seeded categories = %v %v", cats, err)
	}
	id, err := e.lib.SaveCategory(ctx, e.inst.ID, library.CategoryInput{Name: "Mine"})
	if err != nil {
		t.Fatal(err)
	}
	e.importAndWait(e.zipFile("A.zip", "textures/a.dds", "a"))
	m := e.only()
	if err := e.lib.SetCategory(ctx, e.inst.ID, []mod.ID{m.ID}, id); err != nil {
		t.Fatal(err)
	}
	if got := e.only(); !slices.Equal(got.CategoryPath, []string{"Mine"}) {
		t.Fatalf("category path = %v", got.CategoryPath)
	}
	if err := e.lib.DeleteCategory(ctx, e.inst.ID, id); err != nil {
		t.Fatal(err)
	}
	if got := e.only(); got.Category != "" {
		t.Fatalf("mod keeps a deleted category: %+v", got)
	}
}

func TestToggleAndModType(t *testing.T) {
	e := newEnv(t)
	e.importAndWait(e.zipFile("A.zip", "textures/a.dds", "a"))
	m := e.only()
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{m.ID}, false); err != nil {
		t.Fatal(err)
	}
	if e.only().Enabled {
		t.Fatal("still enabled")
	}
	if err := e.lib.SetModType(ctx, m.ID, "root"); err != nil {
		t.Fatal(err)
	}
	if got := e.files(m.ID); !slices.Equal(got, []string{"root:textures/a.dds"}) {
		t.Fatalf("files after type change = %v", got)
	}
}
