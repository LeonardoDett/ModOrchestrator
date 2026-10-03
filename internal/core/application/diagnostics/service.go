// Package diagnostics is the application service of core/10: it gathers the
// health checks of every module into one set of diagnostics per instance,
// applies suppressions, executes the suggested actions, records when each
// problem appeared and delivers notifications. Diagnostics are recalculated
// on every read and never stored as truth (anti-pattern 13); what is
// persisted is delivery state only (suppressions, presence,
// notifications). Diagnostic ≠ notification ≠ history ≠ log.
package diagnostics

import (
	"context"
	"errors"
	"slices"
	"strings"
	"sync"
	"time"

	"modorchestrator/internal/core/application/backups"
	"modorchestrator/internal/core/application/deployment"
	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/library"
	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/core/domain/rules"
)

// Event types of this module. They signal the UI to read again and are
// left out of the history (they are delivery, not actions).
const (
	EventChanged             = "diagnostics.changed"
	EventNotificationCreated = "notification.created"
	EventSuppressed          = "diagnostics.suppressed"
	EventUnsuppressed        = "diagnostics.unsuppressed"
)

// Settings is what the service reads from the settings service.
type Settings interface {
	AppValue(ctx context.Context, key string) (appsettings.Effective, error)
}

// Conflicts derives the conflict checks (override_stale...).
type Conflicts interface {
	Diagnostics(ctx context.Context, instance game.InstanceID) ([]diagnostic.Diagnostic, error)
	ClearFileOverrides(ctx context.Context, instance game.InstanceID, locs []game.Location) error
}

// Deploy is the deploy engine as the checks and actions see it.
type Deploy interface {
	Status(ctx context.Context, instance game.InstanceID) (deployment.StatusView, error)
	Methods(ctx context.Context, instance game.InstanceID) ([]deployment.MethodStatus, error)
	Deploy(ctx context.Context, instance game.InstanceID) (operation.ID, error)
	Reconcile(ctx context.Context, instance game.InstanceID) (operation.ID, error)
	ScanOnFocus(ctx context.Context, instance game.InstanceID) error
}

// Games answers the game checks.
type Games interface {
	Details(ctx context.Context, id game.InstanceID) (games.Managed, error)
	VersionCheck(ctx context.Context, inst game.Instance) (current, seen string, err error)
	AcknowledgeVersion(ctx context.Context, id game.InstanceID) error
	RunningProcesses(ctx context.Context, inst game.Instance) ([]string, error)
}

// Library answers the library checks.
type Library interface {
	CheckStaging(ctx context.Context, instance game.InstanceID, deep bool) ([]library.StagingCheck, error)
	AcceptStaging(ctx context.Context, instance game.InstanceID, id mod.ID) error
	ArchiveMissing(ctx context.Context, instance game.InstanceID) ([]*mod.Mod, error)
	InstallMods(ctx context.Context, instance game.InstanceID, ids []mod.ID) ([]operation.ID, error)
	ReinstallMods(ctx context.Context, instance game.InstanceID, ids []mod.ID) ([]operation.ID, error)
}

// Profiles executes the rule and selection actions.
type Profiles interface {
	SetModsEnabled(ctx context.Context, instance game.InstanceID, ids []mod.ID, enabled bool) error
	RemoveRule(ctx context.Context, instance game.InstanceID, id rules.ID) error
	SetRuleDisabled(ctx context.Context, instance game.InstanceID, id rules.ID, disabled bool) error
}

// Plugins derives the plugin checks (core/08 §8) and runs their actions.
type Plugins interface {
	Diagnostics(ctx context.Context, instance game.InstanceID) ([]diagnostic.Diagnostic, error)
	SetPluginsEnabled(ctx context.Context, instance game.InstanceID, names []plugin.Name, enabled bool) error
	RemovePluginRule(ctx context.Context, instance game.InstanceID, id plugin.RuleID) error
	// Export is the load order as text for the support bundle.
	Export(ctx context.Context, instance game.InstanceID) (string, error)
}

// Backups reports the last failed database backup (backup_failed).
type Backups interface {
	LastFailure(ctx context.Context) *backups.Failure
}

