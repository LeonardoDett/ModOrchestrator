package saves

import (
	"context"
	"errors"
	"io"
	"path"
	"strconv"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/gameini"
	"modorchestrator/internal/core/domain/gamesettings"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/profile"
)

// observedKey is the settings file of the redirect as found now.
type observedKey struct {
	path       string
	exists     bool
	unreadable bool
	data       []byte
	value      gamesettings.Value
}

func (s *Service) settingsPath(sp *support) (string, error) {
	base, err := s.Folders.Folder(sp.redirect.Folder)
	if err != nil {
		return "", err
	}
	return game.JoinPath(base, sp.redirect.Settings), nil
}

func (s *Service) observe(ctx context.Context, sp *support) (observedKey, error) {
	p, err := s.settingsPath(sp)
	if err != nil {
		return observedKey{}, err
	}
	o := observedKey{path: p}
	info, err := s.FS.Stat(ctx, p)
	if err != nil {
		o.unreadable = true
		return o, nil
	}
	if !info.Exists {
		return o, nil
	}
	o.exists = true
	f, err := s.FS.Open(ctx, p)
	if err != nil {
		o.unreadable = true
		return o, nil
	}
	defer f.Close()
	if o.data, err = io.ReadAll(io.LimitReader(f, 4<<20)); err != nil {
		o.unreadable = true
		return o, nil
	}
	if v, ok := gameini.Lookup(o.data, sp.redirect.Section, sp.redirect.Key); ok {
		o.value = gamesettings.Text(v)
	}
	return o, nil
}

func (s *Service) record(ctx context.Context, instance game.InstanceID) (*gamesettings.KeyRecord, error) {
	rec, err := s.GameSettings.Key(ctx, instance, Owner)
	if errors.Is(err, ports.ErrNotFound) {
		return nil, nil
	}
	return rec, err
}

// pathState compares the key the profile needs, the record of the last
// write and the key found.
type pathState struct {
	obs      observedKey
	rec      *gamesettings.KeyRecord
	original gamesettings.Value
	desired  gamesettings.Value
	// external: the key changed outside the app since its last write, to a
	// value the profile does not need either.
	external bool
}

// desiredFor is the key value a profile needs: its own folder when it keeps
// its own saves, else what the key was before the app wrote it (the shared
// folder). restore asks for the original whatever the profile (purge).
func (sp *support) desiredFor(p *profile.Profile, original gamesettings.Value, restore bool) gamesettings.Value {
	if !restore && p != nil && p.Features().LocalSaves {
		return gamesettings.Text(sp.redirect.Value(string(p.ID())))
	}
	return original
}

func (s *Service) pathState(ctx context.Context, sp *support, p *profile.Profile, restore bool) (pathState, error) {
	var ps pathState
	obs, err := s.observe(ctx, sp)
	if err != nil {
		return ps, err
	}
	ps.obs = obs
	if ps.rec, err = s.record(ctx, sp.inst.ID); err != nil {
		return ps, err
	}
	ps.original = obs.value
	if ps.rec != nil {
		ps.original = ps.rec.Original
	}
	ps.desired = sp.desiredFor(p, ps.original, restore)
	ps.external = ps.rec != nil && !obs.unreadable && !ps.rec.Ours(obs.value) && !obs.value.Equal(ps.desired)
	return ps, nil
}

var errExternal = fail(CodeExternalChange, nil)

