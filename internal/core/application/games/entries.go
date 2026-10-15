package games

import (
	"context"
	"errors"
	"io"
	"slices"
	"strings"
	"sync"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
)

// Entry is a game described by the user, with how many instances use it.
type Entry struct {
	Manifest  game.Manifest
	Instances int
}

// LoadEntries makes the registry serve the stored entries. It runs at
// startup and after every change. It returns the ids of the stored entries
// this build cannot read: they stay stored and their instances show as
// unavailable.
func (s *Service) LoadEntries(ctx context.Context) ([]game.ID, error) {
	list, unreadable, err := s.Entries.List(ctx)
	if err != nil {
		return nil, err
	}
	return unreadable, s.Registry.SetEntries(list)
}

// ListEntries returns the games the user described.
func (s *Service) ListEntries(ctx context.Context) ([]Entry, error) {
	list, _, err := s.Entries.List(ctx)
	if err != nil {
		return nil, err
	}
	instances, err := s.Instances.List(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Entry, 0, len(list))
	for _, m := range list {
		e := Entry{Manifest: m}
		for _, i := range instances {
			if i.Game == m.ID {
				e.Instances++
			}
		}
		out = append(out, e)
	}
	return out, nil
}

// ExportEntry returns the manifest of a user entry as the JSON document
// that ImportEntry reads.
func (s *Service) ExportEntry(ctx context.Context, id game.ID) ([]byte, error) {
	m, err := s.entry(ctx, id)
	if err != nil {
		return nil, err
	}
	return m.Marshal()
}

// ImportEntry adds a game from a manifest. The manifest is read whole or
// refused; its id moves into the user namespace, and an id already in use
// is refused instead of replaced, so importing never changes a game that
// has instances.
func (s *Service) ImportEntry(ctx context.Context, data []byte) (game.ID, error) {
	m, err := game.ParseManifest(data)
	switch {
	case errors.Is(err, game.ErrManifestSchema):
		return "", fail(CodeEntrySchema, err, "detail", err.Error())
	case err != nil:
		return "", fail(CodeEntryInvalid, err, "detail", err.Error())
	}
	m.ID = game.UserEntryID(m.ID)
	if err := m.Validate(); err != nil {
		return "", fail(CodeEntryInvalid, err, "detail", err.Error())
	}
	s.manageMu.Lock()
	defer s.manageMu.Unlock()
	if _, taken := s.Registry.Definition(m.ID); taken {
		return "", fail(CodeEntryExists, nil, "game", string(m.ID), "name", m.Name)
	}
	if err := s.saveEntry(ctx, m); err != nil {
		return "", err
	}
	return m.ID, nil
}

// DeleteEntry removes a user entry that no instance uses.
func (s *Service) DeleteEntry(ctx context.Context, id game.ID) error {
	s.manageMu.Lock()
	defer s.manageMu.Unlock()
	if _, err := s.entry(ctx, id); err != nil {
		return err
	}
	instances, err := s.Instances.List(ctx)
	if err != nil {
		return err
	}
	for _, i := range instances {
		if i.Game == id {
			return fail(CodeEntryInUse, nil, "game", string(id), "instance", i.DisplayName)
		}
	}
	return s.removeEntry(ctx, id)
}

func (s *Service) entry(ctx context.Context, id game.ID) (game.Manifest, error) {
	list, _, err := s.Entries.List(ctx)
	if err != nil {
		return game.Manifest{}, err
	}
	i := slices.IndexFunc(list, func(m game.Manifest) bool { return m.ID == id })
	if i < 0 {
		return game.Manifest{}, fail(CodeEntryUnknown, nil, "game", string(id))
	}
	return list[i], nil
}

// saveEntry stores the manifest and makes the registry serve it. If the
// registry refuses it, the stored entry is taken back.
func (s *Service) saveEntry(ctx context.Context, m game.Manifest) error {
	if err := s.Entries.Save(ctx, m); err != nil {
		return err
	}
	if _, err := s.LoadEntries(ctx); err != nil {
		_ = s.Entries.Delete(context.WithoutCancel(ctx), m.ID)
		_, _ = s.LoadEntries(context.WithoutCancel(ctx))
		return fail(CodeEntryInvalid, err, "detail", err.Error())
	}
	return nil
}

func (s *Service) removeEntry(ctx context.Context, id game.ID) error {
	if err := s.Entries.Delete(ctx, id); err != nil && !errors.Is(err, ports.ErrNotFound) {
		return err
	}
	s.mu.Lock()
	s.found = slices.DeleteFunc(s.found, func(c ports.Candidate) bool { return c.Game == id })
	s.mu.Unlock()
	_, err := s.LoadEntries(ctx)
	return err
}

