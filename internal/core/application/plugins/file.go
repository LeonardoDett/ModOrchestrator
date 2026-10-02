package plugins

import (
	"bytes"
	"context"
	"errors"
	"io"
	"path"
	"slices"
	"strconv"
	"strings"

	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/core/domain/profile"
)

// observed is the game's load order file as found now.
type observed struct {
	path    string
	exists  bool
	data    []byte
	hash    string
	entries []plugin.Entry
	// unreadable: the file exists but could not be read (locked...).
	unreadable bool
}

// fileState compares the desired load order, the applied record and the
// observed file (D040).
type fileState struct {
	obs     observed
	applied *deployment.AppliedLoadOrder
	desired []byte
	// external: the file differs from the last write of the manager (or,
	// before any write, from what the manager would write). It is never
	// overwritten without triage (INV-PLG-03).
	external bool
	// inSync: the file already holds the desired load order.
	inSync bool
}

func (s *Service) filePath(st *state) (string, error) {
	loc := st.lo.LoadOrderFile(st.inst)
	base, err := s.Folders.Folder(loc.Folder)
	if err != nil {
		return "", err
	}
	return game.JoinPath(base, loc.Path), nil
}

func (s *Service) observe(ctx context.Context, st *state) (observed, error) {
	p, err := s.filePath(st)
	if err != nil {
		return observed{}, err
	}
	o := observed{path: p}
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
	o.data, err = io.ReadAll(io.LimitReader(f, 8<<20))
	if err != nil {
		o.unreadable = true
		return o, nil
	}
	if o.hash, err = s.Hasher.Hash(ctx, bytes.NewReader(o.data)); err != nil {
		return o, err
	}
	o.entries, _ = st.lo.Parse(st.inst.Game, o.data)
	return o, nil
}

// state of the load order file for the order the profile should have.
func (s *Service) fileState(ctx context.Context, st *state, order []plugin.Name) (fileState, error) {
	var fs fileState
	obs, err := s.observe(ctx, st)
	if err != nil {
		return fs, err
	}
	fs.obs = obs
	if rec, err := s.Manifests.CurrentLoadOrder(ctx, st.inst.ID); err == nil {
		fs.applied = rec
	} else if !errors.Is(err, ports.ErrNotFound) {
		return fs, err
	}
	if fs.desired, err = st.lo.Serialize(st.inst.Game, st.entries(order)); err != nil {
		return fs, err
	}
	desiredHash, err := s.Hasher.Hash(ctx, bytes.NewReader(fs.desired))
	if err != nil {
		return fs, err
	}
	if obs.exists && !obs.unreadable {
		if fs.applied != nil {
			fs.external = !fs.applied.Ours(obs.hash)
		} else {
			fs.external = obs.hash != desiredHash
		}
	}
	fs.inSync = obs.exists && obs.hash == desiredHash
	return fs, nil
}

// errExternal stops a write: the file changed outside the app.
var errExternal = fail(CodeExternalChange, nil)

