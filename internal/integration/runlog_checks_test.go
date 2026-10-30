package integration_test

import (
	"context"
	"testing"

	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/testutil/memfs"
)

// Reuse the catalog and health-check adapter fixture. The per-instance
// definition can disable health checks while another definition supports it.
type runLogAdapter struct {
	ownCheck
	withoutCapability bool
	received          []byte
	calls             int
}

func (a *runLogAdapter) InstanceDefinition(id game.ID, targets []game.Target) (game.Definition, error) {
	d, err := a.Adapter.InstanceDefinition(id, targets)
	if a.withoutCapability {
		var caps []game.Capability
		for _, cap := range d.Capabilities.List() {
			if cap != game.CapHealthChecks {
				caps = append(caps, cap)
			}
		}
		d.Capabilities = game.NewCapabilities(caps...)
	}
	return d, err
}

func (*runLogAdapter) HealthChecks(context.Context, ports.FileReader, game.Instance, []ports.ModContent) ([]diagnostic.Spec, error) {
	return nil, nil
}

func (*runLogAdapter) RunLogFile(game.Instance) (ports.FileLocation, bool) {
	return ports.FileLocation{Folder: ports.FolderDocuments, Path: "Game/run.log"}, true
}

func (a *runLogAdapter) RunLogChecks(ctx context.Context, fs ports.FileReader, inst game.Instance, log ports.RunLog, _ ports.FileOwners) ([]diagnostic.Spec, error) {
	a.calls++
	a.received = append([]byte(nil), log.Content...)
	return a.ownCheck.HealthChecks(ctx, fs, inst, nil)
}

func TestEvaluateRunLogChecks(t *testing.T) {
	for _, tt := range []struct {
		name                              string
		missing, noCapability, undeclared bool
		calls                             int
	}{
		{"declared", false, false, false, 1},
		{"missing log", true, false, false, 0},
		{"without health capability", false, true, false, 0},
		{"undeclared code", false, false, true, 1},
	} {
		t.Run(tt.name, func(t *testing.T) {
			e := ownCheckEnv(t, true)
			a := &runLogAdapter{ownCheck: ownCheck{declare: !tt.undeclared}, withoutCapability: tt.noCapability}
			registry, err := games.NewRegistry(a)
			if err != nil {
				t.Fatal(err)
			}
			e.diag.Registry = registry
			fs := memfs.New("C:")
			const content = "run log contents\r\n"
			if !tt.missing {
				fs.AddFile(`C:\Users\A\Documents\Game\run.log`, content)
			}
			e.diag.FS = fs
			e.diag.Folders = knownPlaces{ports.FolderDocuments: `C:\Users\A\Documents`}
			ds, partial, err := e.diag.Evaluate(ctx, e.inst.ID)
			if err != nil {
				t.Fatal(err)
			}
			if a.calls != tt.calls {
				t.Fatalf("RunLogChecks calls = %d, want %d", a.calls, tt.calls)
			}
			if a.calls > 0 && string(a.received) != content {
				t.Fatalf("received = %q", a.received)
			}
			found := false
			for _, d := range ds {
				if d.Code == codeOwn {
					found = true
				}
			}
			if tt.undeclared {
				// Evaluate isolates failed groups and reports the error as partial.
				if !partial || found {
					t.Fatalf("undeclared: partial=%v, diagnostics=%+v", partial, ds)
				}
			} else if partial || found != (tt.calls > 0) {
				t.Fatalf("partial=%v, diagnostics = %+v", partial, ds)
			}
		})
	}
}

func TestGenericHasNoRunLogChecks(t *testing.T) {
	e := newEnvWith(t, envOptions{generic: true})
	fs := memfs.New("C:")
	fs.AddFile(`C:\Users\A\Documents\Game\run.log`, "run log contents")
	e.diag.FS = fs
	e.diag.Folders = knownPlaces{ports.FolderDocuments: `C:\Users\A\Documents`}
	ds, partial, err := e.diag.Evaluate(ctx, e.inst.ID)
	if err != nil || partial {
		t.Fatalf("generic: partial=%v, err=%v", partial, err)
	}
	for _, d := range ds {
		if d.Code == codeOwn {
			t.Fatalf("generic run log diagnostic = %+v", d)
		}
	}
}
