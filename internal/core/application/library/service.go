// Package library is the application service of the mod library (core/02,
// core/03): the import queue and pipeline, reinstall, remove, attributes,
// categories and the Mods screen queries. It decides by adapter contract and
// capability, never by game identity (D011). Every filesystem write goes to
// folders the instance owns (staging, archive store); the game folder is
// never touched here (that is the deploy engine, F7).
package library

import (
	"context"
	"errors"
	"sync"

	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/instancelock"
	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/installer"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
)

// Operation kinds and their steps (core/02 §3, D064).
const (
	KindImport    operation.Kind = "import"
	KindInstall   operation.Kind = "install"
	KindReinstall operation.Kind = "reinstall"
	KindRemove    operation.Kind = "remove"
	KindSetType   operation.Kind = "set_mod_type"

	StepValidate        = "validate"
	StepHash            = "hash"
	StepDedupe          = "dedupe"
	StepRetain          = "retain"
	StepInspect         = "inspect"
	StepSelectInstaller = "select_installer"
	StepExtract         = "extract"
	StepPlanInstall     = "plan_install"
	StepStage           = "stage"
	StepCommit          = "commit"
	StepPost            = "post"
	StepCleanup         = "cleanup"
)

var importSteps = []string{
	StepValidate, StepHash, StepDedupe, StepRetain, StepInspect, StepSelectInstaller,
	StepExtract, StepPlanInstall, StepStage, StepCommit, StepPost,
}

// Event types of the library (core/02 §12).
const (
	EventModImported       event.Type = "mod.imported"
	EventModInstalled      event.Type = "mod.installed"
	EventModReinstalled    event.Type = "mod.reinstalled"
	EventModInstallAborted event.Type = "mod.install_aborted"
	EventModRemoved        event.Type = "mod.removed"
	EventModAttributes     event.Type = "mod.attributes_changed"
	EventModCategory       event.Type = "mod.category_changed"
	EventModType           event.Type = "mod.type_changed"
	EventArchiveRetained   event.Type = "archive.retained"
	EventArchiveRemoved    event.Type = "archive.removed"
	EventCategoryChanged   event.Type = "category.changed"
	EventDecisionRequired  event.Type = "import.decision_required"
	subjectMod                        = "mod"
	subjectArchive                    = "archive"
	subjectInstance                   = "instance"
	holderQueue                       = "import"
	holderRemove                      = "remove"
	holderSetType                     = "set_mod_type"
)

// Settings is what the library reads from the settings service.
type Settings interface {
	AppValue(ctx context.Context, key string) (appsettings.Effective, error)
	InstanceValue(ctx context.Context, instance, key string) (appsettings.Effective, error)
}

// Deps are the ports the service needs.
type Deps struct {
	Registry      *games.Registry
	Instances     ports.GameInstances
	Mods          ports.Mods
	Archives      ports.Archives
	Installations ports.Installations
	Categories    ports.Categories
	Profiles      ports.Profiles
	Rules         ports.Rules
	State         ports.AppState
	Events        ports.EventLog
	UoW           ports.UnitOfWork
	Publisher     operations.Publisher
	FS            ports.FileSystem
	Extractor     ports.Extractor
	Hasher        ports.Hasher
	Settings      Settings
	Ops           *operations.Service
	Locks         *instancelock.Locks
	IDs           operations.IDGenerator
	Clock         operations.Clock
}

// Service implements the library use cases. There is deliberately no
// process launcher among its dependencies: importing never executes anything
// from an archive (INV-LIB-04).
type Service struct {
	Deps

	mu     sync.Mutex // guards queues
	queues map[game.InstanceID]*queue
	// writeMu serialises read-modify-write transactions on mods and profiles
	// between the queue worker and short commands.
	writeMu sync.Mutex
	// workers tracks running queue workers so tests can wait for them.
	workers sync.WaitGroup
}

// NewService wires the service.
func NewService(d Deps) *Service {
	if d.Locks == nil {
		d.Locks = instancelock.New()
	}
	return &Service{Deps: d, queues: map[game.InstanceID]*queue{}}
}

