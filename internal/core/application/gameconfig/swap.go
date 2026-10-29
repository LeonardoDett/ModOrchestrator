package gameconfig

import (
	"context"
	"errors"
	"strconv"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/gamesettings"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/profile"
)

// The settings files of a profile (core/07 §4 step 6 and §7). A profile
// with "configurações próprias" (features.localSettings) keeps a copy of
// each file the adapter declares; the post step of the deploy puts the
// copy of the profile just deployed in the game and keeps what was in the
// game back in the profile it belonged to, so edits the game made (its
// options menu writes the INIs) stay with that profile. A profile without
// it uses the shared files: the ones the game had before the app swapped.
//
// The keys other modules hold in these files (the save folder, the INI
// tweaks: key records, D142) are overlays: they are taken out of what goes
// back to a profile and put again on what comes in, so a swap never moves
// them and their owners see no change.

func (s *Service) fileRecord(ctx context.Context, instance game.InstanceID, p string) (*gamesettings.FileRecord, error) {
	rec, err := s.GameSettings.File(ctx, instance, p)
	if errors.Is(err, ports.ErrNotFound) {
		return nil, nil
	}
	return rec, err
}

// overlays are the key records, of every owner, of one file.
func (s *Service) overlays(ctx context.Context, sp *support, f gamesettings.File) ([]*gamesettings.KeyRecord, error) {
	all, err := s.GameSettings.Keys(ctx, sp.inst.ID)
	if err != nil {
		return nil, err
	}
	var out []*gamesettings.KeyRecord
	for _, k := range all {
		if k.Folder == f.Folder && gamesettings.Same(k.Path, f.Path) {
			out = append(out, k)
		}
	}
	return out, nil
}

// revert takes the overlays out of a file: a key the app holds goes back to
// what it would be without the app. A key changed outside the app stays as
// found.
func revert(data []byte, keys []*gamesettings.KeyRecord) []byte {
	for _, k := range keys {
		found := lookup(data, k.Section, k.Key)
		v := k.Written
		if k.Pending != nil && found.Equal(*k.Pending) {
			v = *k.Pending
		}
		if k.Active() && found.Equal(v) {
			data = setValue(data, k.Section, k.Key, k.Original)
		}
	}
	return data
}

// overlay puts the overlays on a file coming in and returns the records
// with the original of each key as it is in that file.
func overlay(present bool, data []byte, keys []*gamesettings.KeyRecord) (bool, []byte, []*gamesettings.KeyRecord) {
	out := make([]*gamesettings.KeyRecord, 0, len(keys))
	for _, k := range keys {
		nk := *k
		cur := lookup(data, k.Section, k.Key)
		if k.Active() {
			nk.Original = cur
			data = setValue(data, k.Section, k.Key, k.Written)
			present = present || k.Written.Present
		} else {
			nk.Original, nk.Written = cur, cur
		}
		nk.Pending = nil
		out = append(out, &nk)
	}
	return present, data, out
}

// copyOf is the copy of a file a profile keeps.
func (s *Service) copyOf(ctx context.Context, p string, path string) (gamesettings.Copy, bool, error) {
	copies, err := s.GameSettings.Copies(ctx, profile.ID(p))
	if err != nil {
		return gamesettings.Copy{}, false, err
	}
	for _, c := range copies {
		if gamesettings.Same(c.Path, path) {
			return c, true, nil
		}
	}
	return gamesettings.Copy{}, false, nil
}

// incoming is the content, without overlays, of the file a profile ("" for
// the shared file) puts in the game. A profile without a copy yet starts
// from the shared file; the copy to create is returned.
func (s *Service) incoming(ctx context.Context, want string, f gamesettings.File, sharedPresent bool, shared []byte) (bool, []byte, *gamesettings.Copy, error) {
	if want == "" {
		return sharedPresent, shared, nil, nil
	}
	c, ok, err := s.copyOf(ctx, want, f.Path)
	if err != nil {
		return false, nil, nil, err
	}
	if ok {
		return c.Present, c.Content, nil, nil
	}
	nc := gamesettings.Copy{Profile: want, Path: f.Path, Present: sharedPresent, Content: append([]byte(nil), shared...), UpdatedAt: s.Clock.Now()}
	return nc.Present, nc.Content, &nc, nil
}