// write serializes the desired load order of the active profile into the
// game's file (INV-PLG-02): only from the arranged order, only if no hard
// constraint breaks (INV-PLG-01), never over an external change unless
// the user chose "Restaurar a do profile" (force, INV-PLG-03). The pending
// hash is recorded before writing; the file that is replaced is kept in
// the BackupStore the first time and whenever it was external.
func (s *Service) write(ctx context.Context, st *state, op operation.ID, force bool) (bool, error) {
	if st.lo == nil {
		return false, nil
	}
	a := st.arrange(false)
	if v := plugin.Violations(a.order, st.hard); len(v) > 0 {
		return false, fail(CodeOrderViolates, nil, "count", strconv.Itoa(len(v)))
	}
	fs, err := s.fileState(ctx, st, a.order)
	if err != nil {
		return false, err
	}
	if fs.obs.unreadable {
		return false, fail(CodeFileLocked, nil, "path", fs.obs.path)
	}
	if fs.external && !force {
		return false, errExternal
	}
	rec := &deployment.AppliedLoadOrder{Instance: st.inst.ID}
	if fs.applied != nil {
		cp := *fs.applied
		rec = &cp
	}
	hash, err := s.Hasher.Hash(ctx, bytes.NewReader(fs.desired))
	if err != nil {
		return false, err
	}
	if fs.inSync && rec.Ours(hash) && slices.Equal(rec.Order, a.order) {
		return false, nil // the game already has it
	}
	if fs.obs.exists && (fs.applied == nil || fs.external) {
		name := "plugins.txt"
		if fs.applied != nil {
			name = "plugins-external-" + s.Clock.Now().UTC().Format("20060102T150405") + ".txt"
		}
		rel, err := s.backup(ctx, st, name, fs.obs.data)
		if err != nil {
			return false, err
		}
		if fs.applied == nil {
			rec.Original = rel
		}
	}
	// Journal: the hash about to be written is recorded first.
	rec.PendingHash = hash
	if err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error { return tx.Manifests().SaveLoadOrder(ctx, rec) }); err != nil {
		return false, err
	}
	if err := s.FS.MkdirAll(ctx, parentDir(fs.obs.path)); err != nil {
		return false, fileError(err, fs.obs.path)
	}
	if !fs.inSync {
		if err := s.FS.WriteFile(ctx, fs.obs.path, fs.desired); err != nil {
			return false, fileError(err, fs.obs.path)
		}
	}
	entries := st.entries(a.order)
	if fs.applied != nil && !slices.Equal(fs.applied.Order, a.order) {
		rec.PrevOrder, rec.PrevEnabled = fs.applied.Order, fs.applied.Enabled
	}
	rec.Profile = deployment.ProfileID(st.profile.ID())
	rec.Order, rec.Enabled = a.order, nil
	for _, e := range entries {
		if e.Enabled {
			rec.Enabled = append(rec.Enabled, e.Name)
		}
	}
	rec.FileHash, rec.PendingHash, rec.Operation, rec.AppliedAt = hash, "", op, s.Clock.Now()
	err = s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		if err := tx.Manifests().SaveLoadOrder(ctx, rec); err != nil {
			return err
		}
		e := s.newEvent(EventApplied, subjectInstance, string(st.inst.ID), map[string]string{
			"instance": string(st.inst.ID), "profile": string(st.profile.ID()), "count": strconv.Itoa(len(rec.Enabled)), "forced": strconv.FormatBool(force),
		})
		e.OperationID = string(op)
		tx.Emit(e)
		return nil
	})
	s.remember(st.inst.ID, fs.obs.path, hash)
	return err == nil, err
}

