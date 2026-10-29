package integration_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"modorchestrator/internal/adapters/generic"
	"modorchestrator/internal/core/application/games"
	launchsvc "modorchestrator/internal/core/application/launch"
	"modorchestrator/internal/core/application/ports"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/deploystate"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/settings"
	"modorchestrator/internal/infrastructure/persistence/sqlite"
	"modorchestrator/internal/infrastructure/system"
)

type fakeLauncher struct {
	mu      sync.Mutex
	started []string
	dirs    []string
	// needsAdmin makes Start refuse like Windows error 740 (D150);
	// elevated and uris record the other ways of starting.
	needsAdmin bool
	elevated   []string
	uris       []string
}

func (f *fakeLauncher) Start(_ context.Context, exe string, _ []string, dir string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.needsAdmin {
		return fmt.Errorf("start %s: %w", exe, ports.ErrElevationRequired)
	}
	f.started = append(f.started, exe)
	f.dirs = append(f.dirs, dir)
	return nil
}

func (f *fakeLauncher) StartElevated(_ context.Context, exe string, _ []string, _ string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.elevated = append(f.elevated, exe)
	return nil
}

func (f *fakeLauncher) OpenURI(_ context.Context, uri string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.uris = append(f.uris, uri)
	return nil
}

func (f *fakeLauncher) last() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.started) == 0 {
		return ""
	}
	return f.started[len(f.started)-1]
}

// runningGames lets a test say which game processes run.
type runningGames struct {
	launchsvc.Games
	mu    sync.Mutex
	procs []string
}

func (r *runningGames) RunningProcesses(context.Context, game.Instance) ([]string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.procs...), nil
}

func (e *env) launchService(l *fakeLauncher, g launchsvc.Games) *launchsvc.Service {
	if g == nil {
		g = e.games
	}
	s := launchsvc.NewService(launchsvc.Deps{
		Registry: e.games.Registry, Instances: sqlite.NewGameInstanceRepository(e.db), FS: e.games.FS,
		Launcher: l, Deploy: e.dep, Diagnostics: e.diag, Games: g,
		Settings: appsettings.NewService(sqlite.NewSettingsRepository(e.db), system.Locale{}, settings.V1),
		Ops:      e.ops, UoW: sqlite.NewUnitOfWork(e.db), Publisher: e.bus, IDs: system.IDs{}, Clock: system.Clock{},
		Poll: 20 * time.Millisecond,
	})
	e.t.Cleanup(s.Close)
	return s
}

func (e *env) waitLaunch(s *launchsvc.Service, id operation.ID) *operation.Operation {
	e.t.Helper()
	s.Wait()
	return e.op(id)
}

func (e *env) eventsOf(t event.Type) []event.Event {
	e.eventsMu.Lock()
	defer e.eventsMu.Unlock()
	var out []event.Event
	for _, ev := range e.events {
		if ev.Type == t {
			out = append(out, ev)
		}
	}
	return out
}