// swap puts the file of want ("" for the shared one) in the game.
func (s *Service) swap(ctx context.Context, sp *support, f gamesettings.File, want string, op operation.ID) error {
	rec, err := s.fileRecord(ctx, sp.inst.ID, f.Path)
	if err != nil {
		return err
	}
	o, err := s.read(ctx, f)
	if err != nil {
		return err
	}
	if o.unreadable {
		return fail(CodeFileLocked, nil, "path", o.path)
	}
	keys, err := s.overlays(ctx, sp, f)
	if err != nil {
		return err
	}
	if rec != nil && rec.PendingHash != "" {
		if hashOf(o.exists, o.data) == rec.PendingHash {
			// The last swap wrote the file and stopped before its record.
			_, in, _, err := s.incoming(ctx, rec.PendingProfile, f, rec.SharedPresent, rec.Shared)
			if err != nil {
				return err
			}
			_, _, updated := overlay(false, in, keys)
			done := *rec
			s.finish(&done, rec.PendingProfile, op)
			if err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error { return saveAll(ctx, tx, &done, updated) }); err != nil {
				return err
			}
			if done.Profile == want {
				return nil
			}
			return s.swap(ctx, sp, f, want, op)
		}
		cp := *rec
		cp.PendingHash, cp.PendingProfile = "", ""
		rec = &cp
	}
	have := ""
	if rec != nil {
		have = rec.Profile
	}
	if have == want {
		return nil
	}

	now := s.Clock.Now()
	base := revert(o.data, keys)
	var copies []gamesettings.Copy
	sharedPresent, shared := o.exists, base
	if have != "" {
		sharedPresent, shared = rec.SharedPresent, rec.Shared
		if _, err := s.Profiles.Get(ctx, profile.ID(have)); err == nil {
			copies = append(copies, gamesettings.Copy{Profile: have, Path: f.Path, Present: o.exists, Content: base, UpdatedAt: now})
		} else if !errors.Is(err, ports.ErrNotFound) {
			return err
		}
	}
	inPresent, in, created, err := s.incoming(ctx, want, f, sharedPresent, shared)
	if err != nil {
		return err
	}
	if created != nil {
		copies = append(copies, *created)
	}
	present, data, updated := overlay(inPresent, append([]byte(nil), in...), keys)

	next := &gamesettings.FileRecord{Instance: sp.inst.ID, Folder: f.Folder, Path: f.Path}
	if rec != nil {
		cp := *rec
		next = &cp
	}
	if rec == nil && o.exists {
		rel, err := s.backup(ctx, sp, o, "original")
		if err != nil {
			return err
		}
		next.OriginalBackup = rel
	}
	// While a profile's copy is in the game, the shared file waits here.
	next.Shared, next.SharedPresent = shared, sharedPresent
	next.PendingHash, next.PendingProfile = hashOf(present, data), want
	err = s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		for _, c := range copies {
			if err := tx.GameSettings().SaveCopy(ctx, c); err != nil {
				return err
			}
		}
		return tx.GameSettings().SaveFile(ctx, next)
	})
	if err != nil {
		return err
	}
	if err := s.write(ctx, o, present, data); err != nil {
		return err
	}
	s.finish(next, want, op)
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		if err := saveAll(ctx, tx, next, updated); err != nil {
			return err
		}
		e := s.newEvent(EventApplied, subjectInstance, string(sp.inst.ID), map[string]string{
			"instance": string(sp.inst.ID), "file": f.Name(), "profile": want, "local": strconv.FormatBool(want != ""),
		})
		e.OperationID = string(op)
		tx.Emit(e)
		return nil
	})
}

// finish marks the record as written for want.
func (s *Service) finish(rec *gamesettings.FileRecord, want string, op operation.ID) {
	rec.Profile, rec.WrittenHash = want, rec.PendingHash
	rec.PendingHash, rec.PendingProfile = "", ""
	rec.Operation, rec.AppliedAt = op, s.Clock.Now()
	if want == "" {
		rec.Shared, rec.SharedPresent = nil, false
	}
}

func saveAll(ctx context.Context, tx ports.Tx, rec *gamesettings.FileRecord, keys []*gamesettings.KeyRecord) error {
	if err := tx.GameSettings().SaveFile(ctx, rec); err != nil {
		return err
	}
	for _, k := range keys {
		if err := tx.GameSettings().SaveKey(ctx, k); err != nil {
			return err
		}
	}
	return nil
}

// wantFor is whose files go in the game: the profile when it keeps its own
// settings, else the shared files. restore asks for the shared files
// whatever the profile (purge).
func wantFor(p *profile.Profile, restore bool) string {
	if !restore && p != nil && p.Features().LocalSettings {
		return string(p.ID())
	}
	return ""
}

