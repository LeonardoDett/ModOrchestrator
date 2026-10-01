package library

import (
	"context"
	"slices"
	"strconv"
	"strings"

	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/ordering"
)

type orderEdge = ordering.Edge

// orderEdges are the enabled order rules of the instance, as mod edges.
func (s *Service) orderEdges(ctx context.Context, instance game.InstanceID) []orderEdge {
	set, err := s.Rules.Get(ctx, instance)
	if err != nil {
		return nil
	}
	return set.OrderEdges()
}

// RemovalPreview is what DLG-07 shows before removing (core/02 §7).
type RemovalPreview struct {
	Mods []DuplicateMod
	// OrphanRules counts the rules that will reference a removed mod; they
	// are kept and reported, never deleted (INV-LIB-05).
	OrphanRules int
	// SharedArchives are archives kept even with "remove archive" because
	// another mod (a variant) still uses them (D066).
	SharedArchives []string
	// Deployed is always false until the deploy engine exists (F7).
	Deployed bool
}

// PreviewRemoval computes the consequences of removing ids.
func (s *Service) PreviewRemoval(ctx context.Context, instance game.InstanceID, ids []mod.ID) (RemovalPreview, error) {
	all, err := s.Mods.ListByInstance(ctx, instance)
	if err != nil {
		return RemovalPreview{}, err
	}
	removing := map[mod.ID]bool{}
	var out RemovalPreview
	for _, id := range ids {
		i := slices.IndexFunc(all, func(m *mod.Mod) bool { return m.ID == id && m.State != mod.StateRemoved })
		if i < 0 {
			return RemovalPreview{}, fail("not_found", nil, "mod", string(id))
		}
		removing[id] = true
		out.Mods = append(out.Mods, DuplicateMod{ID: id, Name: all[i].DisplayName(), Version: all[i].Attributes.Version})
	}
	remaining := map[mod.ID]bool{}
	for _, m := range all {
		if m.State != mod.StateRemoved && !removing[m.ID] {
			remaining[m.ID] = true
		}
	}
	if set, err := s.Rules.Get(ctx, instance); err == nil {
		before := map[string]bool{}
		for _, r := range set.Orphans(withRemoving(remaining, removing)) {
			before[string(r)] = true
		}
		for _, r := range set.Orphans(remaining) {
			if !before[string(r)] {
				out.OrphanRules++
			}
		}
	}
	for _, id := range ids {
		m := all[slices.IndexFunc(all, func(m *mod.Mod) bool { return m.ID == id })]
		if m.Archive != "" && slices.ContainsFunc(all, func(o *mod.Mod) bool { return remaining[o.ID] && o.Archive == m.Archive }) {
			if a, err := s.Archives.Get(ctx, m.Archive); err == nil && !slices.Contains(out.SharedArchives, a.OriginalName) {
				out.SharedArchives = append(out.SharedArchives, a.OriginalName)
			}
		}
	}
	return out, nil
}

func withRemoving(remaining, removing map[mod.ID]bool) map[mod.ID]bool {
	out := map[mod.ID]bool{}
	for k := range remaining {
		out[k] = true
	}
	for k := range removing {
		out[k] = true
	}
	return out
}

// RemoveMods removes mods as one operation (core/02 §7): entries leave every
// profile, rules and overrides that cite them stay and become orphans
// (INV-LIB-05), the staging folders are deleted and, when asked, archives
// no other mod uses. Deploy becomes pending once F7 exists.
func (s *Service) RemoveMods(ctx context.Context, instance game.InstanceID, ids []mod.ID, withArchives bool) (operation.ID, error) {
	if len(ids) == 0 {
		return "", nil
	}
	release, err := s.Locks.Acquire(instance, holderRemove)
	if err != nil {
		return "", err
	}
	defer release()
	e, err := s.env(ctx, instance)
	if err != nil {
		return "", err
	}
	spec := operations.Spec{Kind: KindRemove, Subject: event.EntityRef{Kind: subjectInstance, ID: string(instance)}, Steps: []string{StepValidate, StepCommit, StepCleanup}}
	var inner error
	id, err := s.Ops.Run(ctx, spec, func(ctx context.Context, t *operations.Tracker) error {
		inner = s.remove(ctx, t, e, ids, withArchives)
		if inner != nil {
			return opError(inner)
		}
		return nil
	})
	if inner != nil {
		return id, inner
	}
	return id, err
}