// Wait blocks until every queue is drained (tests and shutdown).
func (s *Service) Wait() { s.workers.Wait() }

// env is everything a use case needs about one instance.
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
	def, err := a.InstanceDefinition(inst.Game, inst.Targets)
	if err != nil {
		return env{}, fail(games.CodeGameUnknown, err, "game", string(inst.Game))
	}
	return env{inst: inst, adapter: a, def: def}, nil
}

// installContext is the installer context and stack of an instance: the
// adapter's own installers first, the basic installer last (core/03 §1).
func (e env) installContext() (installer.Context, []installer.Installer) {
	h := e.adapter.RootHints(e.inst.Game)
	ctx := installer.Context{Definition: e.def, Hints: installer.RootHints{Dirs: h.Dirs, Extensions: h.Extensions}}
	var stack []installer.Installer
	if p, ok := e.adapter.(ports.InstallerProvider); ok {
		stack = append(stack, p.Installers(e.inst.Game)...)
	}
	return ctx, append(stack, installer.Basic{})
}

// modFolder is the staging folder of a mod: derived from its ID, never from
// its name (INV-ID-03).
func (e env) modFolder(id mod.ID) string { return game.JoinPath(e.inst.Staging, string(id)) }

// tmpRoot holds the temporary folders of operations (core/02 §3 step 7).
func (e env) tmpRoot() string { return game.JoinPath(e.inst.Staging, ".tmp") }

func (e env) archivePath(a *mod.Archive) string {
	return game.JoinPath(e.inst.ArchiveStore, a.Stored.String())
}

// ownsStaging checks the staging marker names this instance (D058); the
// library never writes in a folder it cannot prove is its own.
func (s *Service) ownsFolder(ctx context.Context, path, marker string, id game.InstanceID) bool {
	r, err := s.FS.Open(ctx, game.JoinPath(path, marker))
	if err != nil {
		return false
	}
	defer r.Close()
	buf := make([]byte, 4096)
	n, _ := r.Read(buf)
	owner, err := game.ParseMarker(buf[:n])
	return err == nil && owner == id
}

// newEvent builds a domain event about subject; op links it to the
// operation that produced it.
func (s *Service) newEvent(t event.Type, kind, id string, op operation.ID, payload map[string]string) event.Event {
	if payload == nil {
		payload = map[string]string{}
	}
	return event.Event{
		ID: s.IDs.NewID(), Type: t, OccurredAt: s.Clock.Now(), OperationID: string(op),
		Subject: event.EntityRef{Kind: kind, ID: id}, Payload: payload,
	}
}

// commit runs fn in a unit of work and publishes its events after the
// commit (INV-OPS-01, anti-pattern 21).
func (s *Service) commit(ctx context.Context, fn func(ctx context.Context, tx ports.Tx) error) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	stored, err := s.UoW.Do(ctx, fn)
	if err != nil {
		return err
	}
	if len(stored) > 0 {
		s.Publisher.Publish(stored...)
	}
	return nil
}

// boolSetting reads a boolean setting, falling back to def when unreadable.
func (s *Service) boolSetting(ctx context.Context, instance game.InstanceID, key string, def bool) bool {
	var v appsettings.Effective
	var err error
	if instance != "" {
		v, err = s.Settings.InstanceValue(ctx, string(instance), key)
	} else {
		v, err = s.Settings.AppValue(ctx, key)
	}
	if err != nil {
		return def
	}
	return v.Value == "true"
}

func (s *Service) intSetting(ctx context.Context, key string, def int64) int64 {
	v, err := s.Settings.AppValue(ctx, key)
	if err != nil {
		return def
	}
	var n int64
	for _, c := range v.Value {
		if c < '0' || c > '9' {
			return def
		}
		n = n*10 + int64(c-'0')
	}
	return n
}

func (s *Service) stringSetting(ctx context.Context, key, def string) string {
	v, err := s.Settings.AppValue(ctx, key)
	if err != nil || v.Value == "" {
		return def
	}
	return v.Value
}

// notFound reports whether err is a missing entity.
func notFound(err error) bool { return errors.Is(err, ports.ErrNotFound) }
