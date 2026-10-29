package gameconfig

import (
	"bytes"
	"context"
	"errors"
	"io"
	"path"
	"slices"
	"strconv"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/gameini"
	"modorchestrator/internal/core/domain/gamesettings"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/profile"
)

// INI tweaks (M8 of the MO2/Vortex survey): small INI files a mod brings,
// each meant for one settings file of the game. The adapter says which files
// of a mod are tweaks (IniTweak); the user turns each one on per mod (off by
// default, as in MO2 and Vortex). In the post step of the deploy the keys
// of the tweaks that are on, of the mods enabled in the profile, are written
// over the file in effect (the profile's copy or the shared file); a later
// mod in the mod order wins a key two tweaks set. Each key is a key record
// (owner game_settings.tweak:…): the app changes only its line, records the
// pending value first, and gives the original back when no tweak sets it.
// A key changed outside the app is never overwritten without the user
// (ini_tweak_external).

// Tweak is an INI tweak a mod installs.
type Tweak struct {
	// Path identifies it: where the mod installs it, in its target.
	Path string
	// Name is the file name without the extension.
	Name string
	// File is the settings file it applies to (a Path of SettingsFiles).
	File    string
	Enabled bool
	// Keys is how many keys it sets (0 when its file cannot be read).
	Keys int
	file mod.File
}

// FileName is the name of the settings file the tweak applies to.
func (t Tweak) FileName() string { return gamesettings.File{Path: t.File}.Name() }

