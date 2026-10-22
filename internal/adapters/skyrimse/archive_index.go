package skyrimse

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"modorchestrator/internal/adapters/gamebryo"
	"modorchestrator/sdk"
	"modorchestrator/sdk/game"
	"modorchestrator/sdk/plugin"
)

var _ sdk.ArchiveIndex = Adapter{}

// LoadedArchives lists the BSAs the active plugins load, in the order the
// game reads them (D147): plugin by plugin in load order, and for each one
// "Mod.bsa" before the suffixed ones ("Mod - Textures.bsa"), by name. The
// archives of Skyrim.ini (the game's own) are not files of mods.
func (Adapter) LoadedArchives(_ game.ID, files []string, active []plugin.Name) []string {
	position := map[string]int{}
	for i, p := range active {
		n := strings.ToLower(string(p))
		base := n[:max(strings.LastIndex(n, "."), 0)]
		if _, ok := position[base]; !ok {
			position[base] = i
		}
	}
	type loaded struct {
		name     string
		plugin   int
		suffixed bool
	}
	var out []loaded
	seen := map[string]bool{}
	for _, f := range files {
		if !isArchive(f) || seen[strings.ToLower(f)] {
			continue
		}
		seen[strings.ToLower(f)] = true
		base := strings.TrimSuffix(strings.ToLower(f), ".bsa")
		if i, ok := position[base]; ok {
			out = append(out, loaded{f, i, false})
			continue
		}
		if j := strings.LastIndex(base, " - "); j > 0 {
			if i, ok := position[base[:j]]; ok {
				out = append(out, loaded{f, i, true})
			}
		}
	}
	slices.SortStableFunc(out, func(a, b loaded) int {
		switch {
		case a.plugin != b.plugin:
			return a.plugin - b.plugin
		case a.suffixed != b.suffixed:
			if a.suffixed {
				return 1
			}
			return -1
		}
		return strings.Compare(strings.ToLower(a.name), strings.ToLower(b.name))
	})
	names := make([]string, len(out))
	for i, l := range out {
		names[i] = l.name
	}
	return names
}

// ReadArchiveIndex reads the file names of a BSA of Skyrim SE (version
// 105). Another version is not read here: the game does not read it either,
// and archive_wrong_game already reports it (D141).
func (Adapter) ReadArchiveIndex(ctx context.Context, fs sdk.FileReader, _ game.ID, path string) ([]string, error) {
	rc, err := fs.Open(ctx, path)
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	idx, err := gamebryo.ArchiveIndex(rc)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", sdk.ErrArchiveUnreadable, err)
	}
	if idx.Format != "bsa" || idx.Version != ArchiveVersion {
		return nil, fmt.Errorf("%w: %s version %d", sdk.ErrArchiveUnreadable, idx.Format, idx.Version)
	}
	return idx.Paths, nil
}