// backup keeps a copy of the file being replaced in the BackupStore of
// the instance (never deleted, D034 spirit) and returns its relative path.
func (s *Service) backup(ctx context.Context, st *state, name string, data []byte) (string, error) {
	dir := game.JoinPath(st.inst.BackupStore, "load_order")
	if err := s.FS.MkdirAll(ctx, dir); err != nil {
		return "", fileError(err, dir)
	}
	p := game.JoinPath(dir, name)
	for i := 1; ; i++ { // an existing backup is never overwritten
		info, err := s.FS.Stat(ctx, p)
		if err != nil || !info.Exists {
			break
		}
		p = game.JoinPath(dir, name+".backup"+strconv.Itoa(i))
	}
	if err := s.FS.WriteFile(ctx, p, data); err != nil {
		return "", fileError(err, p)
	}
	return "load_order/" + path.Base(strings.ReplaceAll(p, `\`, "/")), nil
}

func fileError(err error, p string) error {
	if errors.Is(err, ports.ErrFileLocked) || errors.Is(err, ports.ErrPermission) {
		return fail(CodeFileLocked, err, "path", p)
	}
	return fail(CodeIOError, err, "path", p)
}

// AfterDeploy is the `post` step of a deploy (core/04 §5 step 9, core/08
// §7): the inventory changed with the deploy, so the load order is
// arranged again and written. It runs under the deploy's lock. An
// external change is left for the triage (the deploy is not failed by it:
// the diagnostic asks for the decision, D088).
func (s *Service) AfterDeploy(ctx context.Context, instance game.InstanceID, op operation.ID) error {
	st, err := s.load(ctx, instance)
	if err != nil {
		var e *Error
		if errors.As(err, &e) && e.code == CodeNoPlugins {
			return nil
		}
		return err
	}
	if err := s.syncLocked(ctx, st); err != nil {
		return err
	}
	if st, err = s.load(ctx, instance); err != nil {
		return err
	}
	if _, err := s.write(ctx, st, op, false); err != nil && !errors.Is(err, errExternal) {
		return opError(err)
	}
	return nil
}

// ApplyLoadOrder writes the load order when only it changed (operation
// apply_load_order, core/08 §7), with the instance lock.
func (s *Service) ApplyLoadOrder(ctx context.Context, instance game.InstanceID) (operation.ID, error) {
	return s.runApply(ctx, instance, func(ctx context.Context, st *state, op operation.ID) error {
		_, err := s.write(ctx, st, op, false)
		return err
	})
}

func (s *Service) runApply(ctx context.Context, instance game.InstanceID, fn func(ctx context.Context, st *state, op operation.ID) error) (operation.ID, error) {
	release, err := s.Locks.Acquire(instance, holderApply)
	if err != nil {
		return "", err
	}
	defer release()
	st, err := s.load(ctx, instance)
	if err != nil {
		return "", err
	}
	spec := operations.Spec{Kind: KindApplyLoadOrder, Subject: event.EntityRef{Kind: subjectInstance, ID: string(instance)}, Steps: []string{StepCheck, StepWrite}}
	var opErr error
	id, err := s.Ops.Run(ctx, spec, func(ctx context.Context, t *operations.Tracker) error {
		if err := t.BeginStep(ctx, StepCheck); err != nil {
			return err
		}
		if err := t.CompleteStep(ctx, StepCheck); err != nil {
			return err
		}
		if err := t.BeginStep(ctx, StepWrite); err != nil {
			return err
		}
		if err := fn(ctx, st, t.ID()); err != nil {
			opErr = err
			return opError(err)
		}
		return t.CompleteStep(ctx, StepWrite)
	})
	if opErr != nil {
		return id, opErr
	}
	return id, err
}

// Triage actions of a load_order external change (core/09 §4).
const (
	ResolveImport  = "import_load_order"
	ResolveRestore = "restore_load_order"
)

// ResolveExternalChange applies the user's decision about the load order
// file changed outside the app (D040): import it into the profile (through
// the engine, so hard constraints still hold) or restore the profile's.
func (s *Service) ResolveExternalChange(ctx context.Context, instance game.InstanceID, action string) (operation.ID, error) {
	if action != ResolveImport && action != ResolveRestore {
		return "", fail("external_decision_invalid", nil, "action", action)
	}
	return s.runApply(ctx, instance, func(ctx context.Context, st *state, op operation.ID) error {
		fs, err := s.fileState(ctx, st, st.arrange(false).order)
		if err != nil {
			return err
		}
		if !fs.external {
			return fail(CodeNoExternalChange, nil)
		}
		if action == ResolveRestore {
			_, err := s.write(ctx, st, op, true)
			return err
		}
		if err := s.importEntries(ctx, st, fs.obs.entries, "external"); err != nil {
			return err
		}
		// The file found is adopted as the last write: what the engine
		// changed in it is written now, with no new triage.
		// The external version is kept as found: what the engine changes
		// in it is written over it.
		rec := &deployment.AppliedLoadOrder{Instance: instance}
		if fs.applied != nil {
			cp := *fs.applied
			rec = &cp
		}
		if fs.obs.exists {
			name := "plugins.txt"
			if fs.applied != nil {
				name = "plugins-external-" + s.Clock.Now().UTC().Format("20060102T150405") + ".txt"
			}
			rel, err := s.backup(ctx, st, name, fs.obs.data)
			if err != nil {
				return err
			}
			if fs.applied == nil {
				rec.Original = rel
			}
		}
		rec.FileHash, rec.PendingHash = fs.obs.hash, ""
		if err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error { return tx.Manifests().SaveLoadOrder(ctx, rec) }); err != nil {
			return err
		}
		st, err = s.load(ctx, instance)
		if err != nil {
			return err
		}
		_, err = s.write(ctx, st, op, false)
		return err
	})
}

// importEntries makes an external load order the profile's: its order
// becomes the current order of the engine (only hard constraints, or all
// with auto-sort) and its active marks become the plugin states. Plugins
// the text does not list keep their state and go to the end.
func (s *Service) importEntries(ctx context.Context, st *state, entries []plugin.Entry, source string) error {
	var order []plugin.Name
	states := map[plugin.Name]bool{}
	for _, e := range entries {
		p, ok := st.plugin(e.Name)
		if !ok {
			continue
		}
		order = append(order, p.Name)
		if !p.Implicit {
			states[p.Name] = e.Enabled
		}
	}
	if len(order) == 0 {
		return fail(CodeImportEmpty, nil)
	}
	merged, _, _ := plugin.Merge(order, st.names())
	run := plugin.Settle
	if st.settings.autoSort {
		run = plugin.Sort
	}
	res, err := run(merged, st.constraints(true))
	if err != nil {
		res, err = plugin.Settle(merged, st.constraints(false))
		if err != nil {
			return fail(CodeOrderViolates, err)
		}
	}
	m := mutation{st: st, order: res.Order, states: states, snapshot: profile.SnapshotBeforeRevert}
	m.events = append(m.events, s.newEvent(EventImported, subjectProfile, string(st.profile.ID()), map[string]string{
		"instance": string(st.inst.ID), "source": source, "count": strconv.Itoa(len(order)), "moved": strconv.Itoa(len(res.Moves)),
	}))
	_, err = s.persist(ctx, m)
	return err
}

// ImportLoadOrder is "Importar ordem…" (ui/telas/load-order.md §3): a text
// in the format of the game's file passes through the engine; the moves
// it needed are returned.
func (s *Service) ImportLoadOrder(ctx context.Context, instance game.InstanceID, text string) (SortResult, error) {
	var out SortResult
	err := s.command(ctx, instance, func(st *state) error {
		if st.lo == nil {
			return fail(CodeNoPlugins, nil)
		}
		entries, err := st.lo.Parse(st.inst.Game, []byte(text))
		if err != nil {
			return fail(CodeImportEmpty, err)
		}
		before := st.arrange(false).order
		if err := s.importEntries(ctx, st, entries, "text"); err != nil {
			return err
		}
		st2, err := s.load(ctx, instance)
		if err != nil {
			return err
		}
		out.Moved = plugin.Moved(before, st2.profile.LoadOrder())
		return nil
	})
	return out, err
}

// RestorePreviousLoadOrder is "Restaurar load order anterior" (core/08
// §7): the load order written before the last one becomes the profile's
// again and is written.
func (s *Service) RestorePreviousLoadOrder(ctx context.Context, instance game.InstanceID) (operation.ID, error) {
	return s.runApply(ctx, instance, func(ctx context.Context, st *state, op operation.ID) error {
		rec, err := s.Manifests.CurrentLoadOrder(ctx, instance)
		if errors.Is(err, ports.ErrNotFound) || (err == nil && len(rec.PrevOrder) == 0) {
			return fail(CodeNothingToRestore, nil)
		}
		if err != nil {
			return err
		}
		active := map[string]bool{}
		for _, n := range rec.PrevEnabled {
			active[n.Key()] = true
		}
		var entries []plugin.Entry
		for _, n := range rec.PrevOrder {
			entries = append(entries, plugin.Entry{Name: n, Enabled: active[n.Key()]})
		}
		if err := s.importEntries(ctx, st, entries, "previous"); err != nil {
			return err
		}
		st, err = s.load(ctx, instance)
		if err != nil {
			return err
		}
		_, err = s.write(ctx, st, op, false)
		return err
	})
}

// parentDir is the folder of an absolute path (either separator).
func parentDir(p string) string {
	i := strings.LastIndexAny(p, `/\`)
	if i <= 0 {
		return p
	}
	return p[:i]
}
