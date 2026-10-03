// Package deployment is the deploy engine (core/04): it makes the targets of
// a game instance reflect the desired state of the active profile by diff
// between desired, applied and observed states (D033), through a journal
// written before any filesystem change (INV-DEP-03, D035), and records in
// the manifest only what it observed to be done (INV-DEP-05). It is the only
// writer to game targets (anti-pattern 24).
//
// Nothing here deletes or overwrites a file the manifest does not prove to
// be the manager's (INV-DEP-01/02): unmanaged originals go to the
// BackupStore (D034), and any divergence between applied and observed is an
// external change that leaves its location untouched (INV-EXT-01). The full
// triage of external changes is F8.
package deployment

import (
	"context"
	"errors"
	"sync"
	"time"

	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/instancelock"
	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/relpath"
)

// Operation kinds and their steps (core/04 §5–6, §10).
const (
	KindDeploy       operation.Kind = "deploy"
	KindPurge        operation.Kind = "purge"
	KindMoveStaging  operation.Kind = "move_staging"

	// KindMoveArchives moves the ArchiveStore (core/13).

	KindMoveArchives operation.Kind = "move_archives"
	KindChangeMethod operation.Kind = "change_method"

	StepReconcile     = "reconcile"
	StepPreflight     = "preflight"
	StepScan          = "scan"
	StepPlan          = "plan"
	StepAwaitDecision = "await_decision"
	StepJournal       = "journal"
	StepApply         = "apply"
	StepVerify        = "verify"
	StepCommit        = "commit"
	StepPost          = "post"

	StepValidate = "validate"
	StepPurge    = "purge"
	StepCopy     = "copy"
	StepSave     = "save"
	StepCleanup  = "cleanup"
	StepDeploy   = "deploy"
)

var pipelineSteps = []string{StepReconcile, StepPreflight, StepScan, StepPlan, StepAwaitDecision, StepJournal, StepApply, StepVerify, StepCommit, StepPost}

// Event types (core/04 §13).
const (
	EventPlanned         event.Type = "deployment.planned"
	EventApplied         event.Type = "deployment.applied"
	EventFailed          event.Type = "deployment.failed"
	EventPurged          event.Type = "deployment.purged"
	EventStatusChanged   event.Type = "deployment.status_changed"
	EventExternalChanges event.Type = "deployment.external_changes_detected"
	EventStagingMoved    event.Type = "staging.moved"

	EventArchivesMoved   event.Type = "archives.moved"
	EventMethodChanged   event.Type = "deployment.method_changed"

	subjectInstance = "instance"
	holderDeploy    = "deploy"
	holderPurge     = "purge"
	holderMove      = "move_staging"
	holderMoveArchives = "move_archives"
	holderMethod    = "change_method"
)

// Settings is what the engine reads from the settings service.
type Settings interface {
	AppValue(ctx context.Context, key string) (appsettings.Effective, error)
	InstanceValue(ctx context.Context, instance, key string) (appsettings.Effective, error)
}

// Foreign reports deployments by other managers in the game folders
// (games.Service.CheckForeign, D059); a finding blocks the deploy
// (INV-DEP-08).
type Foreign interface {
	CheckForeign(ctx context.Context, inst game.Instance) ([]games.Finding, error)
	// RunningProcesses lists the game processes running now (game_running
	// blocks deploy and purge, core/11 §6).
	RunningProcesses(ctx context.Context, inst game.Instance) ([]string, error)
}

// LoadOrder writes the game's load order file in the post step of a
// deploy (core/04 §5 step 9, core/08 §7); nil for no plugin support.
type LoadOrder interface {
	AfterDeploy(ctx context.Context, instance game.InstanceID, op operation.ID) error
}

// Deps are the ports the engine needs.
type Deps struct {
	Registry      *games.Registry
	Instances     ports.GameInstances
	Mods          ports.Mods
	Installations ports.Installations
	Profiles      ports.Profiles
	Rules         ports.Rules
	Overrides     ports.Overrides
	Manifests     ports.Manifests
	Journals      ports.Journals
	State         ports.AppState
	UoW           ports.UnitOfWork
	Publisher     operations.Publisher
	FS            ports.FileSystem
	Settings      Settings
	Foreign       Foreign
	// Triage of external changes (F8, core/09).
	Archives   ports.Archives
	Decisions  ports.ExternalDecisions
	Hasher     ports.Hasher
	Library    Library
	Exclusions Exclusions
	Ops        *operations.Service
	LoadOrder  LoadOrder
	Locks      *instancelock.Locks
	IDs        operations.IDGenerator
	Clock      operations.Clock
}

