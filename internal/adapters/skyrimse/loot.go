package skyrimse

import (
	_ "embed"
	"time"

	"modorchestrator/sdk"
	"modorchestrator/sdk/game"
)

// The LOOT masterlist and prelude shipped with the app (D141). Both are
// CC0 (github.com/loot/skyrimse and github.com/loot/prelude, branch v0.29);
// loot/SOURCE.md says which commits and how to refresh them.
var (
	//go:embed loot/masterlist.yaml
	lootMasterlist []byte
	//go:embed loot/prelude.yaml
	lootPrelude []byte
)

// lootDate is the date of the masterlist commit shipped (loot/SOURCE.md).
var lootDate = time.Date(2026, 10, 20, 1, 16, 11, 0, time.UTC)

var _ sdk.LootSupport = (*Adapter)(nil)

// LootGame declares the game to the LOOT provider: Skyrim SE uses the
// "skyrimse" masterlist, and LOOT keeps its data in the
// "Skyrim Special Edition" folder.
func (a *Adapter) LootGame(id game.ID) (sdk.LootGame, bool) {
	if id != GameID {
		return sdk.LootGame{}, false
	}
	return sdk.LootGame{Repository: "skyrimse", Folder: "Skyrim Special Edition", Masterlist: lootMasterlist, Prelude: lootPrelude, Date: lootDate}, true
}
