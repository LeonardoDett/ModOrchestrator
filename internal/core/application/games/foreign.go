package games

import (
	"context"
	"io"

	"modorchestrator/internal/core/domain/game"
)

// markerReadLimit bounds how much of a marker file is read; real markers
// are a few hundred bytes.
const markerReadLimit = 64 << 10

// Finding is a sign that another manager (or another instance of this app)
// deployed into the game (core/04 §11, INV-DEP-08). It is calculated from
// the filesystem each time; the blocking diagnostic `foreign_deployment`
// that the UI shows is derived from it (F9), never stored.
type Finding struct {
	Kind game.ForeignKind
	// Target is the target the evidence sits in; empty for the game root.
	Target game.TargetID
	// Name is the file or folder that gives it away.
	Name string
	// Instance is the owner when Kind is ForeignInstance.
	Instance game.InstanceID
}

// CheckForeign looks for marks of other managers at the top of every target
// and of the game root. A folder that cannot be listed is skipped: it cannot
// be deployed to either, and the target check of the deploy (F7) reports it.
func (s *Service) CheckForeign(ctx context.Context, inst game.Instance) ([]Finding, error) {
	var out []Finding
	seen := map[string]bool{}
	for _, t := range inst.Targets {
		if seen[game.CleanAbs(t.Path)] {
			continue
		}
		seen[game.CleanAbs(t.Path)] = true
		entries, err := s.FS.ReadDir(ctx, t.Path)
		if err != nil {
			continue
		}
		for _, e := range entries {
			ge := game.Entry{Name: e.Name, IsDir: e.IsDir}
			if kind, ok := game.ClassifyTargetEntry(ge); ok {
				out = append(out, Finding{Kind: kind, Target: t.ID, Name: e.Name})
				continue
			}
			if !e.IsDir && game.IsDeploymentMarker(e.Name) {
				if f, ok := s.otherInstanceMarker(ctx, inst, t, e.Name); ok {
					out = append(out, f)
				}
			}
		}
	}
	if entries, err := s.FS.ReadDir(ctx, inst.Root); err == nil {
		list := make([]game.Entry, len(entries))
		for i, e := range entries {
			list[i] = game.Entry{Name: e.Name, IsDir: e.IsDir}
		}
		if kind, ok := game.ClassifyRoot(list); ok {
			out = append(out, Finding{Kind: kind, Name: "ModOrganizer"})
		}
	}
	return out, nil
}

// otherInstanceMarker reports a deployment marker that does not belong to
// inst. An unreadable or malformed marker counts as foreign: ownership must
// be proven, never assumed.
func (s *Service) otherInstanceMarker(ctx context.Context, inst game.Instance, t game.Target, name string) (Finding, bool) {
	f := Finding{Kind: game.ForeignInstance, Target: t.ID, Name: name}
	r, err := s.FS.Open(ctx, game.JoinPath(t.Path, name))
	if err != nil {
		return f, true
	}
	defer r.Close()
	data, err := io.ReadAll(io.LimitReader(r, markerReadLimit))
	if err != nil {
		return f, true
	}
	owner, err := game.ParseMarker(data)
	if err != nil {
		return f, true
	}
	if inst.ID != "" && owner == inst.ID {
		return Finding{}, false
	}
	f.Instance = owner
	return f, true
}
