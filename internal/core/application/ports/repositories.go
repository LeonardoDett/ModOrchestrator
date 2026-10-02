// Package ports declares the contracts the application layer needs and the
// infrastructure implements (core/00 §3). Only persisted state has a
// repository: desired state (instances, library, profiles, instance intent,
// settings), applied state (manifests, journal, applied load order) and
// delivery state (notifications, suppressions). Calculated state (conflicts,
// desired state, plans, deployment status, external changes, diagnostics,
// dependency results) has none on purpose: it is derived again from these
// sources of truth (docs-ia/03-fontes-de-verdade.md).
package ports

import (
	"context"
	"errors"
	"modorchestrator/internal/core/domain/externalchange"
	"time"

	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/notification"
	"modorchestrator/internal/core/domain/override"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/core/domain/profile"
	"modorchestrator/internal/core/domain/rules"
	"modorchestrator/internal/core/domain/settings"
)

// ErrNotFound is returned when the requested entity does not exist.
var ErrNotFound = errors.New("ports: not found")

// GameInstances persists managed game installations.
type GameInstances interface {
	Get(ctx context.Context, id game.InstanceID) (game.Instance, error)
	List(ctx context.Context) ([]game.Instance, error)
	Save(ctx context.Context, inst game.Instance) error
	Delete(ctx context.Context, id game.InstanceID) error
}

// Archives persists imported archives (D032).
type Archives interface {
	Get(ctx context.Context, id mod.ArchiveID) (*mod.Archive, error)
	ByHash(ctx context.Context, instance game.InstanceID, hash string) ([]*mod.Archive, error)
	Save(ctx context.Context, a *mod.Archive) error
	Delete(ctx context.Context, id mod.ArchiveID) error
}

// Mods persists the library of each instance.
type Mods interface {
	Get(ctx context.Context, id mod.ID) (*mod.Mod, error)
	ListByInstance(ctx context.Context, instance game.InstanceID) ([]*mod.Mod, error)
	Save(ctx context.Context, m *mod.Mod) error
}

// Installations persists installer results. Installations are immutable once
// saved; a reinstall saves a new one.
type Installations interface {
	Get(ctx context.Context, id mod.InstallationID) (*mod.Installation, error)
	// Summaries returns file count and size per installation of an
	// instance without loading file lists.
	Summaries(ctx context.Context, instance game.InstanceID) (map[mod.InstallationID]InstallationSummary, error)
	Save(ctx context.Context, inst *mod.Installation) error
	Delete(ctx context.Context, id mod.InstallationID) error
}

// Categories persists the category tree of an instance.
type Categories interface {
	List(ctx context.Context, instance game.InstanceID) ([]mod.Category, error)
	Replace(ctx context.Context, instance game.InstanceID, tree []mod.Category) error
}

// Profiles persists profiles, the active profile of each instance (the
// instance never stores it, to keep game below profile) and snapshots.
type Profiles interface {
	Get(ctx context.Context, id profile.ID) (*profile.Profile, error)
	ListByInstance(ctx context.Context, instance game.InstanceID) ([]*profile.Profile, error)
	Save(ctx context.Context, p *profile.Profile) error
	Delete(ctx context.Context, id profile.ID) error
	// Active returns ErrNotFound when the instance has no active profile,
	// which is itself an invariant violation (INV-ORD-01).
	Active(ctx context.Context, instance game.InstanceID) (profile.ID, error)
	SetActive(ctx context.Context, instance game.InstanceID, id profile.ID) error
	SaveSnapshot(ctx context.Context, s profile.Snapshot) error
	Snapshots(ctx context.Context, id profile.ID) ([]profile.Snapshot, error)
	DeleteSnapshot(ctx context.Context, id profile.SnapshotID) error
}

// Rules persists the mod rules of an instance (D026).
type Rules interface {
	Get(ctx context.Context, instance game.InstanceID) (*rules.Set, error)
	Save(ctx context.Context, s *rules.Set) error
}

// Overrides persists file overrides, exclusions and conflict reviews of an
// instance (D026).
type Overrides interface {
	Get(ctx context.Context, instance game.InstanceID) (*override.Set, error)
	Save(ctx context.Context, s *override.Set) error
}

// PluginRules persists plugin rules, groups and assignments of an instance.
type PluginRules interface {
	Get(ctx context.Context, instance game.InstanceID) (*plugin.Rules, error)
	Save(ctx context.Context, r *plugin.Rules) error
}

// Manifests persists applied state. Current and Header return ErrNotFound
// when the instance was never deployed.
type Manifests interface {
	Current(ctx context.Context, instance game.InstanceID) (*deployment.Manifest, error)
	// Header reads the manifest without its entries (status queries).
	Header(ctx context.Context, instance game.InstanceID) (deployment.Header, error)
	// Save stores m. prev is the manifest it replaces (nil when none): the
	// store may write only the entries that differ.
	Save(ctx context.Context, m, prev *deployment.Manifest) error
	CurrentLoadOrder(ctx context.Context, instance game.InstanceID) (*deployment.AppliedLoadOrder, error)
	SaveLoadOrder(ctx context.Context, lo *deployment.AppliedLoadOrder) error
}

// Journals persists the plan of a running deploy/purge (D035). It is written
// before any filesystem change (INV-DEP-03) and deleted in the same
// transaction that saves the new manifest.
type Journals interface {
	// Pending returns ErrNotFound when no deploy is in flight.
	Pending(ctx context.Context, instance game.InstanceID) (*deployment.Journal, error)
	Save(ctx context.Context, j *deployment.Journal) error
	// Mark records the progress of several actions at once (in batches,
	// core/04 §5).
	Mark(ctx context.Context, instance game.InstanceID, states map[int]deployment.ActionState) error
	Delete(ctx context.Context, instance game.InstanceID) error
	// Instances lists the instances with a journal (startup detection).
	Instances(ctx context.Context) ([]game.InstanceID, error)
}

