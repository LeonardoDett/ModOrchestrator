package skyrimse

import (
	"context"
	"testing"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/testutil/memfs"
)

func TestLaunchThroughTheLoaderWhenPresent(t *testing.T) {
	ctx := context.Background()
	fs := memfs.New(`C:\`)
	fs.AddFile(`C:\Games\Skyrim\SkyrimSE.exe`, "exe")
	inst := game.Instance{Root: `C:\Games\Skyrim`}
	opts, err := Adapter{}.LaunchOptions(ctx, fs, inst)
	if err != nil || len(opts) != 1 || opts[0].Exe != Executable || !opts[0].Default {
		t.Fatalf("without SKSE: %+v %v", opts, err)
	}
	fs.AddFile(`C:\Games\Skyrim\skse64_loader.exe`, "loader")
	opts, _ = Adapter{}.LaunchOptions(ctx, fs, inst)
	if len(opts) != 2 || opts[0].ID != LaunchSKSE || !opts[0].Default || opts[1].Default || opts[1].Exe != Executable {
		t.Fatalf("with SKSE: %+v", opts)
	}
}
