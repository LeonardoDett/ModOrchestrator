package gameconfig

import (
	"context"
	"strconv"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/gamesettings"
	"modorchestrator/internal/core/domain/profile"
)

// Diagnostic actions of the module (core/10).
const (
	ActionFixRequired = "game_settings.fix_required"
	ActionApplyTweaks = "game_settings.apply_tweaks"
)

// Commands lists the diagnostic actions the module runs.
func (s *Service) Commands() []string { return []string{ActionFixRequired, ActionApplyTweaks} }

// Places lists the navigation targets of its actions.
func (s *Service) Places() []string { return nil }

// Execute runs one of its diagnostic actions.
func (s *Service) Execute(ctx context.Context, instance game.InstanceID, a diagnostic.Action) error {
	switch a.ID {
	case ActionFixRequired:
		return s.FixRequired(ctx, instance)
	case ActionApplyTweaks:
		return s.ReapplyTweaks(ctx, instance)
	}
	return fail("diagnostic_action_invalid", nil, "action", a.ID)
}

type missing struct {
	req   gamesettings.Required
	file  gamesettings.File
	found gamesettings.Value
}

// missingRequired lists the required keys the files in the game lack.
func (s *Service) missingRequired(ctx context.Context, sp *support) ([]missing, error) {
	var out []missing
	for _, r := range sp.required {
		f, _ := sp.file(r.File)
		o, err := s.read(ctx, f)
		if err != nil {
			return nil, err
		}
		if o.unreadable {
			continue // a locked file is not judged
		}
		found := lookup(o.data, r.Section, r.Key)
		if !r.Satisfied(found) {
			out = append(out, missing{req: r, file: f, found: found})
		}
	}
	return out, nil
}

// FixRequired writes the required keys the game lacks into the files in the
// game (M11). Only their lines change; the file found is kept in the
// BackupStore first. The fix is the user's decision and stays: with
// "configurações próprias", it goes into the copy of the profile in the
// game when the files are swapped.
func (s *Service) FixRequired(ctx context.Context, instance game.InstanceID) error {
	sp, err := s.support(ctx, instance)
	if err != nil {
		return err
	}
	release, err := s.Locks.Acquire(instance, holder)
	if err != nil {
		return err
	}
	defer release()
	miss, err := s.missingRequired(ctx, sp)
	if err != nil || len(miss) == 0 {
		return err
	}
	byFile := map[string][]missing{}
	var order []string
	for _, m := range miss {
		if _, ok := byFile[m.file.Path]; !ok {
			order = append(order, m.file.Path)
		}
		byFile[m.file.Path] = append(byFile[m.file.Path], m)
	}
	for _, p := range order {
		f, _ := sp.file(p)
		o, err := s.read(ctx, f)
		if err != nil {
			return err
		}
		if o.unreadable {
			return fail(CodeFileLocked, nil, "path", o.path)
		}
		if o.exists {
			if _, err := s.backup(ctx, sp, o, "before-fix"); err != nil {
				return err
			}
		}
		data := o.data
		for _, m := range byFile[p] {
			data = setValue(data, m.req.Section, m.req.Key, gamesettings.Text(m.req.Value))
		}
		if err := s.write(ctx, o, true, data); err != nil {
			return err
		}
		err = s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
			tx.Emit(s.newEvent(EventRequiredFixed, subjectInstance, string(instance), map[string]string{
				"instance": string(instance), "file": f.Name(), "keys": strconv.Itoa(len(byFile[p])),
			}))
			return nil
		})
		if err != nil {
			return err
		}
	}
	return nil
}

// ReapplyTweaks writes the tweaks of the profile in the game over keys
// changed outside the app ("Aplicar os ajustes de novo",
// ini_tweak_external).
func (s *Service) ReapplyTweaks(ctx context.Context, instance game.InstanceID) error {
	sp, err := s.support(ctx, instance)
	if err != nil {
		return err
	}
	release, err := s.Locks.Acquire(instance, holder)
	if err != nil {
		return err
	}
	defer release()
	return s.applyTweaks(ctx, sp, s.deployed(ctx, instance), "", true)
}

// externalTweaks are the tweak keys changed outside the app since its last
// write.
func (s *Service) externalTweaks(ctx context.Context, sp *support) ([]*gamesettings.KeyRecord, []gamesettings.Value, error) {
	recs, err := s.tweakRecords(ctx, sp.inst.ID)
	if err != nil {
		return nil, nil, err
	}
	var keys []*gamesettings.KeyRecord
	var found []gamesettings.Value
	for _, f := range sp.files {
		var mine []*gamesettings.KeyRecord
		for _, r := range recs {
			if gamesettings.Same(r.Path, f.Path) && r.Active() {
				mine = append(mine, r)
			}
		}
		if len(mine) == 0 {
			continue
		}
		o, err := s.read(ctx, f)
		if err != nil {
			return nil, nil, err
		}
		if o.unreadable {
			continue
		}
		for _, r := range mine {
			v := lookup(o.data, r.Section, r.Key)
			if !r.Ours(v) {
				keys, found = append(keys, r), append(found, v)
			}
		}
	}
	return keys, found, nil
}

