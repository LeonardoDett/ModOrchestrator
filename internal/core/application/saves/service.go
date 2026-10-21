// Package saves is the save_games feature module (core/07 §7, D142): it
// keeps the saves of each profile in a folder of its own, by pointing the
// game at that folder in the post step of every deploy, and it lists,
// reads, copies, moves and deletes saves.
//
// The module enters the core through contribution points (D133): it is a
// deployment.PostDeploy, a diagnostics.Module and a profiles.Copier. The
// core never names it. What a save folder is, which settings key moves it
// and how a save file is read are the adapter's (ports.SaveGamesSupport); a
// game without the capability gets nothing from this module.
package saves

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"sync"

	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/instancelock"
	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/savegame"
)

// Owner is the id of the module in the records of game settings it writes.
const Owner = "saves"

// Error codes (core/00 §6, INV-OPS-05).
const (
	CodeUnsupported      = "saves_unsupported"
	CodeInstanceNotFound = "instance_not_found"
	CodeProfileNotFound  = "profile_not_found"
	CodeExternalChange   = "save_path_external_change"
	CodeFileLocked       = "save_file_locked"
	CodeIOError          = "save_io_error"
	CodeNotFound         = "save_not_found"
	CodeSameFolder       = "save_same_folder"
	CodeNothingSelected  = "save_nothing_selected"
)

// Events.
const (
	EventPathApplied       event.Type = "saves.path_applied"
	EventLocalSavesChanged event.Type = "profile.local_saves_changed"
	EventCopied            event.Type = "saves.copied"
	EventMoved             event.Type = "saves.moved"
	EventDeleted           event.Type = "saves.deleted"
)

const (
	subjectInstance = "instance"
	subjectProfile  = "profile"
	holder          = "saves"
)

// Error is a coded error of the module.
type Error struct {
	code   string
	cause  error
	params map[string]string
}

func (e *Error) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("saves: %s: %v", e.code, e.cause)
	}
	return "saves: " + e.code
}

func (e *Error) Unwrap() error             { return e.cause }
func (e *Error) Code() string              { return e.code }
func (e *Error) Params() map[string]string { return maps.Clone(e.params) }

func fail(code string, cause error, kv ...string) *Error {
	e := &Error{code: code, cause: cause, params: map[string]string{}}
	for i := 0; i+1 < len(kv); i += 2 {
		e.params[kv[i]] = kv[i+1]
	}
	return e
}

// Plugins is what the module asks the plugins module about the plugins a
// save uses. A game without plugins answers nil.
type Plugins interface {
	// Presence tells, for each plugin name (by its key in lower case),
	// whether the active profile has it active, whether the game folder
	// will have it at all, and which installed mods provide its file.
	Presence(ctx context.Context, instance game.InstanceID, names []string) (map[string]PluginPresence, error)
	// Enable activates plugins of the active profile after the mods that
	// provide them were enabled.
	Enable(ctx context.Context, instance game.InstanceID, names []string) error
}

// PluginPresence is the state of one plugin a save uses.
type PluginPresence struct {
	Present bool
	Active  bool
	Mods    []mod.ID
}

// ModSwitch enables mods in the active profile (the profiles service).
type ModSwitch interface {
	SetModsEnabled(ctx context.Context, instance game.InstanceID, ids []mod.ID, enabled bool) error
}

// Deps are the ports the module needs.
type Deps struct {
	Registry     *games.Registry
	Instances    ports.GameInstances
	Profiles     ports.Profiles
	Mods         ports.Mods
	Manifests    ports.Manifests
	GameSettings ports.GameSettings
	UoW          ports.UnitOfWork
	Publisher    operations.Publisher
	FS           ports.FileSystem
	Folders      ports.KnownFolders
	Plugins      Plugins
	ModSwitch    ModSwitch
	Locks        *instancelock.Locks
	IDs          operations.IDGenerator
	Clock        operations.Clock
}

// Service implements the save use cases.
type Service struct {
	Deps

	mu sync.Mutex
	// headers keeps the headers read, by path, while size and time match
	// (a save never changes once written; a new one has a new time).
	headers map[string]cachedHeader
}

type cachedHeader struct {
	size   int64
	mod    int64
	header savegame.Header
	err    error
}

// NewService wires the service.
func NewService(d Deps) *Service {
	if d.Locks == nil {
		d.Locks = instancelock.New()
	}
	return &Service{Deps: d, headers: map[string]cachedHeader{}}
}

// support is the instance with its save contract, when the feature is in
// effect for it (D115).
type support struct {
	inst     game.Instance
	sg       ports.SaveGamesSupport
	redirect savegame.Redirect
}

func (s *Service) support(ctx context.Context, instance game.InstanceID) (*support, error) {
	inst, err := s.Instances.Get(ctx, instance)
	if errors.Is(err, ports.ErrNotFound) {
		return nil, fail(CodeInstanceNotFound, err, "instance", string(instance))
	}
	if err != nil {
		return nil, err
	}
	adapter, ok := s.Registry.ByName(inst.Adapter)
	if !ok {
		return nil, fail(CodeUnsupported, nil, "game", string(inst.Game))
	}
	def, err := ports.InstanceDefinition(adapter, inst)
	if err != nil {
		return nil, err
	}
	sg, ok := adapter.(ports.SaveGamesSupport)
	if !ok || !def.Capabilities.Has(game.CapSaveGames) {
		return nil, fail(CodeUnsupported, nil, "game", string(inst.Game))
	}
	r := sg.SaveRedirect(inst)
	if !r.Valid() {
		return nil, fail(CodeUnsupported, nil, "game", string(inst.Game))
	}
	return &support{inst: inst, sg: sg, redirect: r}, nil
}

// Supported reports whether the feature is in effect for an instance.
func (s *Service) Supported(ctx context.Context, instance game.InstanceID) bool {
	_, err := s.support(ctx, instance)
	return err == nil
}

func unsupported(err error) bool {
	var e *Error
	return errors.As(err, &e) && e.code == CodeUnsupported
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

func (s *Service) newEvent(t event.Type, kind, id string, payload map[string]string) event.Event {
	if payload == nil {
		payload = map[string]string{}
	}
	return event.Event{ID: s.IDs.NewID(), Type: t, OccurredAt: s.Clock.Now(), Subject: event.EntityRef{Kind: kind, ID: id}, Payload: payload}
}

// opError turns a coded error into an operation error.
func opError(err error) error {
	var e *Error
	if errors.As(err, &e) {
		return &operation.Error{Code: e.code, Message: e.Error(), Params: e.params}
	}
	return err
}

func fileError(err error, p string) error {
	if errors.Is(err, ports.ErrFileLocked) || errors.Is(err, ports.ErrPermission) {
		return fail(CodeFileLocked, err, "path", p)
	}
	return fail(CodeIOError, err, "path", p)
}
