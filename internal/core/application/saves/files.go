package saves

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/png"
	"path"
	"slices"
	"strconv"
	"strings"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/gamesettings"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/profile"
	"modorchestrator/internal/core/domain/savegame"
)

// folderOf is the absolute save folder of a profile: its own when it keeps
// its own saves (named after the profile id, so renaming never moves
// files, D142), else the shared one the key pointed at before the app.
func (s *Service) folderOf(ctx context.Context, sp *support, p *profile.Profile) (string, error) {
	base, err := s.Folders.Folder(sp.redirect.Folder)
	if err != nil {
		return "", err
	}
	if p != nil && p.Features().LocalSaves {
		return game.JoinPath(base, sp.redirect.FolderOf(sp.redirect.Value(string(p.ID())))), nil
	}
	original, err := s.originalValue(ctx, sp)
	if err != nil {
		return "", err
	}
	return game.JoinPath(base, sp.redirect.FolderOf(original.Text)), nil
}

// originalValue is the key before the app wrote it; with no write yet, the
// key found now.
func (s *Service) originalValue(ctx context.Context, sp *support) (gamesettings.Value, error) {
	rec, err := s.record(ctx, sp.inst.ID)
	if err != nil {
		return gamesettings.Value{}, err
	}
	if rec != nil {
		return rec.Original, nil
	}
	obs, err := s.observe(ctx, sp)
	if err != nil {
		return gamesettings.Value{}, err
	}
	return obs.value, nil
}

// Namespace is the save folder of a profile, for the destination list.
type Namespace struct {
	Profile profile.ID
	Name    string
	Local   bool
	Active  bool
}

// MissingPlugin is a plugin a save uses that the active profile does not
// load: Present when the game folder will have it (inactive), else absent;
// Mods are the installed mods that provide it.
type MissingPlugin struct {
	Name    string
	Present bool
	Mods    []ModRef
}

// ModRef names a mod.
type ModRef struct {
	ID      mod.ID
	Name    string
	Enabled bool
}

// Save is one save of the folder.
type Save struct {
	Name       string
	Size       int64
	ModTime    time.Time
	Companions []string
	// Header is nil when the save could not be read (ReadError).
	Header        *savegame.Header
	HasScreenshot bool
	ReadError     string
	Missing       []MissingPlugin
}

// Listing is the Saves screen of the active profile (board JogoSaves).
type Listing struct {
	Profile     profile.ID
	ProfileName string
	Local       bool
	Folder      string
	// PluginsChecked: the game has plugins, so Missing means something.
	PluginsChecked bool
	Saves          []Save
	Profiles       []Namespace
}

// List reads the saves of the active profile, newest first.
func (s *Service) List(ctx context.Context, instance game.InstanceID) (Listing, error) {
	sp, err := s.support(ctx, instance)
	if err != nil {
		return Listing{}, err
	}
	p, err := s.activeProfile(ctx, instance)
	if err != nil {
		return Listing{}, err
	}
	dir, err := s.folderOf(ctx, sp, p)
	if err != nil {
		return Listing{}, err
	}
	out := Listing{Profile: p.ID(), ProfileName: p.Name(), Local: p.Features().LocalSaves, Folder: dir, Saves: []Save{}}
	all, err := s.Profiles.ListByInstance(ctx, instance)
	if err != nil {
		return Listing{}, err
	}
	for _, q := range all {
		out.Profiles = append(out.Profiles, Namespace{Profile: q.ID(), Name: q.Name(), Local: q.Features().LocalSaves, Active: q.ID() == p.ID()})
	}
	files, err := s.saveFiles(ctx, sp, dir)
	if err != nil {
		return Listing{}, err
	}
	var used []string
	for _, f := range files {
		sv := Save{Name: f.name, Size: f.size, ModTime: f.mod, Companions: f.companions}
		h, err := s.header(ctx, sp, game.JoinPath(dir, f.name), f.name, f.own, f.mod)
		if err != nil {
			sv.ReadError = err.Error()
		} else {
			sv.HasScreenshot = h.Screenshot != nil
			h.Screenshot = nil
			sv.Header = &h
			used = append(used, h.Plugins...)
		}
		out.Saves = append(out.Saves, sv)
	}
	if s.Plugins != nil && len(used) > 0 {
		pres, err := s.Plugins.Presence(ctx, instance, uniq(used))
		if err != nil {
			return Listing{}, err
		}
		if pres != nil {
			out.PluginsChecked = true
			names, err := s.modNames(ctx, instance)
			if err != nil {
				return Listing{}, err
			}
			for i := range out.Saves {
				out.Saves[i].Missing = missing(out.Saves[i].Header, pres, names, p)
			}
		}
	}
	return out, nil
}

