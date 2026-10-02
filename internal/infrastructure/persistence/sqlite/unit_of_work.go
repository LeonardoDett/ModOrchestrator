package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/event"
)

// UnitOfWork implements ports.UnitOfWork over one SQLite transaction: the
// state saved by fn and the events it emits are committed together
// (INV-OPS-01, D064).
type UnitOfWork struct{ db *sql.DB }

var _ ports.UnitOfWork = (*UnitOfWork)(nil)

// NewUnitOfWork returns a unit of work over an opened database.
func NewUnitOfWork(db *sql.DB) *UnitOfWork { return &UnitOfWork{db: db} }

type txRepos struct {
	q      querier
	events []event.Event
}

func (t *txRepos) Mods() ports.Mods                   { return &ModRepository{db: t.q} }
func (t *txRepos) Archives() ports.Archives           { return &ArchiveRepository{db: t.q} }
func (t *txRepos) Installations() ports.Installations { return &InstallationRepository{db: t.q} }
func (t *txRepos) Categories() ports.Categories       { return &CategoryRepository{db: t.q} }
func (t *txRepos) Profiles() ports.Profiles           { return &ProfileRepository{db: t.q} }
func (t *txRepos) Rules() ports.Rules                 { return &RuleRepository{db: t.q} }
func (t *txRepos) Overrides() ports.Overrides         { return &OverrideRepository{db: t.q} }
func (t *txRepos) PluginRules() ports.PluginRules     { return &PluginRuleRepository{db: t.q} }
func (t *txRepos) Manifests() ports.Manifests         { return &ManifestRepository{db: t.q} }
func (t *txRepos) Journals() ports.Journals           { return &JournalRepository{db: t.q} }
func (t *txRepos) ExternalDecisions() ports.ExternalDecisions {
	return &ExternalDecisionRepository{db: t.q}
}
func (t *txRepos) Notifications() ports.Notifications { return &NotificationRepository{db: t.q} }
func (t *txRepos) Presence() ports.Presence           { return &PresenceRepository{db: t.q} }
func (t *txRepos) Emit(events ...event.Event)         { t.events = append(t.events, events...) }

// Do runs fn in a transaction and appends the emitted events to it.
func (u *UnitOfWork) Do(ctx context.Context, fn func(ctx context.Context, tx ports.Tx) error) ([]event.Event, error) {
	tx, err := u.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	repos := &txRepos{q: tx}
	if err := fn(ctx, repos); err != nil {
		return nil, err
	}
	stored, err := appendEvents(ctx, tx, tagged(repos.events, ports.EventTags(ctx)))
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return stored, nil
}

func appendEvents(ctx context.Context, q querier, events []event.Event) ([]event.Event, error) {
	stored := make([]event.Event, len(events))
	for i, e := range events {
		if e.ID == "" {
			return nil, fmt.Errorf("sqlite: event %s without id", e.Type)
		}
		payload, err := encodePayload(e.Payload)
		if err != nil {
			return nil, err
		}
		m, _ := e.Payload.(map[string]string)
		instance, err := eventInstance(ctx, q, e, m)
		if err != nil {
			return nil, err
		}
		res, err := q.ExecContext(ctx, `
			INSERT INTO events (id, type, occurred_at, operation_id, subject_kind, subject_id, payload_json, instance_id)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			e.ID, string(e.Type), formatTime(e.OccurredAt), nullString(e.OperationID), e.Subject.Kind, e.Subject.ID, payload, instance)
		if err != nil {
			return nil, fmt.Errorf("append event: %w", err)
		}
		if e.Sequence, err = res.LastInsertId(); err != nil {
			return nil, err
		}
		stored[i] = e
	}
	return stored, nil
}

// tagged merges the context tags (origin, revertOf) into the map payloads
// of events; a value the event set itself wins.
func tagged(events []event.Event, tags map[string]string) []event.Event {
	if len(tags) == 0 {
		return events
	}
	out := make([]event.Event, len(events))
	for i, e := range events {
		if m, ok := e.Payload.(map[string]string); ok || e.Payload == nil {
			merged := make(map[string]string, len(m)+len(tags))
			for k, v := range tags {
				merged[k] = v
			}
			for k, v := range m {
				merged[k] = v
			}
			e.Payload = merged
		}
		out[i] = e
	}
	return out
}

// EventLog reads events by subject (history of a mod, core/02 §12).
type EventLog struct{ db *sql.DB }

// NewEventLog returns the reader over an opened database.
func NewEventLog(db *sql.DB) *EventLog { return &EventLog{db: db} }

var _ ports.EventLog = (*EventLog)(nil)

// BySubject returns the newest events about ref first.
func (l *EventLog) BySubject(ctx context.Context, ref event.EntityRef, limit int) ([]event.Event, error) {
	rows, err := l.db.QueryContext(ctx, `
		SELECT seq, id, type, occurred_at, COALESCE(operation_id, ''), subject_kind, subject_id, payload_json
		FROM events WHERE subject_kind = ? AND subject_id = ? ORDER BY seq DESC LIMIT ?`, ref.Kind, ref.ID, limit)
	if err != nil {
		return nil, err
	}
	return scanEvents(rows)
}

func scanEvents(rows *sql.Rows) ([]event.Event, error) {
	defer rows.Close()
	var out []event.Event
	for rows.Next() {
		var (
			e                   event.Event
			typ, occurred, body string
		)
		if err := rows.Scan(&e.Sequence, &e.ID, &typ, &occurred, &e.OperationID, &e.Subject.Kind, &e.Subject.ID, &body); err != nil {
			return nil, err
		}
		e.Type = event.Type(typ)
		var err error
		if e.OccurredAt, err = parseTime(occurred); err != nil {
			return nil, err
		}
		if e.Payload, err = decodePayload(e.Type, body); err != nil {
			return nil, fmt.Errorf("decode event %s payload: %w", e.ID, err)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// decodePayload restores operation payloads as operation.EventPayload and
// every other (domain) event as its string map.
func decodePayload(t event.Type, body string) (any, error) {
	if strings.HasPrefix(string(t), "operation.") {
		var rec operationPayloadRecord
		if err := json.Unmarshal([]byte(body), &rec); err != nil {
			return nil, err
		}
		return fromPayloadRecord(rec), nil
	}
	var m map[string]string
	if err := json.Unmarshal([]byte(body), &m); err != nil {
		return nil, err
	}
	return m, nil
}
