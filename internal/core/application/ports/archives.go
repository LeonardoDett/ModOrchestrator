package ports

import (
	"context"
	"errors"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/plugin"
)

// ArchiveIndex is implemented by adapters of games that read archives (BSA,
// BA2) as part of the plugin target (D147). It is a sub-contract of the
// plugins capability, like PluginArchives: in these games an archive loads
// because an active plugin loads it, so which archives load and in which
// order follows the load order.
//
// The rule between the files is the contract's, not the adapter's: a loose
// file in the target wins over the same path inside any archive, whatever
// the mod order; among archives, the one later in LoadedArchives wins. The
// core only reports these disputes (conflicts and deploy do not change).
type ArchiveIndex interface {
	// LoadedArchives returns, among the file names at the top of the plugin
	// target, the archives the game loads with the active plugins (given in
	// load order), in the order the game reads them.
	LoadedArchives(id game.ID, files []string, active []plugin.Name) []string
	// ReadArchiveIndex lists the paths of the files inside the archive at
	// path (absolute, in the staging), relative to the plugin target with
	// any separator. It reads only the index, never the contents, and
	// returns ErrArchiveUnreadable for a format it does not read (the UI
	// then shows the rule without the calculation).
	ReadArchiveIndex(ctx context.Context, fs FileReader, id game.ID, path string) ([]string, error)
}

// ErrArchiveUnreadable: the adapter does not read the index of this
// archive (unknown format or version, names not stored, damaged file).
var ErrArchiveUnreadable = errors.New("archive index not readable")