func (s *Service) modTweaks(ctx context.Context, sp *support, m *mod.Mod, on []string) ([]Tweak, error) {
	if m.State != mod.StateInstalled || m.Installation == "" || s.Installations == nil {
		return nil, nil
	}
	ins, err := s.Installations.Get(ctx, m.Installation)
	if errors.Is(err, ports.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []Tweak
	for _, f := range ins.Files {
		target, ok := sp.gs.IniTweak(sp.inst, f.Dest)
		if !ok {
			continue
		}
		sf, known := sp.file(target)
		if !known {
			continue
		}
		p := f.Dest.Path.String()
		name := path.Base(p)
		out = append(out, Tweak{
			Path: p, Name: strings.TrimSuffix(name, path.Ext(name)), File: sf.Path,
			Enabled: slices.Contains(on, p), file: f,
		})
	}
	slices.SortFunc(out, func(a, b Tweak) int { return strings.Compare(strings.ToLower(a.Path), strings.ToLower(b.Path)) })
	return out, nil
}

func (s *Service) readTweak(ctx context.Context, sp *support, m mod.ID, t Tweak) ([]gameini.Pair, error) {
	p := game.JoinPath(game.JoinPath(sp.inst.Staging, string(m)), t.file.Source.String())
	r, err := s.FS.Open(ctx, p)
	if err != nil {
		return nil, err
	}
	defer r.Close()
	data, err := io.ReadAll(io.LimitReader(r, 1<<20))
	if err != nil {
		return nil, err
	}
	return gameini.Pairs(data), nil
}

type tweakKey struct {
	file, section, key, value string
}

// desiredTweaks are the keys the tweaks that are on set, for the enabled
// mods of a profile, by owner. A later mod wins.
func (s *Service) desiredTweaks(ctx context.Context, sp *support, p *profile.Profile) (map[string]tweakKey, error) {
	out := map[string]tweakKey{}
	if p == nil {
		return out, nil
	}
	choices, err := s.GameSettings.Tweaks(ctx, sp.inst.ID)
	if err != nil {
		return nil, err
	}
	for _, id := range p.EnabledMods() {
		on := choices[id]
		if len(on) == 0 {
			continue
		}
		m, err := s.Mods.Get(ctx, id)
		if errors.Is(err, ports.ErrNotFound) {
			continue
		}
		if err != nil {
			return nil, err
		}
		tweaks, err := s.modTweaks(ctx, sp, m, on)
		if err != nil {
			return nil, err
		}
		for _, t := range tweaks {
			if !t.Enabled {
				continue
			}
			pairs, err := s.readTweak(ctx, sp, id, t)
			if err != nil {
				continue // a tweak that cannot be read sets nothing
			}
			for _, kv := range pairs {
				out[gamesettings.TweakOwner(t.File, kv.Section, kv.Key)] = tweakKey{file: t.File, section: kv.Section, key: kv.Key, value: kv.Value}
			}
		}
	}
	return out, nil
}

func (s *Service) tweakRecords(ctx context.Context, instance game.InstanceID) (map[string]*gamesettings.KeyRecord, error) {
	all, err := s.GameSettings.Keys(ctx, instance)
	if err != nil {
		return nil, err
	}
	out := map[string]*gamesettings.KeyRecord{}
	for _, k := range all {
		if gamesettings.IsTweak(k.Owner) {
			out[k.Owner] = k
		}
	}
	return out, nil
}

// applyTweaks writes the keys of the tweaks of p (none when p is nil) over
// the files in effect. force writes over keys changed outside the app (the
// user chose "Aplicar os ajustes de novo").
func (s *Service) applyTweaks(ctx context.Context, sp *support, p *profile.Profile, op operation.ID, force bool) error {
	desired, err := s.desiredTweaks(ctx, sp, p)
	if err != nil {
		return err
	}
	recs, err := s.tweakRecords(ctx, sp.inst.ID)
	if err != nil {
		return err
	}
	pid := ""
	if p != nil {
		pid = string(p.ID())
	}
	for _, f := range sp.files {
		if err := s.applyFileTweaks(ctx, sp, f, desired, recs, pid, op, force); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) applyFileTweaks(ctx context.Context, sp *support, f gamesettings.File, desired map[string]tweakKey, recs map[string]*gamesettings.KeyRecord, pid string, op operation.ID, force bool) error {
	want := map[string]tweakKey{}
	for owner, d := range desired {
		if gamesettings.Same(d.file, f.Path) {
			want[owner] = d
		}
	}
	held := map[string]*gamesettings.KeyRecord{}
	for owner, r := range recs {
		if gamesettings.Same(r.Path, f.Path) {
			held[owner] = r
		}
	}
	if len(want) == 0 && len(held) == 0 {
		return nil
	}
	o, err := s.read(ctx, f)
	if err != nil {
		return err
	}
	if o.unreadable {
		return fail(CodeFileLocked, nil, "path", o.path)
	}
	var save []*gamesettings.KeyRecord
	drop := map[string]bool{}
	for owner, d := range want {
		found := lookup(o.data, d.section, d.key)
		target := gamesettings.Text(d.value)
		rec := &gamesettings.KeyRecord{
			Instance: sp.inst.ID, Owner: owner, Folder: f.Folder, Path: f.Path,
			Section: d.section, Key: d.key, Original: found, Written: found,
		}
		if old := held[owner]; old != nil {
			cp := *old
			rec = &cp
			if !rec.Ours(found) && !found.Equal(target) && !force {
				continue // changed outside the app: left for the triage
			}
			if rec.Written.Equal(target) && found.Equal(target) && rec.Pending == nil {
				continue
			}
		}
		t := target
		rec.Pending = &t
		save = append(save, rec)
	}
	for owner, old := range held {
		if _, ok := want[owner]; ok {
			continue
		}
		drop[owner] = true
		found := lookup(o.data, old.Section, old.Key)
		if !old.Ours(found) && !force {
			continue // the user's value stays; the app lets go of the key
		}
		cp := *old
		orig := cp.Original
		cp.Pending = &orig
		save = append(save, &cp)
	}
	if len(save) == 0 && len(drop) == 0 {
		return nil
	}
	slices.SortFunc(save, func(a, b *gamesettings.KeyRecord) int { return strings.Compare(a.Owner, b.Owner) })
	data, present := append([]byte(nil), o.data...), o.exists
	for _, r := range save {
		data = setValue(data, r.Section, r.Key, *r.Pending)
		present = present || r.Pending.Present
	}
	changed := present != o.exists || !bytes.Equal(data, o.data)
	if changed && len(held) == 0 && o.exists {
		if _, err := s.backup(ctx, sp, o, "tweaks"); err != nil {
			return err
		}
	}
	if changed {
		err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
			for _, r := range save {
				if err := tx.GameSettings().SaveKey(ctx, r); err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			return err
		}
		if err := s.write(ctx, o, present, data); err != nil {
			return err
		}
	}
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		for _, r := range save {
			r.Written, r.Pending, r.Profile, r.Operation, r.AppliedAt = *r.Pending, nil, pid, op, s.Clock.Now()
			if drop[r.Owner] {
				continue
			}
			if err := tx.GameSettings().SaveKey(ctx, r); err != nil {
				return err
			}
		}
		for owner := range drop {
			if err := tx.GameSettings().DeleteKey(ctx, sp.inst.ID, owner); err != nil {
				return err
			}
		}
		if changed {
			e := s.newEvent(EventApplied, subjectInstance, string(sp.inst.ID), map[string]string{
				"instance": string(sp.inst.ID), "file": f.Name(), "profile": pid, "tweaks": strconv.Itoa(len(want)),
			})
			e.OperationID = string(op)
			tx.Emit(e)
		}
		return nil
	})
}

