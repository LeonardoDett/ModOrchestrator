package games

import (
	"context"
	"errors"
	"strings"
	"slices"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
)

// stateSeenVersion keys the game version the user last acknowledged
// (game_version_changed, core/12 §7).
const stateSeenVersion = "games.seenVersion."

// processNames are the executables of a running instance: the ones the
// adapter declares plus the executable of a generic game.
func (s *Service) processNames(inst game.Instance) []string {
	var names []string
	if a, ok := s.Registry.ByName(inst.Adapter); ok {
		if d, ok := a.(ports.ProcessDeclarer); ok {
			names = append(names, d.Processes(inst.Game)...)
		}
	}
	if inst.Executable != "" {
		names = append(names, baseName(inst.Executable))
	}
	slices.Sort(names)
	return slices.Compact(names)
}

// RunningProcesses lists the game processes running now (game_running,
// core/11 §6). Without a probe nothing runs.
func (s *Service) RunningProcesses(ctx context.Context, inst game.Instance) ([]string, error) {
	names := s.processNames(inst)
	if s.Processes == nil || len(names) == 0 {
		return nil, nil
	}
	return s.Processes.Running(ctx, names)
}

// VersionCheck compares the installed game version with the one the user
// last acknowledged. The first version seen is recorded silently, so only
// a later change is reported (game_version_changed).
func (s *Service) VersionCheck(ctx context.Context, inst game.Instance) (current, seen string, err error) {
	a, ok := s.Registry.ByName(inst.Adapter)
	if !ok {
		return "", "", nil
	}
	current = s.version(ctx, a, inst.Game, inst.Root)
	if current == "" {
		return "", "", nil
	}
	seen, err = s.State.Get(ctx, stateSeenVersion+string(inst.ID))
	if errors.Is(err, ports.ErrNotFound) {
		return current, current, s.State.Set(ctx, stateSeenVersion+string(inst.ID), current)
	}
	return current, seen, err
}

// AcknowledgeVersion records the installed version as seen.
func (s *Service) AcknowledgeVersion(ctx context.Context, id game.InstanceID) error {
	inst, err := s.Instances.Get(ctx, id)
	if err != nil {
		return err
	}
	a, ok := s.Registry.ByName(inst.Adapter)
	if !ok {
		return nil
	}
	if v := s.version(ctx, a, inst.Game, inst.Root); v != "" {
		return s.State.Set(ctx, stateSeenVersion+string(id), v)
	}
	return nil
}

// baseName is the last element of a relative path with / or \ separators.
func baseName(p string) string {
	if i := strings.LastIndexAny(p, "/\\"); i >= 0 {
		return p[i+1:]
	}
	return p
}
