package integration_test

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"modorchestrator/internal/core/application/instancelock"
	launchsvc "modorchestrator/internal/core/application/launch"
	"modorchestrator/internal/core/application/ports"
	deploysvc "modorchestrator/internal/core/application/deployment"
	toolsvc "modorchestrator/internal/core/application/tools"
	"modorchestrator/internal/core/domain/deploystate"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/tool"
	"modorchestrator/internal/infrastructure/persistence/sqlite"
	"modorchestrator/internal/infrastructure/system"
)

// fakeRunner records the tools started; each one runs until end is called.
type fakeRunner struct {
	mu    sync.Mutex
	specs []ports.ProcessSpec
	procs []*fakeProcess
}

type fakeProcess struct {
	pid  int
	done chan struct{}
}

func (p *fakeProcess) PID() int { return p.pid }
func (p *fakeProcess) Wait(ctx context.Context) (ports.ProcessExit, error) {
	select {
	case <-p.done:
		return ports.ProcessExit{Code: 0}, nil
	case <-ctx.Done():
		return ports.ProcessExit{}, ctx.Err()
	}
}

func (f *fakeRunner) Run(_ context.Context, spec ports.ProcessSpec) (ports.RunningProcess, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	p := &fakeProcess{pid: 100 + len(f.procs), done: make(chan struct{})}
	f.specs = append(f.specs, spec)
	f.procs = append(f.procs, p)
	return p, nil
}

func (f *fakeRunner) last() ports.ProcessSpec {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.specs[len(f.specs)-1]
}

func (f *fakeRunner) end() {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, p := range f.procs {
		select {
		case <-p.done:
		default:
			close(p.done)
		}
	}
}

// toolsEnv wires the tools module over the test environment, with the
// deploy engine's instance lock (exclusive tools hold it).
func (e *env) toolsService(r *fakeRunner) (*toolsvc.Service, *launchsvc.Service) {
	l := e.launchService(&fakeLauncher{}, nil)
	l.Runner = r
	l.Locks = e.dep.Locks
	s := toolsvc.NewService(toolsvc.Deps{
		Registry: e.games.Registry, Instances: sqlite.NewGameInstanceRepository(e.db), Profiles: e.profiles,
		Tools: sqlite.NewToolRepository(e.db), UoW: sqlite.NewUnitOfWork(e.db), Publisher: e.bus, FS: e.games.FS,
		Launch: l, Scanner: e.dep, Locks: e.dep.Locks, IDs: system.IDs{}, Clock: system.Clock{},
	})
	l.Outputs = s
	return s, l
}

func (e *env) runOp(l *launchsvc.Service, id operation.ID) *operation.Operation {
	e.t.Helper()
	l.Wait()
	e.dep.Wait()
	return e.op(id)
}