func uniq(names []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, n := range names {
		k := strings.ToLower(n)
		if !seen[k] {
			seen[k] = true
			out = append(out, n)
		}
	}
	return out
}

func (s *Service) modNames(ctx context.Context, instance game.InstanceID) (map[mod.ID]string, error) {
	list, err := s.Mods.ListByInstance(ctx, instance)
	if err != nil {
		return nil, err
	}
	out := map[mod.ID]string{}
	for _, m := range list {
		out[m.ID] = m.DisplayName()
	}
	return out, nil
}

func missing(h *savegame.Header, pres map[string]PluginPresence, names map[mod.ID]string, p *profile.Profile) []MissingPlugin {
	if h == nil {
		return nil
	}
	var out []MissingPlugin
	for _, n := range h.Plugins {
		st, ok := pres[strings.ToLower(n)]
		if ok && st.Active {
			continue
		}
		mp := MissingPlugin{Name: n, Present: st.Present}
		for _, id := range st.Mods {
			mp.Mods = append(mp.Mods, ModRef{ID: id, Name: names[id], Enabled: p.IsEnabled(id)})
		}
		out = append(out, mp)
	}
	return out
}

type saveFile struct {
	name string
	// own is the size of the save file; size adds its companions.
	own        int64
	size       int64
	mod        time.Time
	companions []string
}

// saveFiles lists the saves at the top of dir with the companions found,
// newest first. A folder that does not exist yet has none.
func (s *Service) saveFiles(ctx context.Context, sp *support, dir string) ([]saveFile, error) {
	info, err := s.FS.Stat(ctx, dir)
	if err != nil {
		return nil, fileError(err, dir)
	}
	if !info.Exists {
		return nil, nil
	}
	entries, err := s.FS.ReadDir(ctx, dir)
	if err != nil {
		return nil, fileError(err, dir)
	}
	present := map[string]string{}
	for _, e := range entries {
		if !e.IsDir {
			present[strings.ToLower(e.Name)] = e.Name
		}
	}
	var out []saveFile
	for _, e := range entries {
		if e.IsDir || !sp.sg.IsSave(sp.inst.Game, e.Name) {
			continue
		}
		fi, err := s.FS.Stat(ctx, game.JoinPath(dir, e.Name))
		if err != nil || !fi.Exists {
			continue
		}
		f := saveFile{name: e.Name, own: fi.Size, size: fi.Size, mod: fi.ModTime}
		for _, c := range sp.sg.SaveCompanions(sp.inst.Game, e.Name) {
			if real, ok := present[strings.ToLower(c)]; ok {
				f.companions = append(f.companions, real)
				if ci, err := s.FS.Stat(ctx, game.JoinPath(dir, real)); err == nil {
					f.size += ci.Size
				}
			}
		}
		out = append(out, f)
	}
	slices.SortStableFunc(out, func(a, b saveFile) int {
		if c := b.mod.Compare(a.mod); c != 0 {
			return c
		}
		return strings.Compare(a.name, b.name)
	})
	return out, nil
}

// header reads a save header through the cache.
func (s *Service) header(ctx context.Context, sp *support, p, name string, size int64, mod time.Time) (savegame.Header, error) {
	s.mu.Lock()
	c, ok := s.headers[p]
	s.mu.Unlock()
	if ok && c.size == size && c.mod == mod.UnixNano() {
		return c.header, c.err
	}
	f, err := s.FS.Open(ctx, p)
	if err != nil {
		return savegame.Header{}, err
	}
	h, err := sp.sg.ReadSave(sp.inst.Game, name, f)
	f.Close()
	if h.SavedAt.IsZero() {
		h.SavedAt = mod
	}
	s.mu.Lock()
	s.headers[p] = cachedHeader{size: size, mod: mod.UnixNano(), header: h, err: err}
	s.mu.Unlock()
	return h, err
}

