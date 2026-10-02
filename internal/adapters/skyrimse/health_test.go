package skyrimse

import (
	"context"
	"testing"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/testutil/memfs"
)

func TestFrameworkMissing(t *testing.T) {
	ctx := context.Background()
	fs := memfs.New("C:")
	fs.AddFile(`C:\Skyrim\SkyrimSE.exe`, "")
	inst := game.Instance{ID: "i1", Root: `C:\Skyrim`}
	plugin := ports.ModContent{ID: "m1", Name: "Engine Fixes", Content: []mod.ContentFlag{FlagSKSEPlugin}, Enabled: true}
	specs, err := Adapter{}.HealthChecks(ctx, fs, inst, []ports.ModContent{plugin})
	if err != nil || len(specs) != 1 || specs[0].Code != diagnostic.CodeFrameworkMissing {
		t.Fatalf("specs = %+v %v", specs, err)
	}
	if _, err := diagnostic.New(specs[0]); err != nil {
		t.Fatalf("the check is a valid error with an action (INV-OPS-06): %v", err)
	}
	skse := ports.ModContent{ID: "m2", Name: "SKSE", Type: ModTypeSKSE, Enabled: true}
	if specs, _ := (Adapter{}).HealthChecks(ctx, fs, inst, []ports.ModContent{plugin, skse}); len(specs) != 0 {
		t.Fatal("an enabled skse mod satisfies it")
	}
	fs.AddFile(`C:\Skyrim\skse64_loader.exe`, "")
	if specs, _ := (Adapter{}).HealthChecks(ctx, fs, inst, []ports.ModContent{plugin}); len(specs) != 0 {
		t.Fatal("an unmanaged loader in the root satisfies it")
	}
	plugin.Enabled = false
	if specs, _ := (Adapter{}).HealthChecks(ctx, memfs.New("C:"), inst, []ports.ModContent{plugin}); len(specs) != 0 {
		t.Fatal("disabled mods do not need the framework")
	}
}