// ExternalDecisions persists the decisions about external changes that
// outlive a scan: "leave unmanaged" (core/09 §4, D046).
type ExternalDecisions interface {
	Unmanaged(ctx context.Context, instance game.InstanceID) ([]externalchange.Unmanaged, error)
	SaveUnmanaged(ctx context.Context, ds ...externalchange.Unmanaged) error
}

// Notifications persists delivery state, keyed so it survives recomputation
// of the diagnostic it refers to.
type Notifications interface {
	Save(ctx context.Context, n *notification.Notification) error
	Get(ctx context.Context, id notification.ID) (*notification.Notification, error)
	// List returns the notifications that were not dismissed, newest first.
	List(ctx context.Context, limit int) ([]*notification.Notification, error)
	// ByRef returns the newest notification about ref (diagnostic key or
	// aggregation key), ErrNotFound when none.
	ByRef(ctx context.Context, ref string) (*notification.Notification, error)
}

// Suppressions persists hidden diagnostics.
type Suppressions interface {
	List(ctx context.Context) ([]diagnostic.Suppression, error)
	Save(ctx context.Context, s diagnostic.Suppression) error
	Delete(ctx context.Context, s diagnostic.Suppression) error
	DeleteAll(ctx context.Context) (int, error)
}

// Presence records which diagnostics of an instance existed at the last
// evaluation and since when. It is delivery state, not the diagnostics
// themselves (those are always recalculated): it lets a warning notify only
// when it appears (core/10 §2) and the Diagnostics screen mark what is new
// since the last visit.
type Presence interface {
	List(ctx context.Context, instance game.InstanceID) ([]diagnostic.Presence, error)
	Replace(ctx context.Context, instance game.InstanceID, present []diagnostic.Presence) error
}

// Settings persists setting values; absent values mean the catalog default.
type Settings interface {
	Get(ctx context.Context, scope settings.Scope, scopeID, key string) (settings.Value, error)
	List(ctx context.Context, scope settings.Scope, scopeID string) ([]settings.Value, error)
	Save(ctx context.Context, v settings.Value) error
	Reset(ctx context.Context, scope settings.Scope, scopeID, key string) error
}

// Tx is the set of repositories bound to one transaction, plus the events
// recorded with it (INV-OPS-01, D064).
type Tx interface {
	Mods() Mods
	Archives() Archives
	Installations() Installations
	Categories() Categories
	Profiles() Profiles
	Rules() Rules
	Overrides() Overrides
	PluginRules() PluginRules
	Manifests() Manifests
	Journals() Journals
	ExternalDecisions() ExternalDecisions
	Notifications() Notifications
	Presence() Presence
	// Emit records events stored in the same transaction. Their IDs must be
	// set; the store assigns sequences.
	Emit(events ...event.Event)
}

// UnitOfWork runs fn in one transaction: the state it saves and the events
// it emits are committed together or not at all. It returns the stored
// events (with sequence) for the caller to publish after the commit.
type UnitOfWork interface {
	Do(ctx context.Context, fn func(ctx context.Context, tx Tx) error) ([]event.Event, error)
}

// EventLog reads stored events by subject, newest first (history of an
// entity, core/02 §12).
type EventLog interface {
	BySubject(ctx context.Context, ref event.EntityRef, limit int) ([]event.Event, error)
}

// HistoryQuery filters the history projection (core/10 §3). Zero values do
// not filter. Mod matches the events about the mod and the events that name
// it (rules, overrides).
type HistoryQuery struct {
	Instance game.InstanceID
	Profile  string
	Mod      string
	// TypePrefixes keeps events whose type starts with one of them.
	TypePrefixes []string
	// Exclude drops events whose type starts with one of them.
	Exclude []string
	// Origin keeps "user", "auto" or "system" events.
	Origin   string
	From, To time.Time
	// Before pages backwards: only events with a smaller sequence.
	Before int64
	Limit  int
}

// History reads events as history (core/10 §3) and applies the retention.
type History interface {
	Query(ctx context.Context, q HistoryQuery) ([]event.Event, error)
	// ByID returns ErrNotFound for an unknown event.
	ByID(ctx context.Context, id string) (event.Event, error)
	// Reverted returns, among ids, the ones a later event reverted
	// (payload revertOf), mapped to the reverting event id.
	Reverted(ctx context.Context, ids []string) (map[string]string, error)
	// Prune deletes events older than before (history.retentionDays).
	Prune(ctx context.Context, before time.Time) (int, error)
}

// Event tags (core/10 §3): facts about who caused a change, merged into the
// payload of every event committed under the context. The history shows the
// origin and links a reversal to the entry it reverts.
const (
	TagOrigin    = "origin"
	TagRevertOf  = "revertOf"
	OriginAuto   = "auto"
	OriginSystem = "system"
	OriginUser   = "user"
)

type eventTagsKey struct{}

// WithEventTags returns a context whose committed events carry tags.
func WithEventTags(ctx context.Context, tags map[string]string) context.Context {
	merged := map[string]string{}
	for k, v := range EventTags(ctx) {
		merged[k] = v
	}
	for k, v := range tags {
		merged[k] = v
	}
	return context.WithValue(ctx, eventTagsKey{}, merged)
}

// EventTags returns the tags of ctx (nil when none).
func EventTags(ctx context.Context) map[string]string {
	tags, _ := ctx.Value(eventTagsKey{}).(map[string]string)
	return tags
}

// InstallationSummary is the cheap view of an installation.
type InstallationSummary struct {
	Installer string
	Files     int
	Size      int64
}