func (s *Service) remove(ctx context.Context, t *operations.Tracker, e env, ids []mod.ID, withArchives bool) error {
	if err := t.BeginStep(ctx, StepValidate); err != nil {
		return err
	}
	all, err := s.Mods.ListByInstance(ctx, e.inst.ID)
	if err != nil {
		return err
	}
	removing := map[mod.ID]bool{}
	for _, id := range ids {
		i := slices.IndexFunc(all, func(m *mod.Mod) bool { return m.ID == id })
		if i < 0 || all[i].State == mod.StateRemoved {
			return fail("not_found", nil, "mod", string(id))
		}
		if all[i].State == mod.StateInstalling {
			return fail(CodeModBusy, nil, "mod", all[i].DisplayName())
		}
		removing[id] = true
	}
	// Archives to delete: asked for, and used by no mod that stays.
	var archives []mod.ArchiveID
	if withArchives {
		for _, m := range all {
			if !removing[m.ID] || m.Archive == "" || slices.Contains(archives, m.Archive) {
				continue
			}
			shared := slices.ContainsFunc(all, func(o *mod.Mod) bool {
				return !removing[o.ID] && o.State != mod.StateRemoved && o.Archive == m.Archive
			})
			if !shared {
				archives = append(archives, m.Archive)
			}
		}
	}
	if err := t.CompleteStep(ctx, StepValidate); err != nil {
		return err
	}

	if err := t.BeginStep(ctx, StepCommit); err != nil {
		return err
	}
	now := s.Clock.Now()
	var archivePaths []string
	err = s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		profiles, err := tx.Profiles().ListByInstance(ctx, e.inst.ID)
		if err != nil {
			return err
		}
		for _, p := range profiles {
			changed := false
			for id := range removing {
				if _, ok := p.ModState(id); ok {
					if err := p.RemoveMod(id, now); err != nil {
						return err
					}
					changed = true
				}
			}
			if changed {
				if err := tx.Profiles().Save(ctx, p); err != nil {
					return err
				}
			}
		}
		for _, id := range ids {
			m, err := tx.Mods().Get(ctx, id)
			if err != nil {
				return err
			}
			if err := m.Remove(now); err != nil {
				return fail(CodeModBusy, err, "mod", m.DisplayName())
			}
			if err := tx.Mods().Save(ctx, m); err != nil {
				return err
			}
			tx.Emit(s.newEvent(EventModRemoved, subjectMod, string(id), t.ID(), map[string]string{
				"name": m.DisplayName(), "withArchive": strconv.FormatBool(slices.Contains(archives, m.Archive)),
			}))
		}
		for _, aid := range archives {
			a, err := tx.Archives().Get(ctx, aid)
			if err != nil {
				if notFound(err) {
					continue
				}
				return err
			}
			if a.Retained() {
				archivePaths = append(archivePaths, game.JoinPath(e.inst.ArchiveStore, archiveDir(a)))
			}
			if err := tx.Archives().Delete(ctx, aid); err != nil {
				return err
			}
			tx.Emit(s.newEvent(EventArchiveRemoved, subjectArchive, string(aid), t.ID(), map[string]string{"name": a.OriginalName}))
		}
		return nil
	})
	if err != nil {
		return err
	}
	if err := t.CompleteStep(ctx, StepCommit); err != nil {
		return err
	}

	// After the commit a failure to delete a folder leaves garbage that
	// recovery removes on the next start (the mod is removed in the database).
	if err := t.BeginStep(ctx, StepCleanup); err != nil {
		return err
	}
	if s.ownsFolder(ctx, e.inst.Staging, game.StagingMarker, e.inst.ID) {
		for _, id := range ids {
			_ = s.FS.RemoveAll(ctx, e.modFolder(id))
		}
	}
	if s.ownsFolder(ctx, e.inst.ArchiveStore, game.ArchivesMarker, e.inst.ID) {
		for _, p := range archivePaths {
			_ = s.FS.RemoveAll(ctx, p)
		}
	}
	return t.CompleteStep(ctx, StepCleanup)
}

// archiveDir is the folder of a retained archive inside the ArchiveStore.
func archiveDir(a *mod.Archive) string {
	first, _, _ := strings.Cut(a.Stored.String(), "/")
	return first
}

// AttributesInput is what the user edits (core/02 §9).
type AttributesInput struct {
	Name, Version, Author, Notes  string
	HighlightColor, HighlightIcon string
	Tags                          []string
}

