package library

import (
	"context"
	"slices"
	"strings"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/installer"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/relpath"
)

// maxTopEntries bounds the top-level names an unrecognized mod reports.
const maxTopEntries = 3

// UnrecognizedMod is an installed mod whose files the game would not use
// (D151, mod_content_unrecognized): Top lists the names at the top of its
// files, the usual sign of a folder too many ("MyMod/meshes/...").
type UnrecognizedMod struct {
	Mod  mod.ID
	Name string
	Top  []string
}

// UnrecognizedContent lists the installed mods of the default type whose
// files the root hints of the adapter do not recognize and in which the
// adapter detected no content (mod.Content). A game without root hints
// (the generic adapter without them in its manifest) has no such check. A
// mod with a file outside the default target is left alone: that file was
// placed on purpose, by a FOMOD or by the user.
func (s *Service) UnrecognizedContent(ctx context.Context, instance game.InstanceID) ([]UnrecognizedMod, error) {
	e, err := s.env(ctx, instance)
	if err != nil {
		return nil, err
	}
	h := e.adapter.RootHints(e.inst.Game)
	hints := installer.RootHints{Dirs: h.Dirs, Extensions: h.Extensions}
	if hints.Empty() {
		return nil, nil
	}
	def, ok := e.def.ModType(game.DefaultModType)
	if !ok {
		return nil, nil
	}
	list, err := s.Mods.ListByInstance(ctx, instance)
	if err != nil {
		return nil, err
	}
	var out []UnrecognizedMod
	for _, m := range list {
		// Detected content is enough: only the mods with none are read.
		if m.State != mod.StateInstalled || m.Installation == "" || len(m.Content) > 0 {
			continue
		}
		if m.Type != "" && m.Type != game.DefaultModType {
			continue
		}
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		inst, err := s.Installations.Get(ctx, m.Installation)
		if err != nil {
			return nil, err
		}
		footprint := inst.ContentFootprint()
		if len(footprint) == 0 {
			continue
		}
		paths := make([]relpath.Path, 0, len(footprint))
		elsewhere := false
		for _, loc := range footprint {
			if loc.Target != def.Target {
				elsewhere = true
				break
			}
			paths = append(paths, loc.Path)
		}
		if elsewhere || hints.Recognizes(paths) {
			continue
		}
		out = append(out, UnrecognizedMod{Mod: m.ID, Name: m.DisplayName(), Top: topEntries(paths)})
	}
	return out, nil
}

// topEntries are the distinct names at the top of paths, sorted, at most
// maxTopEntries.
func topEntries(paths []relpath.Path) []string {
	seen := map[string]bool{}
	var out []string
	for _, p := range paths {
		top, _, _ := strings.Cut(p.String(), "/")
		if k := strings.ToLower(top); !seen[k] {
			seen[k] = true
			out = append(out, top)
		}
	}
	slices.SortFunc(out, func(a, b string) int { return strings.Compare(strings.ToLower(a), strings.ToLower(b)) })
	if len(out) > maxTopEntries {
		out = out[:maxTopEntries]
	}
	return out
}