// apply points the game at the save folder of the profile (or back at the
// original folder with restore). It writes only the key, keeps every other
// byte of the file, records the value about to be written before writing
// it, keeps the file found before the first write in the BackupStore, and
// never writes over a key changed outside the app unless force (the user
// chose "Usar a pasta do perfil", D008).
func (s *Service) apply(ctx context.Context, sp *support, p *profile.Profile, op operation.ID, force, restore bool) error {
	ps, err := s.pathState(ctx, sp, p, restore)
	if err != nil {
		return err
	}
	if ps.obs.unreadable {
		return fail(CodeFileLocked, nil, "path", ps.obs.path)
	}
	if ps.external && !force {
		return errExternal
	}
	pid := ""
	if p != nil && !restore && p.Features().LocalSaves {
		pid = string(p.ID())
	}
	if ps.obs.value.Equal(ps.desired) {
		if ps.rec == nil || (ps.rec.Written.Equal(ps.desired) && ps.rec.Profile == pid && ps.rec.Pending == nil) {
			return nil // the game already has it
		}
		rec := *ps.rec
		rec.Written, rec.Pending, rec.Profile = ps.desired, nil, pid
		return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error { return tx.GameSettings().SaveKey(ctx, &rec) })
	}
	if ps.rec == nil && restore {
		return nil // never written: nothing to give back
	}
	rec := &gamesettings.KeyRecord{
		Instance: sp.inst.ID, Owner: Owner, Folder: sp.redirect.Folder, Path: sp.redirect.Settings,
		Section: sp.redirect.Section, Key: sp.redirect.Key, Original: ps.obs.value, Written: ps.obs.value,
	}
	if ps.rec != nil {
		cp := *ps.rec
		rec = &cp
	}
	if ps.obs.exists && (ps.rec == nil || ps.external) {
		rel, err := s.backup(ctx, sp, ps)
		if err != nil {
			return err
		}
		if ps.rec == nil {
			rec.OriginalBackup = rel
		}
	}
	pending := ps.desired
	rec.Pending = &pending
	if err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error { return tx.GameSettings().SaveKey(ctx, rec) }); err != nil {
		return err
	}
	var data []byte
	if ps.desired.Present {
		data = gameini.Set(ps.obs.data, sp.redirect.Section, sp.redirect.Key, ps.desired.Text)
	} else {
		data = gameini.Remove(ps.obs.data, sp.redirect.Section, sp.redirect.Key)
	}
	if err := s.FS.MkdirAll(ctx, parentDir(ps.obs.path)); err != nil {
		return fileError(err, ps.obs.path)
	}
	if err := s.FS.WriteFile(ctx, ps.obs.path, data); err != nil {
		return fileError(err, ps.obs.path)
	}
	rec.Written, rec.Pending, rec.Profile, rec.Operation, rec.AppliedAt = ps.desired, nil, pid, op, s.Clock.Now()
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		if err := tx.GameSettings().SaveKey(ctx, rec); err != nil {
			return err
		}
		profileID := ""
		if p != nil {
			profileID = string(p.ID())
		}
		e := s.newEvent(EventPathApplied, subjectInstance, string(sp.inst.ID), map[string]string{
			"instance": string(sp.inst.ID), "profile": profileID, "local": strconv.FormatBool(pid != ""),
			"restored": strconv.FormatBool(restore), "forced": strconv.FormatBool(force),
		})
		e.OperationID = string(op)
		tx.Emit(e)
		return nil
	})
}