// SetAttributes changes the editable metadata; renaming never moves files
// (INV-ID-03).
func (s *Service) SetAttributes(ctx context.Context, id mod.ID, in AttributesInput) error {
	return s.editMod(ctx, id, func(m *mod.Mod) (map[string]string, error) {
		a := m.Attributes
		// A name equal to the detected one is not a custom name: clearing it
		// lets a later reinstall update the detected name (core/02 §9).
		name := strings.TrimSpace(in.Name)
		if strings.EqualFold(name, m.Name) {
			name = ""
		}
		a.Name, a.Version, a.Author, a.Notes = name, strings.TrimSpace(in.Version), strings.TrimSpace(in.Author), in.Notes
		a.Highlight = mod.Highlight{Color: in.HighlightColor, Icon: in.HighlightIcon}
		a.Tags = in.Tags
		return map[string]string{"name": m.DisplayName()}, m.SetAttributes(a, s.Clock.Now())
	}, EventModAttributes)
}

// SetCategory assigns a category to mods ("" removes it).
func (s *Service) SetCategory(ctx context.Context, instance game.InstanceID, ids []mod.ID, category mod.CategoryID) error {
	if category != "" {
		tree, err := s.categoryTree(ctx, instance)
		if err != nil {
			return err
		}
		if !tree.Has(category) {
			return fail(CodeCategoryInvalid, nil, "category", string(category))
		}
	}
	for _, id := range ids {
		err := s.editMod(ctx, id, func(m *mod.Mod) (map[string]string, error) {
			if m.Instance != instance {
				return nil, fail("not_found", nil, "mod", string(id))
			}
			return map[string]string{"category": string(category)}, m.SetCategory(category, s.Clock.Now())
		}, EventModCategory)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) editMod(ctx context.Context, id mod.ID, fn func(*mod.Mod) (map[string]string, error), t event.Type) error {
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		m, err := tx.Mods().Get(ctx, id)
		if err != nil {
			return err
		}
		if m.State == mod.StateInstalling {
			return fail(CodeModBusy, nil, "mod", m.DisplayName())
		}
		payload, err := fn(m)
		if err != nil {
			return err
		}
		tx.Emit(s.newEvent(t, subjectMod, string(id), "", payload))
		return tx.Mods().Save(ctx, m)
	})
}

// SetModType changes the mod type (Advanced). Files do not move in the
// staging; the installation is recorded again with the new target, so the
// desired state sees new content (core/02 §9).
func (s *Service) SetModType(ctx context.Context, id mod.ID, typ game.ModTypeID) error {
	m, err := s.Mods.Get(ctx, id)
	if err != nil {
		return err
	}
	e, err := s.env(ctx, m.Instance)
	if err != nil {
		return err
	}
	mt, ok := e.def.ModType(typ)
	if !ok {
		return fail(CodeModTypeUnknown, nil, "type", string(typ))
	}
	release, err := s.Locks.Acquire(m.Instance, holderSetType)
	if err != nil {
		return err
	}
	defer release()
	now := s.Clock.Now()
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		m, err := tx.Mods().Get(ctx, id)
		if err != nil {
			return err
		}
		if m.State == mod.StateInstalling {
			return fail(CodeModBusy, nil, "mod", m.DisplayName())
		}
		old := m.Type
		if err := m.SetType(mt.ID, now); err != nil {
			return err
		}
		if m.Installation != "" {
			prev, err := tx.Installations().Get(ctx, m.Installation)
			if err != nil {
				return err
			}
			files := make([]mod.File, len(prev.Files))
			for i, f := range prev.Files {
				f.Dest.Target = mt.Target
				files[i] = f
			}
			next, err := mod.NewInstallation(mod.InstallationID(s.IDs.NewID()), m.ID, m.Instance, prev.Installer, prev.Options, files, now)
			if err != nil {
				return err
			}
			m.Installation = next.ID
			m.Content = e.adapter.ContentFlags(e.inst.Game, next.Footprint())
			if err := tx.Installations().Save(ctx, next); err != nil {
				return err
			}
			if err := tx.Installations().Delete(ctx, prev.ID); err != nil {
				return err
			}
		}
		tx.Emit(s.newEvent(EventModType, subjectMod, string(id), "", map[string]string{"from": string(old), "to": string(mt.ID)}))
		return tx.Mods().Save(ctx, m)
	})
}