// validName refuses a name that is not a plain file name (INV-ID-02).
func validName(name string) bool {
	return name != "" && name != "." && name != ".." && !strings.ContainsAny(name, `/\:`) && strings.TrimSpace(name) == name
}

func (s *Service) find(ctx context.Context, sp *support, dir string, names []string) ([]saveFile, error) {
	if len(names) == 0 {
		return nil, fail(CodeNothingSelected, nil)
	}
	files, err := s.saveFiles(ctx, sp, dir)
	if err != nil {
		return nil, err
	}
	var out []saveFile
	for _, n := range names {
		i := slices.IndexFunc(files, func(f saveFile) bool { return strings.EqualFold(f.name, n) })
		if !validName(n) || i < 0 {
			return nil, fail(CodeNotFound, nil, "name", n)
		}
		out = append(out, files[i])
	}
	return out, nil
}

// Screenshot is the picture of a save of the active profile, as PNG.
func (s *Service) Screenshot(ctx context.Context, instance game.InstanceID, name string) ([]byte, error) {
	sp, err := s.support(ctx, instance)
	if err != nil {
		return nil, err
	}
	p, err := s.activeProfile(ctx, instance)
	if err != nil {
		return nil, err
	}
	dir, err := s.folderOf(ctx, sp, p)
	if err != nil {
		return nil, err
	}
	files, err := s.find(ctx, sp, dir, []string{name})
	if err != nil {
		return nil, err
	}
	f := files[0]
	h, err := s.header(ctx, sp, game.JoinPath(dir, f.name), f.name, f.own, f.mod)
	if err != nil {
		return nil, fail(CodeIOError, err, "path", f.name)
	}
	if h.Screenshot == nil || h.Screenshot.Width <= 0 || h.Screenshot.Height <= 0 || len(h.Screenshot.RGBA) < h.Screenshot.Width*h.Screenshot.Height*4 {
		return nil, fail(CodeNotFound, nil, "name", name)
	}
	img := &image.RGBA{Pix: h.Screenshot.RGBA, Stride: h.Screenshot.Width * 4, Rect: image.Rect(0, 0, h.Screenshot.Width, h.Screenshot.Height)}
	var b bytes.Buffer
	if err := png.Encode(&b, img); err != nil {
		return nil, err
	}
	return b.Bytes(), nil
}

// TransferPlan says, for each save, the name it gets in the destination: a
// name already used there is never replaced, the save gets " (2)", " (3)"…
type TransferPlan struct {
	From, To string
	Renamed  map[string]string
}

func (s *Service) plan(ctx context.Context, sp *support, from, to *profile.Profile, names []string) (TransferPlan, []saveFile, error) {
	src, err := s.folderOf(ctx, sp, from)
	if err != nil {
		return TransferPlan{}, nil, err
	}
	dst, err := s.folderOf(ctx, sp, to)
	if err != nil {
		return TransferPlan{}, nil, err
	}
	if game.SamePath(src, dst) {
		return TransferPlan{}, nil, fail(CodeSameFolder, nil, "profile", to.Name())
	}
	files, err := s.find(ctx, sp, src, names)
	if err != nil {
		return TransferPlan{}, nil, err
	}
	taken := map[string]bool{}
	if info, err := s.FS.Stat(ctx, dst); err == nil && info.Exists {
		entries, err := s.FS.ReadDir(ctx, dst)
		if err != nil {
			return TransferPlan{}, nil, fileError(err, dst)
		}
		for _, e := range entries {
			taken[strings.ToLower(e.Name)] = true
		}
	}
	plan := TransferPlan{From: src, To: dst, Renamed: map[string]string{}}
	for _, f := range files {
		target := f.name
		ext := path.Ext(f.name)
		stem := strings.TrimSuffix(f.name, ext)
		for i := 2; s.clashes(sp, taken, target); i++ {
			target = stem + " (" + strconv.Itoa(i) + ")" + ext
		}
		taken[strings.ToLower(target)] = true
		for _, c := range sp.sg.SaveCompanions(sp.inst.Game, target) {
			taken[strings.ToLower(c)] = true
		}
		if target != f.name {
			plan.Renamed[f.name] = target
		}
	}
	return plan, files, nil
}

func (s *Service) clashes(sp *support, taken map[string]bool, name string) bool {
	if taken[strings.ToLower(name)] {
		return true
	}
	for _, c := range sp.sg.SaveCompanions(sp.inst.Game, name) {
		if taken[strings.ToLower(c)] {
			return true
		}
	}
	return false
}