// LV4 demonstration (core/15, D146): a known tool found in the game folder
// is suggested and added with its defaults; a user tool expands the
// variables of the instance; starting a tool deploys first, an exclusive
// tool keeps the instance busy while it runs, and its end scans the game
// and reports what it generated, ready for the capture.
func TestToolsRegistryRunAndScanOutputs(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	r := &fakeRunner{}
	s, l := e.toolsService(r)

	v, err := s.List(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(v.Tools) != 0 || len(v.Suggestions) < 7 || len(v.Variables) == 0 {
		t.Fatalf("empty registry with suggestions: %+v", v)
	}
	ck := func(v toolsvc.View) (toolsvc.Suggestion, bool) {
		for _, sg := range v.Suggestions {
			if sg.Known.ID == "creation_kit" {
				return sg, true
			}
		}
		return toolsvc.Suggestion{}, false
	}
	if sg, ok := ck(v); !ok || sg.Found != "" {
		t.Fatalf("not found yet: %+v", sg)
	}
	if _, err := s.AddKnown(ctx, e.inst.ID, "creation_kit", ""); codeOf(err) != toolsvc.CodeNotDetected {
		t.Fatalf("add undetected: %v", err)
	}
	e.write(filepath.Join(e.inst.Root, "CreationKit.exe"), "MZ")
	v, _ = s.List(ctx, e.inst.ID)
	if sg, _ := ck(v); sg.Found != `{game}\CreationKit.exe` {
		t.Fatalf("detected = %q", sg.Found)
	}
	ckID, err := s.AddKnown(ctx, e.inst.ID, "creation_kit", "")
	if err != nil {
		t.Fatal(err)
	}
	v, _ = s.List(ctx, e.inst.ID)
	if _, still := ck(v); still || len(v.Tools) != 1 || !v.Tools[0].Tool.Exclusive || v.Tools[0].Problem != "" || v.Tools[0].Tool.Known != "creation_kit" {
		t.Fatalf("added known tool: %+v", v)
	}

	// A tool the user locates outside the game folder.
	exe := filepath.Join(e.dir, "Tools", "Gen", "gen.exe")
	e.write(exe, "MZ")
	if _, err := s.Save(ctx, e.inst.ID, toolsvc.Input{Name: "Gen", Exe: exe, Args: "-o:{nope}"}); codeOf(err) != toolsvc.CodeInvalid {
		t.Fatalf("unknown variable: %v", err)
	}
	genID, err := s.Save(ctx, e.inst.ID, toolsvc.Input{
		Name: " Gen ", Exe: exe, Args: `-o:"{target:data}" -p {profile}`, Env: []tool.EnvVar{{Name: "GEN_PROFILE", Value: "{profile_id}"}},
		Exclusive: true, DeployBefore: true,
	})
	if err != nil {
		t.Fatal(err)
	}

	// A pending deploy runs first.
	e.installFiles(deployMods, "Charlie")
	op, err := s.Run(ctx, e.inst.ID, genID)
	if err != nil {
		t.Fatal(err)
	}
	if o := e.runOp(l, op); o.Status != operation.StatusSucceeded {
		t.Fatalf("run = %s %+v", o.Status, o.Error)
	}
	e.wantStatus(deploystate.InSync)
	spec := r.last()
	active := e.active()
	if spec.Exe != exe || spec.WorkDir != filepath.Dir(exe) || spec.Args != `-o:"`+filepath.Join(e.inst.Root, "Data")+`" -p `+active.Name() ||
		len(spec.Env) != 1 || spec.Env[0] != "GEN_PROFILE="+string(active.ID()) {
		t.Fatalf("spec = %+v", spec)
	}
	if len(e.eventsOf(launchsvc.EventToolLaunched)) != 1 {
		t.Fatal("tool.launched not recorded")
	}

	// While the exclusive tool runs, the instance is busy and the tool
	// cannot start twice.
	if _, err := e.dep.Deploy(ctx, e.inst.ID); codeOf(err) != instancelock.CodeBusy {
		t.Fatalf("deploy while an exclusive tool runs: %v", err)
	}
	if v, _ := s.List(ctx, e.inst.ID); !v.Tools[1].Running || v.Tools[0].Running {
		t.Fatalf("running flags: %+v", v.Tools)
	}
	if _, err := s.Run(ctx, e.inst.ID, genID); codeOf(err) != launchsvc.CodeToolRunning {
		t.Fatalf("second start: %v", err)
	}

	// The tool writes into a tool output and ends.
	e.write(e.data("meshes/actors/character/behaviors/0_master.hkx"), "generated")
	r.end()
	l.WaitTools()
	exits := e.eventsOf(launchsvc.EventToolExited)
	if len(exits) != 1 {
		t.Fatalf("tool.exited = %d", len(exits))
	}
	p := exits[0].Payload.(map[string]string)
	if p["tool"] != string(genID) || p["scanned"] != "true" || p["newFiles"] != "1" || p["changes"] != "0" {
		t.Fatalf("exit payload = %+v", p)
	}
	if _, busy := e.dep.Locks.Holder(e.inst.ID); busy {
		t.Fatal("the lock is released when the tool ends")
	}
	if o := e.deploy(deploysvc.KindDeploy); o.Status != operation.StatusSucceeded {
		t.Fatalf("deploy after the tool: %+v", o.Error)
	}

	// Order, edit, delete.
	if err := s.Move(ctx, e.inst.ID, genID, 0); err != nil {
		t.Fatal(err)
	}
	if v, _ := s.List(ctx, e.inst.ID); v.Tools[0].Tool.ID != genID || v.Tools[1].Tool.ID != ckID {
		t.Fatalf("moved: %+v", v.Tools)
	}
	if _, err := s.Save(ctx, e.inst.ID, toolsvc.Input{ID: ckID, Name: "CK", Exe: `{game}\CreationKit.exe`}); err != nil {
		t.Fatal(err)
	}
	if v, _ := s.List(ctx, e.inst.ID); v.Tools[1].Tool.Name != "CK" || v.Tools[1].Tool.Position != 1 {
		t.Fatalf("edited keeps its place: %+v", v.Tools)
	}
	if err := s.Delete(ctx, e.inst.ID, genID); err != nil {
		t.Fatal(err)
	}
	if v, _ := s.List(ctx, e.inst.ID); len(v.Tools) != 1 || v.Tools[0].Tool.Position != 0 {
		t.Fatalf("deleted: %+v", v.Tools)
	}
	if err := s.Delete(ctx, e.inst.ID, genID); codeOf(err) != toolsvc.CodeNotFound {
		t.Fatalf("delete twice: %v", err)
	}

	// A missing executable is refused before anything starts.
	if err := removeFile(filepath.Join(e.inst.Root, "CreationKit.exe")); err != nil {
		t.Fatal(err)
	}
	if v, _ := s.List(ctx, e.inst.ID); v.Tools[0].Problem != toolsvc.CodeExecutableMissing {
		t.Fatalf("problem = %q", v.Tools[0].Problem)
	}
	if _, err := s.Run(ctx, e.inst.ID, ckID); codeOf(err) != toolsvc.CodeExecutableMissing {
		t.Fatalf("missing exe: %v", err)
	}
}

// A non-exclusive tool without "deploy before" starts at once and leaves
// the instance free.
func TestToolWithoutDeployOrLock(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	r := &fakeRunner{}
	s, l := e.toolsService(r)
	exe := filepath.Join(e.dir, "free.exe")
	e.write(exe, "MZ")
	id, err := s.Save(ctx, e.inst.ID, toolsvc.Input{Name: "Free", Exe: exe, WorkDir: "{staging}"})
	if err != nil {
		t.Fatal(err)
	}
	e.setInstance("automation.deployOnChange", "false")
	e.installFiles(deployMods, "Charlie")
	op, err := s.Run(ctx, e.inst.ID, id)
	if err != nil {
		t.Fatal(err)
	}
	if o := e.runOp(l, op); o.Status != operation.StatusSucceeded {
		t.Fatalf("run = %+v", o.Error)
	}
	if st := e.status(); st.Status.Kind == deploystate.InSync {
		t.Fatal("no deploy before a tool that does not ask for it")
	}
	if r.last().WorkDir != e.inst.Staging {
		t.Fatalf("work dir = %q", r.last().WorkDir)
	}
	if _, busy := e.dep.Locks.Holder(e.inst.ID); busy {
		t.Fatal("a non-exclusive tool holds nothing")
	}
	r.end()
	l.WaitTools()
}

// D112: a game without the tools capability, or with the feature turned
// off, gets nothing from the module.
func TestGameWithoutToolsIsLeftAlone(t *testing.T) {
	e := newEnvWith(t, envOptions{generic: true})
	s, _ := e.toolsService(&fakeRunner{})
	if s.Supported(ctx, e.inst.ID) {
		t.Fatal("generic game has no tools")
	}
	if _, err := s.List(ctx, e.inst.ID); codeOf(err) != toolsvc.CodeUnsupported {
		t.Fatalf("list: %v", err)
	}
	if _, err := s.Save(ctx, e.inst.ID, toolsvc.Input{Name: "x", Exe: `C:\x.exe`}); codeOf(err) != toolsvc.CodeUnsupported {
		t.Fatalf("save: %v", err)
	}
	if _, err := s.Run(ctx, e.inst.ID, "any"); codeOf(err) != toolsvc.CodeUnsupported {
		t.Fatalf("run: %v", err)
	}
	feats, err := e.games.Features(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range feats {
		if f.ID == game.CapTools && f.Effective {
			t.Fatal("tools in effect on the generic game")
		}
	}

	sk := newEnv(t)
	ss, _ := sk.toolsService(&fakeRunner{})
	if !ss.Supported(ctx, sk.inst.ID) {
		t.Fatal("Skyrim offers tools")
	}
	if err := sk.games.SetFeature(ctx, sk.inst.ID, game.CapTools, false); err != nil {
		t.Fatal(err)
	}
	if _, err := ss.List(ctx, sk.inst.ID); codeOf(err) != toolsvc.CodeUnsupported {
		t.Fatalf("feature off: %v", err)
	}
}

func removeFile(p string) error { return os.Remove(p) }
