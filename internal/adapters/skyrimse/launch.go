package skyrimse

import (
	"context"

	"modorchestrator/sdk"
	"modorchestrator/sdk/game"
)

var _ sdk.LaunchSupport = Adapter{}

// Launch options (core/12 §8): through the SKSE loader when it is in the
// game root, managed or not (default), with "Lançar sem SKSE" in the Play
// menu; otherwise the game executable. Steam copies start directly, without
// the store. The working folder is the game root.
const (
	LaunchSKSE = "skse"
	LaunchGame = "game"
)

// LaunchOptions implements sdk.LaunchSupport.
func (Adapter) LaunchOptions(ctx context.Context, fs sdk.FileReader, inst game.Instance) ([]sdk.LaunchOption, error) {
	loader, err := fs.Stat(ctx, game.JoinPath(inst.Root, Loader))
	if err != nil {
		return nil, err
	}
	if loader.Exists && !loader.IsDir {
		return []sdk.LaunchOption{
			{ID: LaunchSKSE, Exe: Loader, Default: true},
			{ID: LaunchGame, Exe: Executable},
		}, nil
	}
	return []sdk.LaunchOption{{ID: LaunchGame, Exe: Executable, Default: true}}, nil
}