// backup keeps a copy of the settings file being changed in the BackupStore
// (never overwritten) and returns its path relative to the store.
func (s *Service) backup(ctx context.Context, sp *support, ps pathState) (string, error) {
	dir := game.JoinPath(sp.inst.BackupStore, "game_settings")
	if err := s.FS.MkdirAll(ctx, dir); err != nil {
		return "", fileError(err, dir)
	}
	name := path.Base(strings.ReplaceAll(ps.obs.path, `\`, "/"))
	if ps.rec != nil {
		ext := path.Ext(name)
		name = strings.TrimSuffix(name, ext) + "-external-" + s.Clock.Now().UTC().Format("20060102T150405") + ext
	}
	p := game.JoinPath(dir, name)
	for i := 1; ; i++ {
		info, err := s.FS.Stat(ctx, p)
		if err != nil || !info.Exists {
			break
		}
		p = game.JoinPath(dir, name+".backup"+strconv.Itoa(i))
	}
	if err := s.FS.WriteFile(ctx, p, ps.obs.data); err != nil {
		return "", fileError(err, p)
	}
	return "game_settings/" + path.Base(strings.ReplaceAll(p, `\`, "/")), nil
}

func (s *Service) activeProfile(ctx context.Context, instance game.InstanceID) (*profile.Profile, error) {
	pid, err := s.Profiles.Active(ctx, instance)
	if err != nil {
		return nil, err
	}
	return s.Profiles.Get(ctx, pid)
}

// AfterDeploy is the `post` step of a deploy (core/07 §4 step 6): the
// game is pointed at the save folder of the profile just deployed, in the
// same step as its load order, so the game never sees a mixed state. It
// runs under the deploy's lock. A key changed outside the app is left for
// the triage (save_path_external); the deploy is not failed by it.
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
	if err := s.apply(ctx, sp, p, op, false, false); err != nil && !errors.Is(err, errExternal) {
		return opError(err)
	}
	return nil
}

// AfterPurge gives the key back as it was before the app wrote it: a game
// without anything deployed saves where it always did.
func (s *Service) AfterPurge(ctx context.Context, instance game.InstanceID, op operation.ID) error {
	sp, err := s.support(ctx, instance)
	if unsupported(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if err := s.apply(ctx, sp, nil, op, false, true); err != nil && !errors.Is(err, errExternal) {
		return opError(err)
	}
	return nil
}

// deployedWith reports whether the game folder holds this profile now.
func (s *Service) deployedWith(ctx context.Context, instance game.InstanceID, id profile.ID) bool {
	if s.Manifests == nil {
		return false
	}
	h, err := s.Manifests.Header(ctx, instance)
	return err == nil && !h.Purged() && profile.ID(h.Profile) == id
}

// SetLocalSaves turns "saves próprios" on or off for a profile. Turning it
// on never moves the shared saves and turning it off never deletes the
// profile's (D142). When the profile is the one in the game folder, the
// key changes now; otherwise the next deploy changes it.
func (s *Service) SetLocalSaves(ctx context.Context, id profile.ID, on bool) error {
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
	if p.Features().LocalSaves != on {
		err = s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
			p, err := tx.Profiles().Get(ctx, id)
			if err != nil {
				return err
			}
			f := p.Features()
			f.LocalSaves = on
			p.SetFeatures(f, s.Clock.Now())
			tx.Emit(s.newEvent(EventLocalSavesChanged, subjectProfile, string(id), map[string]string{
				"instance": string(p.Instance()), "name": p.Name(), "on": strconv.FormatBool(on),
			}))
			return tx.Profiles().Save(ctx, p)
		})
		if err != nil {
			return err
		}
	}
	active, err := s.Profiles.Active(ctx, p.Instance())
	if err != nil || active != id || !s.deployedWith(ctx, p.Instance(), id) {
		return nil
	}
	release, err := s.Locks.Acquire(p.Instance(), holder)
	if err != nil {
		return nil // the operation holding the instance ends in a deploy or the next one applies it
	}
	defer release()
	if p, err = s.Profiles.Get(ctx, id); err != nil {
		return err
	}
	if err := s.apply(ctx, sp, p, "", false, false); err != nil && !errors.Is(err, errExternal) {
		return err
	}
	return nil
}

// ApplyPath writes the key the active profile needs over a value changed
// outside the app ("Usar a pasta do perfil", save_path_external).
func (s *Service) ApplyPath(ctx context.Context, instance game.InstanceID) error {
	sp, err := s.support(ctx, instance)
	if err != nil {
		return err
	}
	release, err := s.Locks.Acquire(instance, holder)
	if err != nil {
		return err
	}
	defer release()
	p, err := s.activeProfile(ctx, instance)
	if err != nil {
		return err
	}
	if !s.deployedWith(ctx, instance, p.ID()) {
		// Nothing deployed: the shared folder is the one in effect.
		return s.apply(ctx, sp, nil, "", true, true)
	}
	return s.apply(ctx, sp, p, "", true, false)
}

// Diagnostic action and code of the module (core/10).
const ActionApplyPath = "saves.apply_path"

// Commands lists the diagnostic actions the module runs.
func (s *Service) Commands() []string { return []string{ActionApplyPath} }

// Places lists the navigation targets of its actions.
func (s *Service) Places() []string { return nil }

// Execute runs one of its diagnostic actions.
func (s *Service) Execute(ctx context.Context, instance game.InstanceID, a diagnostic.Action) error {
	if a.ID == ActionApplyPath {
		return s.ApplyPath(ctx, instance)
	}
	return fail("diagnostic_action_invalid", nil, "action", a.ID)
}

// Diagnostics derives save_path_external: the key that points the game at
// the save folder changed outside the app since its last write. A game
// without the feature has none.
func (s *Service) Diagnostics(ctx context.Context, instance game.InstanceID) ([]diagnostic.Diagnostic, error) {
	sp, err := s.support(ctx, instance)
	if unsupported(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p, err := s.activeProfile(ctx, instance)
	if err != nil {
		return nil, err
	}
	restore := !s.deployedWith(ctx, instance, p.ID())
	ps, err := s.pathState(ctx, sp, p, restore)
	if err != nil || !ps.external {
		return nil, err
	}
	found := ""
	if ps.obs.value.Present {
		found = ps.obs.value.Text
	}
	d, err := diagnostic.New(diagnostic.Spec{
		Code: diagnostic.CodeSavePathExternal, Severity: diagnostic.SeverityWarning,
		Params:   diagnostic.Params{"profile": p.Name(), "value": found, "key": sp.redirect.Key},
		Evidence: []diagnostic.Evidence{{Kind: "settings_key", Params: diagnostic.Params{"file": sp.redirect.Settings, "key": sp.redirect.Key, "value": found}}},
		Actions:  []diagnostic.Action{{ID: ActionApplyPath}},
	})
	if err != nil {
		return nil, err
	}
	return []diagnostic.Diagnostic{d}, nil
}

// Report is its part of the support bundle: where the active profile saves.
func (s *Service) Report(ctx context.Context, instance game.InstanceID) (string, []string, bool) {
	sp, err := s.support(ctx, instance)
	if err != nil {
		return "", nil, false
	}
	p, err := s.activeProfile(ctx, instance)
	if err != nil {
		return "", nil, false
	}
	ps, err := s.pathState(ctx, sp, p, false)
	if err != nil {
		return "", nil, false
	}
	lines := []string{
		"localSaves=" + strconv.FormatBool(p.Features().LocalSaves),
		"desired=" + valueText(ps.desired),
		"found=" + valueText(ps.obs.value),
		"external=" + strconv.FormatBool(ps.external),
	}
	return "saves", lines, true
}

func valueText(v gamesettings.Value) string {
	if !v.Present {
		return "(absent)"
	}
	return v.Text
}

// parentDir is the folder of an absolute path (either separator).
func parentDir(p string) string {
	i := strings.LastIndexAny(p, `/\`)
	if i <= 0 {
		return p
	}
	return p[:i]
}