// Deps are the ports the service needs.
type Deps struct {
	Registry     *games.Registry
	Instances    ports.GameInstances
	Profiles     ports.Profiles
	Mods         ports.Mods
	Rules        ports.Rules
	Suppressions ports.Suppressions
	Presence     ports.Presence
	Notifs       ports.Notifications
	State        ports.AppState
	UoW          ports.UnitOfWork
	Publisher    operations.Publisher
	FS           ports.FileSystem
	Settings     Settings
	Conflicts    Conflicts
	Deploy       Deploy
	Games        Games
	Library      Library
	Commands     Profiles
	Plugins      Plugins
	// Backups is optional (nil: backup_failed never appears).
	Backups Backups
	IDs     operations.IDGenerator
	Clock        operations.Clock
}

// Service implements the diagnostics use cases.
type Service struct {
	Deps

	mu sync.Mutex
	// deep keeps the last file-by-file staging verification per
	// installation; a new installation is checked again only on demand.
	deep map[mod.InstallationID]library.StagingCheck
	// refreshing serializes Refresh per instance.
	refreshing sync.Mutex
	watch      *watcher
}

// NewService wires the service.
func NewService(d Deps) *Service {
	s := &Service{Deps: d, deep: map[mod.InstallationID]library.StagingCheck{}}
	s.watch = newWatcher(s)
	return s
}

// Item is a diagnostic as the Diagnostics screen shows it.
type Item struct {
	diagnostic.Diagnostic
	Instance   game.InstanceID
	Module     diagnostic.Module
	FirstSeen  time.Time
	New        bool
	Suppressed bool
}

// Counts summarises the visible diagnostics by severity. Blocking counts
// errors that block an operation; Errors the other errors.
type Counts struct {
	Blocking, Errors, Warnings, Infos int
}

// View is the Problems tab of an instance.
type View struct {
	Instance   game.InstanceID
	Items      []Item
	Suppressed []Item
	Counts     Counts
	// Partial is true when a group of checks could not run (its facts
	// were unreadable); the rest is still shown.
	Partial bool
}

// Evaluate runs every health check of an instance (core/10 §1.1) and returns the diagnostics before
// suppression. A group whose facts cannot be read is skipped and reported
// through partial; the other groups still run.
func (s *Service) Evaluate(ctx context.Context, instance game.InstanceID) (out []diagnostic.Diagnostic, partial bool, err error) {
	inst, err := s.Instances.Get(ctx, instance)
	if err != nil {
		return nil, false, err
	}
	groups := []func(context.Context, game.Instance) ([]diagnostic.Diagnostic, error){
		s.gameChecks, s.deployChecks, s.ruleChecks, s.libraryChecks, s.appChecks, s.adapterChecks,
		func(ctx context.Context, inst game.Instance) ([]diagnostic.Diagnostic, error) {
			return s.Conflicts.Diagnostics(ctx, inst.ID)
		},
		func(ctx context.Context, inst game.Instance) ([]diagnostic.Diagnostic, error) {
			if s.Plugins == nil {
				return nil, nil
			}
			return s.Plugins.Diagnostics(ctx, inst.ID)
		},
	}
	gameMissing := false
	for i, g := range groups {
		if gameMissing && i > 0 {
			break // without the game folder only game_not_found is meaningful
		}
		ds, err := g(ctx, inst)
		if errors.Is(err, context.Canceled) {
			return nil, false, err
		}
		if err != nil {
			partial = true
			continue
		}
		for _, d := range ds {
			if d.Code == diagnostic.CodeGameNotFound {
				gameMissing = true
			}
		}
		out = append(out, ds...)
	}
	sortDiagnostics(out)
	return out, partial, nil
}

