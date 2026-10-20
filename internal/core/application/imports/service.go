// Package imports brings what another mod manager knows about a game into
// an instance (D128): mods, their order and separators, rules, profiles,
// plugins and load order, and optionally categories. Mods are copied into
// the staging; nothing is written in the other manager's folders. The
// import is one operation: the mods enter the library as installing before
// any copy, and everything else is committed in one transaction at the end,
// so an interruption leaves no half-imported library (Recover).
package imports

import (
	"context"
	"errors"
	"fmt"
	"io"
	"maps"
	"path"
	"slices"
	"strconv"
	"strings"
	"sync"

	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/instancelock"
	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/installer"
	"modorchestrator/internal/core/domain/migration"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
)

// Operation kind, steps and lock holder.
const (
	KindImportManager operation.Kind = "import_manager"
	StepRead                         = "read"
	StepCopy                         = "copy"
	StepCommit                       = "commit"
	holder                           = "import_manager"
	// Installer names the installations an import records.
	Installer = "imported"
)

// Event types.
const (
	EventManagerImported event.Type = "import.manager_completed"
	// EventModInstalled is the library's: an imported mod is installed.
	EventModInstalled event.Type = "mod.installed"
	subjectMod                   = "mod"
	subjectInstance              = "instance"
)

// Error codes (core/02 §13).
const (
	CodeSourceUnknown   = "import_manager_unknown"
	CodeSourceUnread    = "import_manager_unreadable"
	CodeNothing         = "import_manager_empty"
	CodeStagingUnavail  = "staging_unavailable"
	CodeDiskFull        = "disk_full"
	CodeProfileNotFound = "import_manager_profile_unknown"
)

// Reasons a mod of the other manager is left out.
const (
	SkipMissing = "missing"
	SkipEmpty   = "empty"
	SkipUnsafe  = "unsafe"
)

// Deps are the ports the service needs.
type Deps struct {
	Registry  *games.Registry
	Instances ports.GameInstances
	Readers   []ports.ManagerReader
	Mods      ports.Mods
	UoW       ports.UnitOfWork
	Publisher operations.Publisher
	FS        ports.FileSystem
	Extractor ports.Extractor
	Ops       *operations.Service
	Locks     *instancelock.Locks
	IDs       operations.IDGenerator
	Clock     operations.Clock
}

// Service implements the import use cases.
type Service struct {
	Deps
	workers sync.WaitGroup
}

// NewService wires the service.
func NewService(d Deps) *Service {
	if d.Locks == nil {
		d.Locks = instancelock.New()
	}
	return &Service{Deps: d}
}

// Wait blocks until running imports finish (tests and shutdown).
func (s *Service) Wait() { s.workers.Wait() }

// Error is a failure with a stable code and parameters (D044, D053).
type Error struct {
	code   string
	params map[string]string
	cause  error
}

func (e *Error) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("imports: %s: %v", e.code, e.cause)
	}
	return "imports: " + e.code
}
func (e *Error) Unwrap() error             { return e.cause }
func (e *Error) Code() string              { return e.code }
func (e *Error) Params() map[string]string { return e.params }

func fail(code string, cause error, kv ...string) *Error {
	e := &Error{code: code, cause: cause, params: map[string]string{}}
	for i := 0; i+1 < len(kv); i += 2 {
		e.params[kv[i]] = kv[i+1]
	}
	return e
}

func opError(err error) *operation.Error {
	var oe *operation.Error
	if errors.As(err, &oe) {
		return oe
	}
	var e *Error
	if errors.As(err, &e) {
		var parts []string
		for _, k := range slices.Sorted(maps.Keys(e.params)) {
			parts = append(parts, k+"="+e.params[k])
		}
		return &operation.Error{Code: e.code, Message: err.Error(), Detail: strings.Join(parts, " "), Params: e.params}
	}
	return &operation.Error{Code: "internal", Message: err.Error()}
}

type env struct {
	inst    game.Instance
	adapter ports.GameAdapter
	def     game.Definition
}

func (s *Service) env(ctx context.Context, id game.InstanceID) (env, error) {
	inst, err := s.Instances.Get(ctx, id)
	if err != nil {
		return env{}, err
	}
	a, ok := s.Registry.ByName(inst.Adapter)
	if !ok {
		return env{}, fail(games.CodeGameUnknown, nil, "game", string(inst.Game))
	}
	def, err := ports.InstanceDefinition(a, inst)
	if err != nil {
		return env{}, fail(games.CodeGameUnknown, err, "game", string(inst.Game))
	}
	return env{inst: inst, adapter: a, def: def}, nil
}