// Tweaks lists the INI tweaks of a mod; ok is false when the game of the
// mod has no game_settings in effect.
func (s *Service) Tweaks(ctx context.Context, id mod.ID) ([]Tweak, bool, error) {
	m, err := s.Mods.Get(ctx, id)
	if errors.Is(err, ports.ErrNotFound) {
		return nil, false, fail(CodeModNotFound, err, "mod", string(id))
	}
	if err != nil {
		return nil, false, err
	}
	sp, err := s.support(ctx, m.Instance)
	if unsupported(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	choices, err := s.GameSettings.Tweaks(ctx, m.Instance)
	if err != nil {
		return nil, false, err
	}
	tweaks, err := s.modTweaks(ctx, sp, m, choices[id])
	if err != nil {
		return nil, false, err
	}
	for i := range tweaks {
		if pairs, err := s.readTweak(ctx, sp, id, tweaks[i]); err == nil {
			tweaks[i].Keys = len(pairs)
		}
	}
	return tweaks, true, nil
}

// SetTweak turns an INI tweak of a mod on or off. When the mod's profile is
// the one in the game folder, the keys change now; otherwise the next
// deploy writes them.
func (s *Service) SetTweak(ctx context.Context, id mod.ID, tweakPath string, on bool) error {
	m, err := s.Mods.Get(ctx, id)
	if errors.Is(err, ports.ErrNotFound) {
		return fail(CodeModNotFound, err, "mod", string(id))
	}
	if err != nil {
		return err
	}
	sp, err := s.support(ctx, m.Instance)
	if err != nil {
		return err
	}
	tweaks, err := s.modTweaks(ctx, sp, m, nil)
	if err != nil {
		return err
	}
	i := slices.IndexFunc(tweaks, func(t Tweak) bool { return t.Path == tweakPath })
	if i < 0 {
		return fail(CodeTweakNotFound, nil, "mod", string(id), "tweak", tweakPath)
	}
	err = s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		if err := tx.GameSettings().SetTweak(ctx, m.Instance, id, tweakPath, on); err != nil {
			return err
		}
		tx.Emit(s.newEvent(EventTweakChanged, subjectMod, string(id), map[string]string{
			"instance": string(m.Instance), "mod": string(id), "name": m.DisplayName(), "tweak": tweaks[i].Name, "on": strconv.FormatBool(on),
		}))
		return nil
	})
	if err != nil {
		return err
	}
	return s.applyNow(ctx, sp, "")
}