// apply puts the files of a profile in the game and then its INI tweaks.
func (s *Service) apply(ctx context.Context, sp *support, p *profile.Profile, op operation.ID, restore, force bool) error {
	want := wantFor(p, restore)
	for _, f := range sp.files {
		if err := s.swap(ctx, sp, f, want, op); err != nil {
			return err
		}
	}
	if restore {
		p = nil
	}
	return s.applyTweaks(ctx, sp, p, op, force)
}

// AfterDeploy is the `post` step of a deploy (core/07 §4 step 6): the
// settings files and the INI tweaks of the profile just deployed, in the
// same step as its load order and its save folder. It runs under the
// deploy's lock, before the saves module, whose key it carries over. A
// tweak key changed outside the app is left for the triage.
func (s *Service) AfterDeploy(ctx context.Context, instance game.InstanceID, op operation.ID) error {
	sp, err := s.support(ctx, instance)
	if unsupported(err) {
		return nil
	}
	if err != nil {
		return err
	}
	p, err := s.activeProfile(ctx, instance)
	if err != nil {
		return err
	}
	return opError(s.apply(ctx, sp, p, op, false, false))
}

// AfterPurge gives the shared files back and takes the tweaks out: a game
// without anything deployed has the settings it always had.
func (s *Service) AfterPurge(ctx context.Context, instance game.InstanceID, op operation.ID) error {
	sp, err := s.support(ctx, instance)
	if unsupported(err) {
		return nil
	}
	if err != nil {
		return err
	}
	return opError(s.apply(ctx, sp, nil, op, true, false))
}

// SetLocalSettings turns "configurações próprias" on or off for a profile.
// Turning it on copies the shared files into the profile the first time it
// is applied; turning it off keeps the profile's copy for later. When the
// profile is the one in the game folder, the files change now; otherwise
// the next deploy changes them.
func (s *Service) SetLocalSettings(ctx context.Context, id profile.ID, on bool) error {
	p, err := s.Profiles.Get(ctx, id)
	if errors.Is(err, ports.ErrNotFound) {
		return fail(CodeProfileNotFound, err, "profile", string(id))
	}
	if err != nil {
		return err
	}
	sp, err := s.support(ctx, p.Instance())
	if err != nil {
		return err
	}
	if p.Features().LocalSettings != on {
		err = s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
			p, err := tx.Profiles().Get(ctx, id)
			if err != nil {
				return err
			}
			f := p.Features()
			f.LocalSettings = on
			p.SetFeatures(f, s.Clock.Now())
			tx.Emit(s.newEvent(EventLocalSettingsChanged, subjectProfile, string(id), map[string]string{
				"instance": string(p.Instance()), "name": p.Name(), "on": strconv.FormatBool(on),
			}))
			return tx.Profiles().Save(ctx, p)
		})
		if err != nil {
			return err
		}
	}
	return s.applyNow(ctx, sp, id)
}

// applyNow applies the settings of the profile in the game folder when it
// is id (any profile when id is ""), unless an operation holds the
// instance: that one ends in a deploy, or the next deploy applies them.
func (s *Service) applyNow(ctx context.Context, sp *support, id profile.ID) error {
	d := s.deployed(ctx, sp.inst.ID)
	if d == nil || (id != "" && d.ID() != id) {
		return nil
	}
	active, err := s.Profiles.Active(ctx, sp.inst.ID)
	if err != nil || active != d.ID() {
		return nil
	}
	release, err := s.Locks.Acquire(sp.inst.ID, holder)
	if err != nil {
		return nil
	}
	defer release()
	if d, err = s.Profiles.Get(ctx, d.ID()); err != nil {
		return err
	}
	return s.apply(ctx, sp, d, "", false, false)
}

// Info is what the profile screen shows of the feature: the settings files
// and the profiles that keep their own.
type Info struct {
	Files []string
	Local []profile.ID
}

// Info describes the feature for an instance; ok is false when the game
// has no game_settings in effect.
func (s *Service) Info(ctx context.Context, instance game.InstanceID) (Info, bool, error) {
	sp, err := s.support(ctx, instance)
	if unsupported(err) {
		return Info{}, false, nil
	}
	if err != nil {
		return Info{}, false, err
	}
	var out Info
	for _, f := range sp.files {
		out.Files = append(out.Files, f.Name())
	}
	list, err := s.Profiles.ListByInstance(ctx, instance)
	if err != nil {
		return Info{}, false, err
	}
	for _, p := range list {
		if p.Features().LocalSettings {
			out.Local = append(out.Local, p.ID())
		}
	}
	return out, true, nil
}