func (s *Service) profilesFor(ctx context.Context, instance game.InstanceID, to profile.ID) (*profile.Profile, *profile.Profile, error) {
	from, err := s.activeProfile(ctx, instance)
	if err != nil {
		return nil, nil, err
	}
	dst, err := s.Profiles.Get(ctx, to)
	if errors.Is(err, ports.ErrNotFound) || (err == nil && dst.Instance() != instance) {
		return nil, nil, fail(CodeProfileNotFound, err, "profile", string(to))
	}
	return from, dst, err
}

// PreviewTransfer is the plan of a copy or move from the active profile to
// another (DLG copiar ou mover): the names that change.
func (s *Service) PreviewTransfer(ctx context.Context, instance game.InstanceID, names []string, to profile.ID) (TransferPlan, error) {
	sp, err := s.support(ctx, instance)
	if err != nil {
		return TransferPlan{}, err
	}
	from, dst, err := s.profilesFor(ctx, instance, to)
	if err != nil {
		return TransferPlan{}, err
	}
	plan, _, err := s.plan(ctx, sp, from, dst, names)
	return plan, err
}

// Transfer copies or moves saves of the active profile, with their
// companions, to the save folder of another profile (the shared folder for
// a profile without saves of its own). Nothing is replaced (D142).
func (s *Service) Transfer(ctx context.Context, instance game.InstanceID, names []string, to profile.ID, move bool) (TransferPlan, error) {
	sp, err := s.support(ctx, instance)
	if err != nil {
		return TransferPlan{}, err
	}
	release, err := s.Locks.Acquire(instance, holder)
	if err != nil {
		return TransferPlan{}, err
	}
	defer release()
	from, dst, err := s.profilesFor(ctx, instance, to)
	if err != nil {
		return TransferPlan{}, err
	}
	plan, files, err := s.plan(ctx, sp, from, dst, names)
	if err != nil {
		return plan, err
	}
	if err := s.FS.MkdirAll(ctx, plan.To); err != nil {
		return plan, fileError(err, plan.To)
	}
	for _, f := range files {
		target := f.name
		if r, ok := plan.Renamed[f.name]; ok {
			target = r
		}
		pairs := [][2]string{{f.name, target}}
		tc := sp.sg.SaveCompanions(sp.inst.Game, target)
		for _, c := range f.companions {
			for i, sc := range sp.sg.SaveCompanions(sp.inst.Game, f.name) {
				if strings.EqualFold(sc, c) && i < len(tc) {
					pairs = append(pairs, [2]string{c, tc[i]})
				}
			}
		}
		for _, pr := range pairs {
			src, dstPath := game.JoinPath(plan.From, pr[0]), game.JoinPath(plan.To, pr[1])
			if move {
				err = s.FS.Rename(ctx, src, dstPath)
			} else {
				err = s.FS.Copy(ctx, src, dstPath)
			}
			if err != nil {
				return plan, fileError(err, dstPath)
			}
		}
	}
	t := EventCopied
	if move {
		t = EventMoved
	}
	return plan, s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		tx.Emit(s.newEvent(t, subjectInstance, string(instance), map[string]string{
			"instance": string(instance), "from": string(from.ID()), "fromName": from.Name(), "to": string(dst.ID()), "toName": dst.Name(),
			"count": strconv.Itoa(len(files)),
		}))
		return nil
	})
}

// Delete removes saves of the active profile with their companions. The UI
// confirms first: a save deleted is gone (anti-pattern 38 is for reversible
// actions).
func (s *Service) Delete(ctx context.Context, instance game.InstanceID, names []string) error {
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
	dir, err := s.folderOf(ctx, sp, p)
	if err != nil {
		return err
	}
	files, err := s.find(ctx, sp, dir, names)
	if err != nil {
		return err
	}
	for _, f := range files {
		for _, n := range append([]string{f.name}, f.companions...) {
			if err := s.FS.Remove(ctx, game.JoinPath(dir, n)); err != nil {
				return fileError(err, n)
			}
		}
	}
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		tx.Emit(s.newEvent(EventDeleted, subjectProfile, string(p.ID()), map[string]string{
			"instance": string(instance), "profile": string(p.ID()), "count": strconv.Itoa(len(files)),
		}))
		return nil
	})
}