// Service implements the deploy use cases.
type Service struct {
	Deps

	mu sync.Mutex
	// decisions are deploys waiting at await_decision, by instance.
	decisions map[game.InstanceID]*waiting
	// needsDecision marks instances whose auto-deploy stopped before a
	// decision (status blocked until a plan without decisions runs).
	needsDecision map[game.InstanceID]bool
	// changes is the number of external changes to managed files the last
	// scan saw; newFiles the number of generated files.
	changes  map[game.InstanceID]int
	newFiles map[game.InstanceID]int
	// found is the latest scan outside a deploy (focus, verify).
	found map[game.InstanceID]*found
	// failures are the locations the last deploy/purge could not apply.
	failures map[game.InstanceID][]Failure
	// lastStatus is what the status query returned last, to emit
	// deployment.status_changed only on change.
	lastStatus map[game.InstanceID]string
	// installations caches immutable installations by id.
	installations map[mod.InstallationID]*mod.Installation
	// symlinkProbe caches whether symlinks can be created, by staging.
	symlinkProbe map[string]probeResult
	// cancelFns cancel the running deploy/purge of an instance.
	cancelFns map[game.InstanceID]context.CancelFunc

	running sync.WaitGroup
	// afterAction is a test hook called after each applied action.
	afterAction func(i int)
}

type probeResult struct {
	ok bool
	at time.Time
}

// NewService wires the engine.
func NewService(d Deps) *Service {
	return &Service{
		Deps: d, decisions: map[game.InstanceID]*waiting{}, needsDecision: map[game.InstanceID]bool{},
		changes: map[game.InstanceID]int{}, newFiles: map[game.InstanceID]int{}, found: map[game.InstanceID]*found{}, failures: map[game.InstanceID][]Failure{}, lastStatus: map[game.InstanceID]string{},
		installations: map[mod.InstallationID]*mod.Installation{}, symlinkProbe: map[string]probeResult{},
		cancelFns: map[game.InstanceID]context.CancelFunc{},
	}
}

// Wait blocks until every background operation of the engine finished.
func (s *Service) Wait() { s.running.Wait() }

// Failure is one location an operation could not apply.
type Failure struct {
	Location game.Location
	Action   deployment.ActionKind
	Code     string
	Detail   string
}

// commit runs fn in one transaction and publishes the events after the
// commit (INV-OPS-01).
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

func (s *Service) newEvent(t event.Type, instance game.InstanceID, op operation.ID, payload map[string]string) event.Event {
	return event.Event{ID: s.IDs.NewID(), Type: t, OccurredAt: s.Clock.Now(), OperationID: string(op), Subject: event.EntityRef{Kind: subjectInstance, ID: string(instance)}, Payload: payload}
}

func (s *Service) instance(ctx context.Context, id game.InstanceID) (game.Instance, error) {
	inst, err := s.Instances.Get(ctx, id)
	if errors.Is(err, ports.ErrNotFound) {
		return game.Instance{}, fail(CodeInstanceNotFound, err, "instance", string(id))
	}
	return inst, err
}

func (s *Service) definition(inst game.Instance) (game.Definition, error) {
	adapter, ok := s.Registry.ByName(inst.Adapter)
	if !ok {
		return game.Definition{}, fail("game_unknown", nil, "game", string(inst.Game))
	}
	return adapter.InstanceDefinition(inst.Game, inst.Targets)
}

func (s *Service) boolSetting(ctx context.Context, instance game.InstanceID, key string, def bool) bool {
	v, err := s.Settings.InstanceValue(ctx, string(instance), key)
	if err != nil {
		return def
	}
	return v.Value == "true"
}

// targetPath is where a location lives on disk ("" for unknown targets).
func targetPath(inst game.Instance, loc game.Location) string {
	for _, t := range inst.Targets {
		if t.ID == loc.Target {
			return game.JoinPath(t.Path, loc.Path.String())
		}
	}
	return ""
}

// sourcePath is where the staged file of a link entry lives.
func sourcePath(inst game.Instance, e deployment.Entry) string {
	return game.JoinPath(game.JoinPath(inst.Staging, string(e.Mod)), e.Source.String())
}

func backupFile(inst game.Instance, p relpath.Path) string {
	return game.JoinPath(inst.BackupStore, p.String())
}

// tempPath is the deterministic temporary name of a replacement, so that
// recovery can find and remove it (D078).
func tempPath(path string) string { return path + ".modorchestrator-tmp" }