// createEntry describes the game of the "add any game" assistant as a user
// entry: the targets the user declared and, when an executable was given,
// how to start the game and recognise it running.
func (s *Service) createEntry(ctx context.Context, name string, su Setup) (game.ID, error) {
	m := entryOf(name, su.Targets, su.Executable)
	m.ID = game.NewUserEntryID(name, func(id game.ID) bool {
		_, taken := s.Registry.Definition(id)
		return taken
	})
	if err := m.Validate(); err != nil {
		return "", fail(CodeTargetsInvalid, err, "detail", err.Error())
	}
	if err := s.saveEntry(ctx, m); err != nil {
		return "", err
	}
	return m.ID, nil
}

func entryOf(name string, targets []game.TargetSpec, executable string) game.Manifest {
	m := game.Manifest{Schema: game.ManifestSchema, Name: strings.TrimSpace(name), Version: "1"}
	for _, t := range targets {
		m.Layout.Targets = append(m.Layout.Targets, game.ManifestTarget{ID: t.ID, Path: strings.ReplaceAll(strings.TrimSpace(t.Path), `\`, "/")})
	}
	// One mod type per target, as the assistant always offered: the first
	// target takes the default type, the others a type named after them.
	for i, t := range targets {
		if i > 0 {
			m.Layout.ModTypes = append(m.Layout.ModTypes, game.ManifestModType{ID: game.ModTypeID(t.ID), Name: string(t.ID), Target: t.ID})
		}
	}
	if exe := strings.ReplaceAll(strings.TrimSpace(executable), `\`, "/"); exe != "" {
		m.Launch = []game.ManifestLaunch{{ID: "game", Exe: exe, Default: true}}
		m.Discovery.Processes = []string{baseName(exe)}
		m.Discovery.VersionFile = exe
	}
	return m
}

// MigrateLegacyCustom gives an entry of its own to every instance that
// still belongs to the template game of the entry host (instances created
// before D117). The instance keeps its id, folders, targets and profiles;
// only the game it belongs to changes. An instance that cannot be described
// (a target outside its root) is left as it is and keeps working.
func (s *Service) MigrateLegacyCustom(ctx context.Context) (int, error) {
	s.manageMu.Lock()
	defer s.manageMu.Unlock()
	instances, err := s.Instances.List(ctx)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, inst := range instances {
		a, ok := s.Registry.ByName(inst.Adapter)
		if !ok {
			continue
		}
		if _, host := a.(ports.EntryHost); !host || game.IsUserEntry(inst.Game) {
			continue
		}
		def, ok := s.Registry.Definition(inst.Game)
		if !ok || !def.CustomTargets {
			continue
		}
		var specs []game.TargetSpec
		for _, t := range inst.Targets {
			rel, err := game.RelativeTo(inst.Root, t.Path)
			if err != nil {
				specs = nil
				break
			}
			specs = append(specs, game.TargetSpec{ID: t.ID, Path: rel})
		}
		if len(specs) == 0 {
			continue
		}
		entry, err := s.createEntry(ctx, inst.DisplayName, Setup{Targets: specs, Executable: inst.Executable})
		if err != nil {
			continue
		}
		inst.Game, inst.AdapterVersion = entry, a.Version()
		if err := s.Instances.Save(ctx, inst); err != nil {
			_ = s.removeEntry(context.WithoutCancel(ctx), entry)
			return n, err
		}
		n++
	}
	return n, nil
}

// memoryEntries is the store of a service wired without one (tests).
type memoryEntries struct {
	mu   sync.Mutex
	list []game.Manifest
}

func (r *memoryEntries) List(context.Context) ([]game.Manifest, []game.ID, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := slices.Clone(r.list)
	slices.SortFunc(out, func(a, b game.Manifest) int { return strings.Compare(string(a.ID), string(b.ID)) })
	return out, nil, nil
}

func (r *memoryEntries) Save(_ context.Context, m game.Manifest) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.list = append(slices.DeleteFunc(r.list, func(o game.Manifest) bool { return o.ID == m.ID }), m)
	return nil
}

func (r *memoryEntries) Delete(_ context.Context, id game.ID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := len(r.list)
	r.list = slices.DeleteFunc(r.list, func(o game.Manifest) bool { return o.ID == id })
	if len(r.list) == n {
		return ports.ErrNotFound
	}
	return nil
}

// maxEntryFile bounds a manifest read from disk: a game description is a
// few kilobytes; anything far larger is not one.
const maxEntryFile = 1 << 20

// ExportEntryToFile writes the manifest of a user entry to path (R5c), the
// file ImportEntryFromFile reads on this or another PC.
func (s *Service) ExportEntryToFile(ctx context.Context, id game.ID, path string) error {
	data, err := s.ExportEntry(ctx, id)
	if err != nil {
		return err
	}
	return s.FS.WriteFile(ctx, path, data)
}

// ImportEntryFromFile reads a manifest from path and adds the game (R5c).
func (s *Service) ImportEntryFromFile(ctx context.Context, path string) (game.ID, error) {
	f, err := s.FS.Open(ctx, path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maxEntryFile+1))
	if err != nil {
		return "", err
	}
	if len(data) > maxEntryFile {
		return "", fail(CodeEntryInvalid, nil, "detail", "file too large")
	}
	return s.ImportEntry(ctx, data)
}