// EnableResult is what EnableProviders changed.
type EnableResult struct {
	Mods    []ModRef
	Plugins []string
	// Absent are plugins no installed mod provides.
	Absent []string
}

// EnableProviders is "Habilitar os mods que fornecem": the mods that
// provide the plugins a save uses and the profile does not load are
// enabled, then those plugins are activated.
func (s *Service) EnableProviders(ctx context.Context, instance game.InstanceID, name string) (EnableResult, error) {
	var out EnableResult
	ls, err := s.List(ctx, instance)
	if err != nil {
		return out, err
	}
	i := slices.IndexFunc(ls.Saves, func(sv Save) bool { return strings.EqualFold(sv.Name, name) })
	if i < 0 || !validName(name) {
		return out, fail(CodeNotFound, nil, "name", name)
	}
	var ids []mod.ID
	for _, m := range ls.Saves[i].Missing {
		if !m.Present && len(m.Mods) == 0 {
			out.Absent = append(out.Absent, m.Name)
			continue
		}
		out.Plugins = append(out.Plugins, m.Name)
		for _, r := range m.Mods {
			if !r.Enabled && !slices.Contains(ids, r.ID) {
				ids = append(ids, r.ID)
				out.Mods = append(out.Mods, r)
			}
		}
	}
	if len(ids) > 0 {
		if err := s.ModSwitch.SetModsEnabled(ctx, instance, ids, true); err != nil {
			return out, err
		}
	}
	if len(out.Plugins) > 0 && s.Plugins != nil {
		if err := s.Plugins.Enable(ctx, instance, out.Plugins); err != nil {
			return out, err
		}
	}
	return out, nil
}

// CopyID names the clone option of the module (profiles.Copier).
func (s *Service) CopyID() string { return "saves" }

// CopySize is what the saves of a profile with saves of its own weigh.
func (s *Service) CopySize(ctx context.Context, p *profile.Profile) (int, int64, bool) {
	if !p.Features().LocalSaves {
		return 0, 0, false
	}
	sp, err := s.support(ctx, p.Instance())
	if err != nil {
		return 0, 0, false
	}
	dir, err := s.folderOf(ctx, sp, p)
	if err != nil {
		return 0, 0, false
	}
	files, err := s.saveFiles(ctx, sp, dir)
	if err != nil {
		return 0, 0, false
	}
	var size int64
	for _, f := range files {
		size += f.size
	}
	return len(files), size, true
}

// CopyFiles copies every file of the save folder of from into the folder of
// to, a clone just created (core/07 §3, "copiar saves").
func (s *Service) CopyFiles(ctx context.Context, from, to *profile.Profile) error {
	sp, err := s.support(ctx, from.Instance())
	if err != nil {
		return err
	}
	if !from.Features().LocalSaves || !to.Features().LocalSaves {
		return nil
	}
	src, err := s.folderOf(ctx, sp, from)
	if err != nil {
		return err
	}
	dst, err := s.folderOf(ctx, sp, to)
	if err != nil {
		return err
	}
	if err := s.copyTree(ctx, src, dst); err != nil {
		return err
	}
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		tx.Emit(s.newEvent(EventCopied, subjectInstance, string(from.Instance()), map[string]string{
			"instance": string(from.Instance()), "from": string(from.ID()), "fromName": from.Name(), "to": string(to.ID()), "toName": to.Name(), "clone": "true",
		}))
		return nil
	})
}

func (s *Service) copyTree(ctx context.Context, src, dst string) error {
	info, err := s.FS.Stat(ctx, src)
	if err != nil {
		return fileError(err, src)
	}
	if !info.Exists {
		return nil
	}
	if err := s.FS.MkdirAll(ctx, dst); err != nil {
		return fileError(err, dst)
	}
	entries, err := s.FS.ReadDir(ctx, src)
	if err != nil {
		return fileError(err, src)
	}
	for _, e := range entries {
		a, b := game.JoinPath(src, e.Name), game.JoinPath(dst, e.Name)
		if e.IsDir {
			err = s.copyTree(ctx, a, b)
		} else if err = s.FS.Copy(ctx, a, b); err != nil {
			err = fileError(err, b)
		}
		if err != nil {
			return err
		}
	}
	return nil
}
