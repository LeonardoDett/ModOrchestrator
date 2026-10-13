package deployment

import (
	"context"
	"encoding/json"
	"errors"
	"slices"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/game"
)

// stateCreatedTargets is the app_state key of the target folders the
// manager created (D118), by instance: only those are removed again, and
// only when empty (INV-DEP-09).
const stateCreatedTargets = "deployment.createdTargets"

// creatableTargets says which missing target folders a deploy may create:
// the ones the definition lists, inside a game folder that is there. A
// missing game folder (a drive that is not connected) creates nothing.
func (s *Service) creatableTargets(ctx context.Context, inst game.Instance, def game.Definition) func(game.Target) bool {
	if len(def.CreatableTargets) == 0 {
		return nil
	}
	root := s.observe(ctx, inst.Root)
	return func(t game.Target) bool {
		return root.Exists && root.IsDir && game.Within(t.Path, inst.Root) && slices.Contains(def.CreatableTargets, t.ID)
	}
}

// createTargets creates the missing creatable targets the actions write
// to. The creation is recorded first, so a folder left by an interrupted
// run is still known as ours.
func (s *Service) createTargets(ctx context.Context, inst game.Instance, def game.Definition, actions []deployment.Action) error {
	creatable := s.creatableTargets(ctx, inst, def)
	if creatable == nil {
		return nil
	}
	used := map[game.TargetID]bool{}
	for _, a := range actions {
		switch a.Kind {
		case deployment.ActionRemoveManaged, deployment.ActionRestoreBackup, deployment.ActionRemoveDir:
		default:
			used[a.Location.Target] = true
		}
	}
	for _, t := range inst.Targets {
		if !used[t.ID] || !creatable(t) || s.observe(ctx, t.Path).Exists {
			continue
		}
		if err := s.recordCreatedTarget(ctx, inst.ID, t.ID, true); err != nil {
			return err
		}
		if err := s.FS.MkdirAll(ctx, t.Path); err != nil {
			return fail(fileErrorCode(err), err, "path", t.Path)
		}
	}
	return nil
}

// removeCreatedTargets removes the target folders the manager created that
// the manifest no longer uses, when they are empty. A folder that holds
// anything (files the game generated) stays, and stays recorded.
func (s *Service) removeCreatedTargets(ctx context.Context, inst game.Instance, m *deployment.Manifest) {
	all, err := s.createdTargets(ctx)
	if err != nil || len(all[string(inst.ID)]) == 0 {
		return
	}
	used := m.Targets()
	for _, id := range all[string(inst.ID)] {
		if slices.Contains(used, game.TargetID(id)) {
			continue
		}
		i := slices.IndexFunc(inst.Targets, func(t game.Target) bool { return string(t.ID) == id })
		if i < 0 {
			_ = s.recordCreatedTarget(ctx, inst.ID, game.TargetID(id), false)
			continue
		}
		_ = s.FS.RemoveEmptyDir(ctx, inst.Targets[i].Path)
		if !s.observe(ctx, inst.Targets[i].Path).Exists {
			_ = s.recordCreatedTarget(ctx, inst.ID, game.TargetID(id), false)
		}
	}
}

func (s *Service) createdTargets(ctx context.Context) (map[string][]string, error) {
	raw, err := s.State.Get(ctx, stateCreatedTargets)
	if errors.Is(err, ports.ErrNotFound) {
		return map[string][]string{}, nil
	}
	if err != nil {
		return nil, err
	}
	out := map[string][]string{}
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return map[string][]string{}, nil
	}
	return out, nil
}

func (s *Service) recordCreatedTarget(ctx context.Context, instance game.InstanceID, target game.TargetID, created bool) error {
	all, err := s.createdTargets(ctx)
	if err != nil {
		return err
	}
	list := slices.DeleteFunc(all[string(instance)], func(t string) bool { return t == string(target) })
	if created {
		list = append(list, string(target))
	}
	if len(list) == 0 {
		delete(all, string(instance))
	} else {
		all[string(instance)] = list
	}
	if len(all) == 0 {
		if err := s.State.Delete(ctx, stateCreatedTargets); err != nil && !errors.Is(err, ports.ErrNotFound) {
			return err
		}
		return nil
	}
	body, _ := json.Marshal(all)
	return s.State.Set(ctx, stateCreatedTargets, string(body))
}
