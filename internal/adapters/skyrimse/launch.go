package skyrimse

import (
	"context"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
)

var _ ports.LaunchSupport = Adapter{}

// Launch options (core/12 §8): through the SKSE loader when it is in the
// game root, managed or not (default), with "Lançar sem SKSE" in the Play
// menu; otherwise the game executable. Steam copies start directly, without
// the store. The working folder is the game root.
const (
	LaunchSKSE = "skse"
	LaunchGame = "game"
)

// LaunchOptions implements ports.LaunchSupport.
func (Adapter) LaunchOptions(ctx context.Context, fs ports.FileReader, inst game.Instance) ([]ports.LaunchOption, error) {
	loader, err := fs.Stat(ctx, game.JoinPath(inst.Root, Loader))
	if err != nil {
		return nil, err
	}
	if loader.Exists && !loader.IsDir {
		return []ports.LaunchOption{
			{ID: LaunchSKSE, Exe: Loader, Default: true},
			{ID: LaunchGame, Exe: Executable},
		}, nil
	}
	return []ports.LaunchOption{{ID: LaunchGame, Exe: Executable, Default: true}}, nil
}