func (s *Service) reader(kind game.ForeignKind) (ports.ManagerReader, error) {
	for _, r := range s.Readers {
		if r.Manager() == kind {
			return r, nil
		}
	}
	return nil, fail(CodeSourceUnknown, nil, "manager", string(kind))
}

// Sources lists what every manager keeps about the game folder of the
// instance. A manager that cannot be read is skipped.
func (s *Service) Sources(ctx context.Context, instance game.InstanceID) ([]migration.Source, error) {
	inst, err := s.Instances.Get(ctx, instance)
	if err != nil {
		return nil, err
	}
	out := []migration.Source{}
	for _, r := range s.Readers {
		found, err := r.Find(ctx, inst.Root)
		if err != nil {
			continue
		}
		out = append(out, found...)
	}
	return out, nil
}

// OpenFolder lists the sources of a folder the user chose ("Apontar a
// pasta"): an MO2 instance or a Vortex data folder.
func (s *Service) OpenFolder(ctx context.Context, folder string) ([]migration.Source, error) {
	for _, r := range s.Readers {
		found, err := r.Open(ctx, folder)
		if err == nil {
			return found, nil
		}
	}
	return nil, fail(CodeSourceUnknown, nil, "folder", folder)
}

// read loads the source and, for a game with plugins, the plugin list each
// profile keeps: the file the game itself reads (named by the adapter),
// parsed by the adapter (D112).
func (s *Service) read(ctx context.Context, e env, src migration.Source) (migration.Snapshot, error) {
	snap, err := s.readSource(ctx, src)
	if err != nil {
		return snap, err
	}
	lo, ok := e.adapter.(ports.LoadOrderSupport)
	if !ok || !e.def.Capabilities.Has(game.CapPlugins) {
		return snap, nil
	}
	name := path.Base(strings.ReplaceAll(lo.LoadOrderFile(e.inst).Path, `\`, "/"))
	for i, p := range snap.Profiles {
		if p.Folder == "" {
			continue
		}
		f, err := s.FS.Open(ctx, game.JoinPath(p.Folder, name))
		if err != nil {
			continue
		}
		data, err := io.ReadAll(io.LimitReader(f, 8<<20))
		f.Close()
		if err != nil {
			continue
		}
		entries, err := lo.Parse(e.inst.Game, data)
		if err != nil {
			continue
		}
		snap.Profiles[i].Plugins = []migration.PluginState{}
		snap.Profiles[i].LoadOrder = []string{}
		for _, en := range entries {
			snap.Profiles[i].Plugins = append(snap.Profiles[i].Plugins, migration.PluginState{Name: string(en.Name), Enabled: en.Enabled})
			snap.Profiles[i].LoadOrder = append(snap.Profiles[i].LoadOrder, string(en.Name))
		}
	}
	return snap, nil
}

func (s *Service) readSource(ctx context.Context, src migration.Source) (migration.Snapshot, error) {
	r, err := s.reader(src.Manager)
	if err != nil {
		return migration.Snapshot{}, err
	}
	snap, err := r.Read(ctx, src)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return migration.Snapshot{}, err
		}
		return migration.Snapshot{}, fail(CodeSourceUnread, err, "manager", string(src.Manager), "folder", src.Path)
	}
	return snap, nil
}

// Skipped is a mod of the other manager the import leaves out.
type Skipped struct {
	Name   string
	Reason string
}

// ProfilePreview is one profile of the other manager.
type ProfilePreview struct {
	Name    string
	Active  bool
	Mods    int
	Enabled int
	// Plugins and LoadOrder are only counted when the instance has the
	// capabilities (0 otherwise).
	Plugins   int
	LoadOrder int
}

// Preview is what an import would bring, per part (RD16 screens).
type Preview struct {
	Source migration.Source
	// Parts are the parts the instance can receive; Defaults the ones
	// "Importar tudo" brings.
	Parts    []migration.Part
	Defaults []migration.Part
	Mods     int
	Files    int
	Size     int64
	// FreeSpace of the staging volume (-1 when unknown).
	FreeSpace         int64
	Skipped           []Skipped
	Separators        int
	OrderRules        int
	Dependencies      int
	Incompatibilities int
	Profiles          []ProfilePreview
	Categories        int
	// Existing counts the mods the library already has.
	Existing int
}

// item is a mod that will be imported.
type item struct {
	src   migration.Mod
	id    mod.ID
	files []installer.Entry
	size  int64
}

// scan lists the files of every mod and leaves out the missing, the empty
// and the unsafe ones.
func (s *Service) scan(ctx context.Context, snap migration.Snapshot) ([]*item, []Skipped, error) {
	var items []*item
	var skipped []Skipped
	for _, m := range snap.Mods {
		if err := ctx.Err(); err != nil {
			return nil, nil, err
		}
		info, err := s.FS.Stat(ctx, m.Folder)
		if err != nil || !info.Exists || !info.IsDir {
			skipped = append(skipped, Skipped{Name: m.Name, Reason: SkipMissing})
			continue
		}
		raw, err := s.Extractor.List(ctx, m.Folder)
		if err != nil {
			skipped = append(skipped, Skipped{Name: m.Name, Reason: SkipMissing})
			continue
		}
		in := make([]installer.RawEntry, 0, len(raw))
		for _, e := range raw {
			if slices.ContainsFunc(m.Skip, func(n string) bool { return strings.EqualFold(n, strings.Trim(e.Path, `/\`)) }) {
				continue
			}
			in = append(in, installer.RawEntry{Path: e.Path, Size: e.Size, Dir: e.IsDir, Link: e.IsLink})
		}
		entries, unsafe := installer.Inspect(in)
		if len(unsafe) > 0 {
			skipped = append(skipped, Skipped{Name: m.Name, Reason: SkipUnsafe})
			continue
		}
		it := &item{src: m}
		for _, e := range entries {
			if !e.Dir {
				it.files = append(it.files, e)
				it.size += e.Size
			}
		}
		if len(it.files) == 0 {
			skipped = append(skipped, Skipped{Name: m.Name, Reason: SkipEmpty})
			continue
		}
		items = append(items, it)
	}
	return items, skipped, nil
}

// Preview reads the source and counts what an import would bring.
func (s *Service) Preview(ctx context.Context, instance game.InstanceID, src migration.Source) (Preview, error) {
	e, err := s.env(ctx, instance)
	if err != nil {
		return Preview{}, err
	}
	snap, err := s.read(ctx, e, src)
	if err != nil {
		return Preview{}, err
	}
	items, skipped, err := s.scan(ctx, snap)
	if err != nil {
		return Preview{}, err
	}
	keep := map[string]bool{}
	pv := Preview{Source: snap.Source, Parts: snap.Parts(e.def), Skipped: skipped, FreeSpace: -1, Profiles: []ProfilePreview{}}
	if pv.Skipped == nil {
		pv.Skipped = []Skipped{}
	}
	pv.Defaults = migration.DefaultParts(pv.Parts)
	for _, it := range items {
		keep[it.src.Key] = true
		pv.Mods++
		pv.Files += len(it.files)
		pv.Size += it.size
	}
	if free, err := s.FS.FreeSpace(ctx, e.inst.Staging); err == nil {
		pv.FreeSpace = free
	}
	for _, r := range snap.RulesAmong(keep) {
		switch r.Kind {
		case migration.RuleAfter:
			pv.OrderRules++
		case migration.RuleRequires, migration.RuleRecommends:
			pv.Dependencies++
		case migration.RuleConflicts:
			pv.Incompatibilities++
		}
	}
	plugins, loadOrder := slices.Contains(pv.Parts, migration.PartPlugins), slices.Contains(pv.Parts, migration.PartLoadOrder)
	for _, p := range snap.Profiles {
		pp := ProfilePreview{Name: p.Name, Active: p.Active, Mods: len(items)}
		for k, on := range p.Enabled {
			if on && keep[k] {
				pp.Enabled++
			}
		}
		if plugins {
			pp.Plugins = len(p.Plugins)
		}
		if loadOrder {
			pp.LoadOrder = len(p.LoadOrder)
		}
		pv.Profiles = append(pv.Profiles, pp)
		if p.Active || pv.Separators == 0 {
			pv.Separators = snap.Separators(p, keep)
		}
	}
	used := map[string]bool{}
	for _, it := range items {
		for c := it.src.Category; c != "" && !used[c]; {
			used[c] = true
			i := slices.IndexFunc(snap.Categories, func(x migration.Category) bool { return x.Key == c })
			if i < 0 {
				break
			}
			c = snap.Categories[i].Parent
		}
	}
	pv.Categories = len(used)
	mods, err := s.Mods.ListByInstance(ctx, instance)
	if err != nil {
		return Preview{}, err
	}
	for _, m := range mods {
		if m.State != mod.StateRemoved {
			pv.Existing++
		}
	}
	return pv, nil
}

// Options choose what an import brings.
type Options struct {
	// Parts to bring; empty means the defaults. Mods always come.
	Parts []migration.Part
	// Profiles of the other manager to bring, by name; empty means its
	// active profile.
	Profiles []string
}

// Start begins the import and returns its operation; it runs in the
// background and reports progress like every operation. The instance lock
// is held until it ends, so nothing deploys meanwhile.
func (s *Service) Start(ctx context.Context, instance game.InstanceID, src migration.Source, opts Options) (operation.ID, error) {
	e, err := s.env(ctx, instance)
	if err != nil {
		return "", err
	}
	if _, err := s.reader(src.Manager); err != nil {
		return "", err
	}
	release, err := s.Locks.Acquire(instance, holder)
	if err != nil {
		return "", err
	}
	spec := operations.Spec{Kind: KindImportManager, Subject: event.EntityRef{Kind: subjectInstance, ID: string(instance)}, Steps: []string{StepRead, StepCopy, StepCommit}}
	t, err := s.Ops.Enqueue(ctx, spec)
	if err != nil {
		release()
		return "", err
	}
	s.workers.Add(1)
	go func() {
		defer s.workers.Done()
		defer release()
		bg := context.WithoutCancel(ctx)
		_ = s.Ops.Execute(bg, t, func(ctx context.Context, t *operations.Tracker) error {
			r := &run{s: s, t: t, env: e, src: src, opts: opts}
			if err := r.run(ctx); err != nil {
				r.abort(context.WithoutCancel(ctx))
				return opError(err)
			}
			return nil
		})
	}()
	return t.ID(), nil
}

func (s *Service) newEvent(t event.Type, kind, id string, op operation.ID, payload map[string]string) event.Event {
	if payload == nil {
		payload = map[string]string{}
	}
	return event.Event{
		ID: s.IDs.NewID(), Type: t, OccurredAt: s.Clock.Now(), OperationID: string(op),
		Subject: event.EntityRef{Kind: kind, ID: id}, Payload: payload,
	}
}

func (s *Service) commit(ctx context.Context, fn func(ctx context.Context, tx ports.Tx) error) error {
	stored, err := s.UoW.Do(ctx, fn)
	if err != nil {
		return err
	}
	if len(stored) > 0 {
		s.Publisher.Publish(stored...)
	}
	return nil
}

// ownsStaging checks the staging marker names this instance (D058).
func (s *Service) ownsStaging(ctx context.Context, inst game.Instance) bool {
	r, err := s.FS.Open(ctx, game.JoinPath(inst.Staging, game.StagingMarker))
	if err != nil {
		return false
	}
	defer r.Close()
	buf := make([]byte, 4096)
	n, _ := r.Read(buf)
	owner, err := game.ParseMarker(buf[:n])
	return err == nil && owner == inst.ID
}

// Recover removes what interrupted imports left (D128): their mods never
// reached the final commit, so they leave the library, and the staging
// folders they placed are deleted. It runs at startup after interrupted
// operations were marked and before the library recovery, which then
// deletes the folders of removed mods and the ".installing" leftovers.
func (s *Service) Recover(ctx context.Context) error {
	instances, err := s.Instances.List(ctx)
	if err != nil {
		return err
	}
	var errs []error
	for _, inst := range instances {
		mods, err := s.Mods.ListByInstance(ctx, inst.ID)
		if err != nil {
			errs = append(errs, err)
			continue
		}
		var stale []mod.ID
		for _, m := range mods {
			if m.Source.Kind == mod.SourceImport && m.State == mod.StateInstalling && m.Installation == "" {
				stale = append(stale, m.ID)
			}
		}
		if len(stale) == 0 {
			continue
		}
		if err := s.discard(ctx, inst, stale); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// discard takes mods that were never committed out of the library and
// deletes their staging folders.
func (s *Service) discard(ctx context.Context, inst game.Instance, ids []mod.ID) error {
	now := s.Clock.Now()
	err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		for _, id := range ids {
			m, err := tx.Mods().Get(ctx, id)
			if err != nil {
				return err
			}
			if m.State == mod.StateInstalling {
				if err := m.AbortInstall(now); err != nil {
					return err
				}
			}
			if err := m.Remove(now); err != nil {
				return err
			}
			if err := tx.Mods().Save(ctx, m); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	if s.ownsStaging(ctx, inst) {
		for _, id := range ids {
			folder := game.JoinPath(inst.Staging, string(id))
			_ = s.FS.RemoveAll(ctx, folder+".installing")
			_ = s.FS.RemoveAll(ctx, folder)
		}
	}
	return nil
}

func filesOf(it *item, target game.TargetID) []mod.File {
	out := make([]mod.File, len(it.files))
	for i, f := range it.files {
		out[i] = mod.File{Source: f.Path, Dest: game.Location{Target: target, Path: f.Path}, Size: f.Size}
	}
	return out
}

func paths(it *item) []string {
	out := make([]string, len(it.files))
	for i, f := range it.files {
		out[i] = f.Path.String()
	}
	return out
}

func itoa(n int) string { return strconv.Itoa(n) }