// Problems builds the Problems tab: visible diagnostics, the suppressed
// ones apart, counts and what is new since the last visit.
func (s *Service) Problems(ctx context.Context, instance game.InstanceID) (View, error) {
	ds, partial, err := s.Evaluate(ctx, instance)
	if err != nil {
		return View{}, err
	}
	sups, err := s.Suppressions.List(ctx)
	if err != nil {
		return View{}, err
	}
	present, err := s.Presence.List(ctx, instance)
	if err != nil {
		return View{}, err
	}
	first := map[diagnostic.Key]time.Time{}
	for _, p := range present {
		first[p.Key] = p.FirstSeen
	}
	visited := s.visited(ctx, instance)
	v := View{Instance: instance, Partial: partial}
	visible := diagnostic.Visible(ds, sups)
	shown := map[diagnostic.Key]bool{}
	for _, d := range visible {
		shown[d.Key] = true
	}
	for _, d := range ds {
		it := Item{Diagnostic: d, Instance: instance, Module: diagnostic.ModuleOf(d.Code)}
		if t, ok := first[d.Key]; ok {
			it.FirstSeen = t
			it.New = !visited.IsZero() && t.After(visited)
		} else {
			it.FirstSeen, it.New = s.Clock.Now(), !visited.IsZero()
		}
		if !shown[d.Key] {
			it.Suppressed = true
			v.Suppressed = append(v.Suppressed, it)
			continue
		}
		v.Items = append(v.Items, it)
		v.Counts.add(d)
	}
	return v, nil
}

func (c *Counts) add(d diagnostic.Diagnostic) {
	switch {
	case d.IsBlocking():
		c.Blocking++
	case d.Severity == diagnostic.SeverityError:
		c.Errors++
	case d.Severity == diagnostic.SeverityWarning:
		c.Warnings++
	default:
		c.Infos++
	}
}

// Attention lists, for every managed instance, the visible blocking, error
// and warning diagnostics ("Precisa de atenção", ui/telas/dashboard.md).
func (s *Service) Attention(ctx context.Context) ([]View, error) {
	list, err := s.Instances.List(ctx)
	if err != nil {
		return nil, err
	}
	var out []View
	for _, inst := range list {
		v, err := s.Problems(ctx, inst.ID)
		if err != nil {
			return nil, err
		}
		v.Items = slices.DeleteFunc(v.Items, func(it Item) bool { return it.Severity == diagnostic.SeverityInfo })
		v.Suppressed = nil
		out = append(out, v)
	}
	return out, nil
}

// Blocking returns the visible diagnostics of an instance that prevent
// kind (preflight of an operation, core/10 §1).
func (s *Service) Blocking(ctx context.Context, instance game.InstanceID, kind operation.Kind) ([]diagnostic.Diagnostic, error) {
	ds, _, err := s.Evaluate(ctx, instance)
	if err != nil {
		return nil, err
	}
	return diagnostic.Blocking(ds, kind), nil
}

// find returns the current diagnostic of an instance with key.
func (s *Service) find(ctx context.Context, instance game.InstanceID, key diagnostic.Key) (diagnostic.Diagnostic, error) {
	ds, _, err := s.Evaluate(ctx, instance)
	if err != nil {
		return diagnostic.Diagnostic{}, err
	}
	i := slices.IndexFunc(ds, func(d diagnostic.Diagnostic) bool { return d.Key == key })
	if i < 0 {
		return diagnostic.Diagnostic{}, fail(CodeNotFound, nil, "key", string(key))
	}
	return ds[i], nil
}

// sortDiagnostics orders by severity (blocking first), then code and key,
// so the list is stable between reads.
func sortDiagnostics(ds []diagnostic.Diagnostic) {
	rank := func(d diagnostic.Diagnostic) int {
		switch {
		case d.IsBlocking():
			return 0
		case d.Severity == diagnostic.SeverityError:
			return 1
		case d.Severity == diagnostic.SeverityWarning:
			return 2
		}
		return 3
	}
	slices.SortStableFunc(ds, func(a, b diagnostic.Diagnostic) int {
		if r := rank(a) - rank(b); r != 0 {
			return r
		}
		if c := strings.Compare(string(a.Code), string(b.Code)); c != 0 {
			return c
		}
		return strings.Compare(string(a.Key), string(b.Key))
	})
}

const stateVisited = "diagnostics.visited."

// MarkVisited records that the user saw the Problems tab of an instance
// now: later diagnostics are "new" (ui/telas/diagnostics.md §2).
func (s *Service) MarkVisited(ctx context.Context, instance game.InstanceID) error {
	return s.State.Set(ctx, stateVisited+string(instance), s.Clock.Now().Format(time.RFC3339Nano))
}

func (s *Service) visited(ctx context.Context, instance game.InstanceID) time.Time {
	v, err := s.State.Get(ctx, stateVisited+string(instance))
	if err != nil {
		return time.Time{}
	}
	t, _ := time.Parse(time.RFC3339Nano, v)
	return t
}