// F12 demonstration (core/04 §9, D045): with a deploy pending and
// auto-deploy on, Play deploys first and then starts the game from its
// root; the version is acknowledged and game.launched is recorded.
func TestPlayDeploysFirstThenLaunches(t *testing.T) {
	e := newEnv(t)
	e.installMods("Alpha")
	l := &fakeLauncher{}
	s := e.launchService(l, nil)

	c, err := s.Check(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	if c.State != launchsvc.StateDeploy || !c.DeployNeeded || !c.AutoDeploy || len(c.Options) != 1 || c.Options[0].Exe != "SkyrimSE.exe" {
		t.Fatalf("check = %+v", c)
	}
	id, err := s.Launch(ctx, e.inst.ID, launchsvc.Request{})
	if err != nil {
		t.Fatal(err)
	}
	if o := e.waitLaunch(s, id); o.Status != operation.StatusSucceeded {
		t.Fatalf("launch = %s %+v", o.Status, o.Error)
	}
	e.dep.Wait()
	e.wantStatus(deploystate.InSync)
	if l.last() != filepath.Join(e.inst.Root, "SkyrimSE.exe") || l.dirs[0] != e.inst.Root {
		t.Fatalf("started %v in %v", l.started, l.dirs)
	}
	if len(e.eventsOf(launchsvc.EventLaunched)) != 1 {
		t.Fatal("game.launched not recorded")
	}
	if c, _ := s.Check(ctx, e.inst.ID); c.State != launchsvc.StateReady {
		t.Fatalf("after deploy = %+v", c)
	}
}

// Without auto-deploy, a pending deploy needs the user's choice: "Jogar sem
// implantar" launches without deploying.
func TestPlayAsksBeforeSkippingTheDeploy(t *testing.T) {
	e := newEnv(t)
	e.setInstance("automation.deployOnChange", "false")
	e.installMods("Alpha")
	l := &fakeLauncher{}
	s := e.launchService(l, nil)
	if _, err := s.Launch(ctx, e.inst.ID, launchsvc.Request{}); coded(err) != launchsvc.CodeNeedsConfirm {
		t.Fatalf("unconfirmed: %v", err)
	}
	id, err := s.Launch(ctx, e.inst.ID, launchsvc.Request{Confirmed: true})
	if err != nil {
		t.Fatal(err)
	}
	if o := e.waitLaunch(s, id); o.Status != operation.StatusSucceeded {
		t.Fatalf("launch = %+v", o.Error)
	}
	e.wantStatus(deploystate.NeverDeployed)
	if l.last() == "" {
		t.Fatal("the game was not started")
	}
}

// The SKSE loader in the root is the default option (core/12 §8); a
// deployment by another manager blocks Play with only the actions to solve
// it (foreign_deployment blocks launch, core/10).
func TestPlayOptionsAndBlocking(t *testing.T) {
	e := newEnv(t)
	e.write(filepath.Join(e.inst.Root, "skse64_loader.exe"), "loader")
	e.deploy("deploy")
	l := &fakeLauncher{}
	s := e.launchService(l, nil)
	c, err := s.Check(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	if c.State != launchsvc.StateReady || len(c.Options) != 2 || c.Options[0].ID != "skse" || !c.Options[0].Default {
		t.Fatalf("check = %+v", c)
	}
	id, err := s.Launch(ctx, e.inst.ID, launchsvc.Request{Option: "game"})
	if err != nil {
		t.Fatal(err)
	}
	e.waitLaunch(s, id)
	if l.last() != filepath.Join(e.inst.Root, "SkyrimSE.exe") {
		t.Fatalf("option game started %v", l.started)
	}
	if _, err := s.Launch(ctx, e.inst.ID, launchsvc.Request{Option: "nope"}); coded(err) != launchsvc.CodeOptionUnknown {
		t.Fatalf("unknown option: %v", err)
	}

	e.write(e.data("vortex.deployment.json"), "{}")
	c, _ = s.Check(ctx, e.inst.ID)
	if c.State != launchsvc.StateBlocked || len(c.Blocking) == 0 || c.Blocking[0].Code != "foreign_deployment" {
		t.Fatalf("foreign = %+v", c)
	}
	if _, err := s.Launch(ctx, e.inst.ID, launchsvc.Request{Confirmed: true}); coded(err) != launchsvc.CodeBlocked {
		t.Fatalf("blocked launch: %v", err)
	}
	_ = os.Remove(e.data("vortex.deployment.json"))
}

// The process watch records each transition once (game.running_changed) so
// Play, the deploy status and the diagnostics are read again.
func TestRunningWatchSignalsTransitions(t *testing.T) {
	e := newEnv(t)
	g := &runningGames{Games: e.games}
	s := e.launchService(&fakeLauncher{}, g)
	if err := s.Watch(ctx); err != nil {
		t.Fatal(err)
	}
	g.procs = []string{"SkyrimSE.exe"}
	_ = s.Watch(ctx)
	_ = s.Watch(ctx)
	g.procs = nil
	_ = s.Watch(ctx)
	evs := e.eventsOf(launchsvc.EventRunningChanged)
	if len(evs) != 2 {
		t.Fatalf("transitions = %d", len(evs))
	}
}

// D150: a game whose executable asks for administrator rights fails the
// launch with its own code; the next check marks the option, and "Jogar
// como administrador" starts it elevated.
func TestPlayOffersElevationAfterTheSystemRefuses(t *testing.T) {
	e := newEnv(t)
	e.deploy("deploy")
	l := &fakeLauncher{needsAdmin: true}
	s := e.launchService(l, nil)

	id, err := s.Launch(ctx, e.inst.ID, launchsvc.Request{})
	if err != nil {
		t.Fatal(err)
	}
	if o := e.waitLaunch(s, id); o.Status != operation.StatusFailed || o.Error == nil || o.Error.Code != launchsvc.CodeNeedsElevation || o.Error.Params["exe"] != "SkyrimSE.exe" {
		t.Fatalf("launch = %s %+v", o.Status, o.Error)
	}
	c, err := s.Check(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Options) != 1 || !c.Options[0].NeedsElevation || c.State != launchsvc.StateReady {
		t.Fatalf("check after 740 = %+v", c)
	}
	id, err = s.Launch(ctx, e.inst.ID, launchsvc.Request{Elevated: true})
	if err != nil {
		t.Fatal(err)
	}
	if o := e.waitLaunch(s, id); o.Status != operation.StatusSucceeded {
		t.Fatalf("elevated launch = %s %+v", o.Status, o.Error)
	}
	if len(l.elevated) != 1 || l.elevated[0] != filepath.Join(e.inst.Root, "SkyrimSE.exe") || len(l.started) != 0 {
		t.Fatalf("elevated %v, started %v", l.elevated, l.started)
	}
}

// D150: a missing executable is refused before anything starts, with its
// own message instead of the generic start failure.
func TestPlayRefusesAMissingExecutable(t *testing.T) {
	e := newEnv(t)
	e.write(filepath.Join(e.inst.Root, "skse64_loader.exe"), "loader")
	e.deploy("deploy")
	l := &fakeLauncher{}
	s := e.launchService(l, nil)
	if _, err := s.Check(ctx, e.inst.ID); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(e.inst.Root, "SkyrimSE.exe")); err != nil {
		t.Fatal(err)
	}
	_, err := s.Launch(ctx, e.inst.ID, launchsvc.Request{Option: "game"})
	if coded(err) != launchsvc.CodeExeMissing {
		t.Fatalf("missing exe: %v", err)
	}
	if len(l.started) != 0 {
		t.Fatalf("started %v", l.started)
	}
}

// D150 on the generic adapter (no store fields): the executable of the
// entry manifest starts directly, never through a store URI.
func TestGenericGameStartsTheExecutableDirectly(t *testing.T) {
	e := newEnvWith(t, envOptions{setup: func(dir string) games.Setup {
		root := filepath.Join(dir, "Game")
		if err := os.MkdirAll(filepath.Join(root, "Mods"), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(root, "Game.exe"), []byte("exe"), 0o644); err != nil {
			t.Fatal(err)
		}
		return games.Setup{
			Game: generic.GameID, Name: "Game", Root: root, Executable: "Game.exe",
			Targets: genericTargets(nil),
			Folders: games.Folders{
				Staging: filepath.Join(dir, "mo", "staging"), ArchiveStore: filepath.Join(dir, "mo", "archives"),
				BackupStore: filepath.Join(dir, "mo", "backups"),
			},
		}
	}})
	l := &fakeLauncher{}
	s := e.launchService(l, nil)
	c, err := s.Check(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Options) != 1 || c.Options[0].StoreURI != "" || c.Options[0].RequiresClient != "" {
		t.Fatalf("generic options = %+v", c.Options)
	}
	id, err := s.Launch(ctx, e.inst.ID, launchsvc.Request{Confirmed: true})
	if err != nil {
		t.Fatal(err)
	}
	if o := e.waitLaunch(s, id); o.Status != operation.StatusSucceeded {
		t.Fatalf("launch = %s %+v", o.Status, o.Error)
	}
	if l.last() != filepath.Join(e.inst.Root, "Game.exe") || len(l.uris) != 0 || len(l.elevated) != 0 {
		t.Fatalf("started %v, uris %v, elevated %v", l.started, l.uris, l.elevated)
	}
}