// Diagnostics derives game_setting_required (a key the game needs is
// missing or has another value) and ini_tweak_external (a key of a tweak
// changed outside the app). A game without the feature has none.
func (s *Service) Diagnostics(ctx context.Context, instance game.InstanceID) ([]diagnostic.Diagnostic, error) {
	sp, err := s.support(ctx, instance)
	if unsupported(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []diagnostic.Diagnostic
	miss, err := s.missingRequired(ctx, sp)
	if err != nil {
		return nil, err
	}
	for _, m := range miss {
		d, err := diagnostic.New(diagnostic.Spec{
			Code: diagnostic.CodeGameSettingRequired, Severity: diagnostic.SeverityWarning,
			Params: diagnostic.Params{"file": m.file.Name(), "section": m.req.Section, "key": m.req.Key, "value": m.req.Value, "found": valueText(m.found)},
			Evidence: []diagnostic.Evidence{{Kind: "settings_key", Params: diagnostic.Params{
				"file": m.file.Name(), "key": m.req.Section + "/" + m.req.Key, "value": valueText(m.found),
			}}},
			Actions: []diagnostic.Action{{ID: ActionFixRequired}},
		})
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	keys, found, err := s.externalTweaks(ctx, sp)
	if err != nil {
		return nil, err
	}
	if len(keys) > 0 {
		ev := make([]diagnostic.Evidence, 0, len(keys))
		for i, k := range keys {
			ev = append(ev, diagnostic.Evidence{Kind: "settings_key", Params: diagnostic.Params{
				"file": gamesettings.File{Path: k.Path}.Name(), "key": k.Section + "/" + k.Key, "value": valueText(found[i]),
			}})
		}
		d, err := diagnostic.New(diagnostic.Spec{
			Code: diagnostic.CodeIniTweakExternal, Severity: diagnostic.SeverityWarning,
			Params:   diagnostic.Params{"count": strconv.Itoa(len(keys))},
			Evidence: ev,
			Actions:  []diagnostic.Action{{ID: ActionApplyTweaks}},
		})
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, nil
}

// Report is its part of the support bundle: whose files are in the game,
// how many tweak keys the app holds and the required keys missing.
func (s *Service) Report(ctx context.Context, instance game.InstanceID) (string, []string, bool) {
	sp, err := s.support(ctx, instance)
	if err != nil {
		return "", nil, false
	}
	var lines []string
	for _, f := range sp.files {
		rec, err := s.fileRecord(ctx, instance, f.Path)
		who := "shared"
		if err == nil && rec != nil && rec.Profile != "" {
			who = "profile:" + rec.Profile
		}
		lines = append(lines, f.Name()+"="+who)
	}
	recs, err := s.tweakRecords(ctx, instance)
	if err == nil {
		n := 0
		for _, r := range recs {
			if r.Active() {
				n++
			}
		}
		lines = append(lines, "tweakKeys="+strconv.Itoa(n))
	}
	if miss, err := s.missingRequired(ctx, sp); err == nil {
		lines = append(lines, "requiredMissing="+strconv.Itoa(len(miss)))
	}
	return "game_settings", lines, true
}

func valueText(v gamesettings.Value) string {
	if !v.Present {
		return "(absent)"
	}
	return v.Text
}

// CopyID names the clone option.
func (s *Service) CopyID() string { return "game_settings" }

// CopySize is what the settings copies of a profile with its own weigh.
func (s *Service) CopySize(ctx context.Context, p *profile.Profile) (int, int64, bool) {
	if !p.Features().LocalSettings || !s.Supported(ctx, p.Instance()) {
		return 0, 0, false
	}
	copies, err := s.current(ctx, p)
	if err != nil || len(copies) == 0 {
		return 0, 0, false
	}
	var size int64
	for _, c := range copies {
		size += int64(len(c.Content))
	}
	return len(copies), size, true
}

// current is the copies of a profile as they are now: the copy in the game,
// with what the game wrote since, for a profile whose files are there.
func (s *Service) current(ctx context.Context, p *profile.Profile) ([]gamesettings.Copy, error) {
	sp, err := s.support(ctx, p.Instance())
	if err != nil {
		return nil, err
	}
	var out []gamesettings.Copy
	for _, f := range sp.files {
		rec, err := s.fileRecord(ctx, sp.inst.ID, f.Path)
		if err != nil {
			return nil, err
		}
		if rec != nil && rec.Profile == string(p.ID()) && rec.PendingHash == "" {
			o, err := s.read(ctx, f)
			if err != nil {
				return nil, err
			}
			if !o.unreadable {
				keys, err := s.overlays(ctx, sp, f)
				if err != nil {
					return nil, err
				}
				out = append(out, gamesettings.Copy{Profile: string(p.ID()), Path: f.Path, Present: o.exists, Content: revert(o.data, keys)})
				continue
			}
		}
		c, ok, err := s.copyOf(ctx, string(p.ID()), f.Path)
		if err != nil {
			return nil, err
		}
		if ok {
			out = append(out, c)
		}
	}
	return out, nil
}

// CopyFiles copies the settings of from into to, a clone just created.
func (s *Service) CopyFiles(ctx context.Context, from, to *profile.Profile) error {
	if !from.Features().LocalSettings || !to.Features().LocalSettings {
		return nil
	}
	copies, err := s.current(ctx, from)
	if err != nil {
		return err
	}
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		for _, c := range copies {
			c.Profile, c.UpdatedAt = string(to.ID()), s.Clock.Now()
			if err := tx.GameSettings().SaveCopy(ctx, c); err != nil {
				return err
			}
		}
		return nil
	})
}
