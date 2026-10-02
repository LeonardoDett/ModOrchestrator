// Package plugins is the application service of plugins and load order
// (core/08, F11): the calculated inventory with cached headers, the plugin
// state and load order of each profile, the adapter constraints, the native
// sort (D029, D041: no LOOT in V1), rules, groups and index locks, the
// serialization of the game's load order file with evidence and triage of
// external changes (D040), and the plugin diagnostics.
//
// Every Bethesda fact comes from the adapter (ports.PluginSupport,
// ports.LoadOrderSupport); the core knows names, headers as data, edges and
// locks (anti-pattern 3). The load order is never mixed with the mod order
// (D006, INV-ORD-06).
package plugins

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"strconv"
	"sync"

	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/instancelock"
	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
)

// Event types (core/08 §10).
const (
	EventInventoryChanged event.Type = "plugins.inventory_changed"
	EventPluginEnabled    event.Type = "plugin.enabled"
	EventPluginDisabled   event.Type = "plugin.disabled"
	EventOrderChanged     event.Type = "loadorder.changed"
	EventSorted           event.Type = "loadorder.sorted"
	EventApplied          event.Type = "loadorder.applied"
	EventImported         event.Type = "loadorder.imported"
	EventLocked           event.Type = "loadorder.locked"
	EventExternalChange   event.Type = "loadorder.external_change_detected"
	EventRuleCreated      event.Type = "plugin_rule.created"
	EventRuleRemoved      event.Type = "plugin_rule.removed"
	EventGroupCreated     event.Type = "plugin_group.created"
	EventGroupUpdated     event.Type = "plugin_group.updated"
	EventGroupDeleted     event.Type = "plugin_group.deleted"
	EventGroupAssigned    event.Type = "plugin_group.assigned"

	// KindApplyLoadOrder is the short operation that writes the load order
	// file when only the load order changed (core/08 §7).
	KindApplyLoadOrder operation.Kind = "apply_load_order"
	StepCheck                         = "check"
	StepWrite                         = "write"

	subjectInstance = "instance"
	subjectProfile  = "profile"
	holderPlugins   = "plugins"
	holderApply     = "apply_load_order"
)

// Error codes (core/08 §10 and D088).
const (
	CodePluginNotFound      = "plugin_not_found"
	CodeRuleCycle           = "rule_would_create_cycle"
	CodeOrderViolates       = "order_violates_constraints"
	CodeIndexLockConflict   = "index_lock_conflict"
	CodeFileLocked          = "load_order_file_locked"
	CodeNoPlugins           = "plugins_unsupported"
	CodeInstanceNotFound    = "instance_not_found"
	CodeImplicitPlugin      = "plugin_implicit"
	CodeRuleDuplicate       = "rule_duplicate"
	CodeRuleSelf            = "plugin_rule_self_reference"
	CodeRuleNotFound        = "rule_not_found"
	CodeRuleNotRemovable    = "rule_not_removable"
	CodeGroupInvalid        = "plugin_group_invalid"
	CodeGroupNotFound       = "plugin_group_not_found"
	CodeGroupExists         = "plugin_group_exists"
	CodeSortBlocked         = "plugin_rule_cycle"
	CodeExternalChange      = "load_order_external_change"
	CodeNoExternalChange    = "load_order_no_external_change"
	CodeNothingToUndo       = "loadorder_nothing_to_undo"
	CodeNothingToRestore    = "loadorder_nothing_to_restore"
	CodeManualOrderDisabled = "loadorder_manual_disabled"
	CodeImportEmpty         = "loadorder_import_empty"
	CodeIOError             = "io_error"
)

// Error is a failure with a stable code and parameters (D044, D053).
type Error struct {
	code   string
	params map[string]string
	cause  error
}

func (e *Error) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("plugins: %s: %v", e.code, e.cause)
	}
	return "plugins: " + e.code
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

// opError turns a coded error into an operation error.
func opError(err error) error {
	var e *Error
	if errors.As(err, &e) {
		return &operation.Error{Code: e.code, Message: e.Error(), Params: e.params}
	}
	return err
}

// Settings is what the service reads and writes in the settings service.
type Settings interface {
	AppValue(ctx context.Context, key string) (appsettings.Effective, error)
	InstanceValue(ctx context.Context, instance, key string) (appsettings.Effective, error)
	SetInstance(ctx context.Context, instance, key, value string) error
}

// Deps are the ports the service needs.
type Deps struct {
	Registry      *games.Registry
	Instances     ports.GameInstances
	Mods          ports.Mods
	Installations ports.Installations
	Profiles      ports.Profiles
	Rules         ports.Rules
	Overrides     ports.Overrides
	PluginRules   ports.PluginRules
	Manifests     ports.Manifests
	State         ports.AppState
	UoW           ports.UnitOfWork
	Publisher     operations.Publisher
	FS            ports.FileSystem
	Hasher        ports.Hasher
	Folders       ports.KnownFolders
	Cache         ports.HeaderCache
	Settings      Settings
	Ops           *operations.Service
	Locks         *instancelock.Locks
	IDs           operations.IDGenerator
	Clock         operations.Clock
}

// Service implements the plugin and load order use cases.
type Service struct {
	Deps

	mu sync.Mutex
	// installations caches immutable installations by id.
	installations map[mod.InstallationID]*mod.Installation
	// seen is the last observation of each load order file (monitor).
	seen map[game.InstanceID]fileSeen
	bg   *background
}

// NewService wires the service.
func NewService(d Deps) *Service {
	if d.Locks == nil {
		d.Locks = instancelock.New()
	}
	s := &Service{Deps: d, installations: map[mod.InstallationID]*mod.Installation{}, seen: map[game.InstanceID]fileSeen{}}
	s.bg = newBackground(s)
	return s
}

// commit runs fn in one transaction and publishes the events after the
// commit (INV-OPS-01). Inside fn only tx repositories may be used.
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

func (s *Service) boolSetting(ctx context.Context, instance game.InstanceID, key string, def bool) bool {
	v, err := s.Settings.InstanceValue(ctx, string(instance), key)
	if err != nil {
		return def
	}
	b, err := strconv.ParseBool(v.Value)
	if err != nil {
		return def
	}
	return b
}

func (s *Service) intSetting(ctx context.Context, key string, def int) int {
	v, err := s.Settings.AppValue(ctx, key)
	if err != nil {
		return def
	}
	n, err := strconv.Atoi(v.Value)
	if err != nil {
		return def
	}
	return n
}

// installation reads an installation through the cache (installations are
// immutable once saved).
func (s *Service) installation(ctx context.Context, id mod.InstallationID) (*mod.Installation, error) {
	s.mu.Lock()
	inst, ok := s.installations[id]
	s.mu.Unlock()
	if ok {
		return inst, nil
	}
	inst, err := s.Installations.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.installations[id] = inst
	s.mu.Unlock()
	return inst, nil
}

// Close stops the background work (monitor and coalesced sync).
func (s *Service) Close() { s.bg.close() }

// Wait blocks until the background work in flight finished (tests).
func (s *Service) Wait() { s.bg.wait() }
