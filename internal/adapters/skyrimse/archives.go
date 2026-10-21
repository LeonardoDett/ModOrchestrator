package skyrimse

import (
	"context"
	"encoding/binary"
	"io"
	"strconv"
	"strings"

	"modorchestrator/sdk"
	"modorchestrator/sdk/diagnostic"
	"modorchestrator/sdk/event"
	"modorchestrator/sdk/game"
	"modorchestrator/sdk/health"
	"modorchestrator/sdk/plugin"
)

var _ sdk.ArchiveChecker = Adapter{}

// CodeArchiveWrongGame: an archive an active plugin loads was built for
// another game (D141). Skyrim SE reads only version 105; a version 104
// archive (Skyrim LE, Fallout 3, New Vegas) makes the game crash or show
// missing textures and meshes. Same rule as Vortex (gamebryo-archive-check).
const CodeArchiveWrongGame diagnostic.Code = "archive_wrong_game"

const (
	// ArchiveVersion is the BSA version of Skyrim SE; ArchiveVersionLE the
	// one of Skyrim LE.
	ArchiveVersion   = 105
	ArchiveVersionLE = 104
	archiveMagic     = "BSA\x00"
)

// OrphanArchives: a BSA loads when an active plugin has the same base name
// ("Mod.bsa", "Mod - Textures.bsa" for "Mod.esp", core/12 §5).
func (Adapter) OrphanArchives(_ game.ID, files []string, active []plugin.Name) []string {
	bases := pluginBases(active)
	var out []string
	for _, f := range files {
		if isArchive(f) && !loads(bases, f) {
			out = append(out, f)
		}
	}
	return out
}

// ArchiveChecks reads the header of every BSA an active plugin loads and
// reports the ones of another game (archive_wrong_game, an error). A file
// that is not a BSA, or cannot be read, is left alone: the header reader
// is not the place to judge it.
func (Adapter) ArchiveChecks(ctx context.Context, fs sdk.FileReader, inst game.Instance, files []sdk.TargetFile, active []plugin.Name) ([]diagnostic.Spec, error) {
	bases := pluginBases(active)
	var out []diagnostic.Spec
	for _, f := range files {
		if !isArchive(f.Name) || !loads(bases, f.Name) {
			continue
		}
		version, ok := archiveVersion(ctx, fs, f.Source)
		if !ok || version == ArchiveVersion {
			continue
		}
		ref := event.EntityRef{Kind: "mod", ID: string(f.Mod)}
		p := diagnostic.Params{"archive": f.Name, "mod": f.ModName, "version": strconv.Itoa(int(version)), "expected": strconv.Itoa(ArchiveVersion)}
		out = append(out, diagnostic.Spec{
			Code: CodeArchiveWrongGame, Severity: diagnostic.SeverityError, Params: p,
			Evidence: []diagnostic.Evidence{{Kind: "archive_version", Ref: &ref, Params: p}},
			Actions:  []diagnostic.Action{{ID: health.ActionOpenModFolder, Target: &ref, NavigateTo: health.NavigateModFolder}},
			Related:  []event.EntityRef{ref, {Kind: "archive", ID: strings.ToLower(f.Name)}},
		})
	}
	return out, nil
}

// archiveVersion reads the magic and the version of a BSA header.
func archiveVersion(ctx context.Context, fs sdk.FileReader, path string) (uint32, bool) {
	r, err := fs.Open(ctx, path)
	if err != nil {
		return 0, false
	}
	defer r.Close()
	var head [8]byte
	if _, err := io.ReadFull(r, head[:]); err != nil || string(head[:4]) != archiveMagic {
		return 0, false
	}
	return binary.LittleEndian.Uint32(head[4:]), true
}

func isArchive(name string) bool { return strings.HasSuffix(strings.ToLower(name), ".bsa") }

// pluginBases are the lower-case base names of the active plugins.
func pluginBases(active []plugin.Name) map[string]bool {
	bases := map[string]bool{}
	for _, p := range active {
		n := strings.ToLower(string(p))
		bases[n[:max(strings.LastIndex(n, "."), 0)]] = true
	}
	return bases
}

// loads reports whether an active plugin loads the archive name.
func loads(bases map[string]bool, name string) bool {
	base := strings.TrimSuffix(strings.ToLower(name), ".bsa")
	if bases[base] {
		return true
	}
	i := strings.LastIndex(base, " - ")
	return i > 0 && bases[base[:i]]
}
