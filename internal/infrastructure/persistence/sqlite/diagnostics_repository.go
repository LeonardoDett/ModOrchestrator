package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/notification"
)

// SuppressionRepository implements ports.Suppressions.
type SuppressionRepository struct{ db querier }

var _ ports.Suppressions = (*SuppressionRepository)(nil)

// NewSuppressionRepository returns the repository over an opened database.
func NewSuppressionRepository(db *sql.DB) *SuppressionRepository {
	return &SuppressionRepository{db: db}
}

func (r *SuppressionRepository) List(ctx context.Context) ([]diagnostic.Suppression, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT key, code, created_at FROM diagnostic_suppressions ORDER BY created_at, key, code`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []diagnostic.Suppression
	for rows.Next() {
		var key, code, at string
		if err := rows.Scan(&key, &code, &at); err != nil {
			return nil, err
		}
		t, err := parseTime(at)
		if err != nil {
			return nil, err
		}
		out = append(out, diagnostic.Suppression{Key: diagnostic.Key(key), Code: diagnostic.Code(code), CreatedAt: t})
	}
	return out, rows.Err()
}

func (r *SuppressionRepository) Save(ctx context.Context, s diagnostic.Suppression) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO diagnostic_suppressions (key, code, created_at) VALUES (?, ?, ?)
		ON CONFLICT(key, code) DO NOTHING`, string(s.Key), string(s.Code), formatTime(s.CreatedAt))
	return err
}

func (r *SuppressionRepository) Delete(ctx context.Context, s diagnostic.Suppression) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM diagnostic_suppressions WHERE key = ? AND code = ?`, string(s.Key), string(s.Code))
	return err
}

func (r *SuppressionRepository) DeleteAll(ctx context.Context) (int, error) {
	res, err := r.db.ExecContext(ctx, `DELETE FROM diagnostic_suppressions`)
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	return int(n), err
}

// PresenceRepository implements ports.Presence.
type PresenceRepository struct{ db querier }

var _ ports.Presence = (*PresenceRepository)(nil)

// NewPresenceRepository returns the repository over an opened database.
func NewPresenceRepository(db *sql.DB) *PresenceRepository { return &PresenceRepository{db: db} }

func (r *PresenceRepository) List(ctx context.Context, instance game.InstanceID) ([]diagnostic.Presence, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT key, code, severity, first_seen FROM diagnostic_presence WHERE instance_id = ? ORDER BY key`, string(instance))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []diagnostic.Presence
	for rows.Next() {
		var key, code, sev, at string
		if err := rows.Scan(&key, &code, &sev, &at); err != nil {
			return nil, err
		}
		t, err := parseTime(at)
		if err != nil {
			return nil, err
		}
		out = append(out, diagnostic.Presence{Key: diagnostic.Key(key), Code: diagnostic.Code(code), Severity: diagnostic.Severity(sev), FirstSeen: t})
	}
	return out, rows.Err()
}

func (r *PresenceRepository) Replace(ctx context.Context, instance game.InstanceID, present []diagnostic.Presence) error {
	if _, err := r.db.ExecContext(ctx, `DELETE FROM diagnostic_presence WHERE instance_id = ?`, string(instance)); err != nil {
		return err
	}
	for _, p := range present {
		if _, err := r.db.ExecContext(ctx, `INSERT INTO diagnostic_presence (instance_id, key, code, severity, first_seen) VALUES (?, ?, ?, ?, ?)`,
			string(instance), string(p.Key), string(p.Code), string(p.Severity), formatTime(p.FirstSeen)); err != nil {
			return err
		}
	}
	return nil
}

// NotificationRepository implements ports.Notifications.
type NotificationRepository struct{ db querier }

var _ ports.Notifications = (*NotificationRepository)(nil)

// NewNotificationRepository returns the repository over an opened database.
func NewNotificationRepository(db *sql.DB) *NotificationRepository {
	return &NotificationRepository{db: db}
}

const notificationColumns = `id, kind, ref, code, params_json, subject_kind, subject_id, instance_id, severity, count, state, created_at, updated_at`

func (r *NotificationRepository) Save(ctx context.Context, n *notification.Notification) error {
	params, err := json.Marshal(n.Params)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `INSERT INTO notifications (`+notificationColumns+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET params_json = excluded.params_json, count = excluded.count, state = excluded.state,
			severity = excluded.severity, updated_at = excluded.updated_at`,
		string(n.ID), string(n.Kind), n.Ref, n.Code, string(params), n.Subject.Kind, n.Subject.ID, n.Instance, n.Severity,
		n.Count, string(n.State), formatTime(n.CreatedAt), formatTime(n.UpdatedAt))
	return err
}

func (r *NotificationRepository) Get(ctx context.Context, id notification.ID) (*notification.Notification, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+notificationColumns+` FROM notifications WHERE id = ?`, string(id))
	if err != nil {
		return nil, err
	}
	return oneNotification(rows)
}

func (r *NotificationRepository) List(ctx context.Context, limit int) ([]*notification.Notification, error) {
	if limit <= 0 {
		limit = 200
	}
	rows, err := r.db.QueryContext(ctx, `SELECT `+notificationColumns+` FROM notifications WHERE state <> ? ORDER BY updated_at DESC, id LIMIT ?`,
		string(notification.StateDismissed), limit)
	if err != nil {
		return nil, err
	}
	return scanNotifications(rows)
}

func (r *NotificationRepository) ByRef(ctx context.Context, ref string) (*notification.Notification, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+notificationColumns+` FROM notifications WHERE ref = ? ORDER BY updated_at DESC LIMIT 1`, ref)
	if err != nil {
		return nil, err
	}
	return oneNotification(rows)
}

func oneNotification(rows *sql.Rows) (*notification.Notification, error) {
	list, err := scanNotifications(rows)
	if err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return nil, ports.ErrNotFound
	}
	return list[0], nil
}

func scanNotifications(rows *sql.Rows) ([]*notification.Notification, error) {
	defer rows.Close()
	var out []*notification.Notification
	for rows.Next() {
		var (
			n                          notification.Notification
			id, kind, params, state    string
			created, updated, severity string
		)
		if err := rows.Scan(&id, &kind, &n.Ref, &n.Code, &params, &n.Subject.Kind, &n.Subject.ID, &n.Instance, &severity, &n.Count, &state, &created, &updated); err != nil {
			return nil, err
		}
		n.ID, n.Kind, n.State, n.Severity = notification.ID(id), notification.Kind(kind), notification.State(state), severity
		if err := json.Unmarshal([]byte(params), &n.Params); err != nil {
			return nil, err
		}
		var err error
		if n.CreatedAt, err = parseTime(created); err != nil {
			return nil, err
		}
		if n.UpdatedAt, err = parseTime(updated); err != nil {
			return nil, err
		}
		out = append(out, &n)
	}
	return out, rows.Err()
}

// HistoryRepository implements ports.History over the event store.
type HistoryRepository struct{ db *sql.DB }

var _ ports.History = (*HistoryRepository)(nil)

// NewHistoryRepository returns the reader over an opened database.
func NewHistoryRepository(db *sql.DB) *HistoryRepository { return &HistoryRepository{db: db} }

const eventColumns = `seq, id, type, occurred_at, COALESCE(operation_id, ''), subject_kind, subject_id, payload_json`

func (r *HistoryRepository) Query(ctx context.Context, q ports.HistoryQuery) ([]event.Event, error) {
	var (
		where []string
		args  []any
	)
	if q.Instance != "" {
		where, args = append(where, "instance_id = ?"), append(args, string(q.Instance))
	}
	if q.Profile != "" {
		where = append(where, "((subject_kind = 'profile' AND subject_id = ?) OR json_extract(payload_json, '$.profile') = ?)")
		args = append(args, q.Profile, q.Profile)
	}
	if q.Mod != "" {
		// Mod ids are opaque and unique, so a quoted match in the payload
		// finds rules and overrides that name the mod.
		where = append(where, "((subject_kind = 'mod' AND subject_id = ?) OR instr(payload_json, ?) > 0)")
		args = append(args, q.Mod, `"`+q.Mod+`"`)
	}
	if len(q.TypePrefixes) > 0 {
		var ors []string
		for _, p := range q.TypePrefixes {
			ors, args = append(ors, "type LIKE ? ESCAPE '\\'"), append(args, likePrefix(p))
		}
		where = append(where, "("+strings.Join(ors, " OR ")+")")
	}
	for _, p := range q.Exclude {
		where, args = append(where, "type NOT LIKE ? ESCAPE '\\'"), append(args, likePrefix(p))
	}
	switch q.Origin {
	case "":
	case ports.OriginUser:
		where = append(where, "COALESCE(json_extract(payload_json, '$.origin'), '') IN ('', 'user')")
	default:
		where, args = append(where, "json_extract(payload_json, '$.origin') = ?"), append(args, q.Origin)
	}
	if !q.From.IsZero() {
		where, args = append(where, "occurred_at >= ?"), append(args, formatTime(q.From))
	}
	if !q.To.IsZero() {
		where, args = append(where, "occurred_at < ?"), append(args, formatTime(q.To))
	}
	if q.Before > 0 {
		where, args = append(where, "seq < ?"), append(args, q.Before)
	}
	limit := q.Limit
	if limit <= 0 {
		limit = 200
	}
	query := `SELECT ` + eventColumns + ` FROM events`
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	rows, err := r.db.QueryContext(ctx, query+" ORDER BY seq DESC LIMIT ?", append(args, limit)...)
	if err != nil {
		return nil, err
	}
	return scanEvents(rows)
}

func (r *HistoryRepository) ByID(ctx context.Context, id string) (event.Event, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+eventColumns+` FROM events WHERE id = ?`, id)
	if err != nil {
		return event.Event{}, err
	}
	evs, err := scanEvents(rows)
	if err != nil {
		return event.Event{}, err
	}
	if len(evs) == 0 {
		return event.Event{}, ports.ErrNotFound
	}
	return evs[0], nil
}

func (r *HistoryRepository) Reverted(ctx context.Context, ids []string) (map[string]string, error) {
	out := map[string]string{}
	if len(ids) == 0 {
		return out, nil
	}
	marks := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	rows, err := r.db.QueryContext(ctx, `SELECT json_extract(payload_json, '$.revertOf'), id FROM events
		WHERE json_extract(payload_json, '$.revertOf') IN (`+marks+`) ORDER BY seq`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var of, id string
		if err := rows.Scan(&of, &id); err != nil {
			return nil, err
		}
		if _, ok := out[of]; !ok {
			out[of] = id
		}
	}
	return out, rows.Err()
}

func (r *HistoryRepository) Prune(ctx context.Context, before time.Time) (int, error) {
	res, err := r.db.ExecContext(ctx, `DELETE FROM events WHERE occurred_at < ?`, formatTime(before))
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	return int(n), err
}

func likePrefix(p string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(p) + "%"
}

// eventInstance resolves the instance an event is about when it is stored
// (core/10 §3 filter by game): the payload's "instance", the subject when
// it is an instance, its mod or profile, or the instance of its operation.
func eventInstance(ctx context.Context, q querier, e event.Event, payload map[string]string) (string, error) {
	if v := payload["instance"]; v != "" {
		return v, nil
	}
	lookup := func(query string, arg string) (string, error) {
		var v string
		err := q.QueryRowContext(ctx, query, arg).Scan(&v)
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return v, err
	}
	switch e.Subject.Kind {
	case "instance":
		return e.Subject.ID, nil
	case "mod":
		if v, err := lookup(`SELECT instance_id FROM mods WHERE id = ?`, e.Subject.ID); err != nil || v != "" {
			return v, err
		}
	case "profile":
		if v, err := lookup(`SELECT instance_id FROM profiles WHERE id = ?`, e.Subject.ID); err != nil || v != "" {
			return v, err
		}
	}
	if e.OperationID != "" {
		return lookup(`SELECT subject_id FROM operations WHERE id = ? AND subject_kind = 'instance'`, e.OperationID)
	}
	return "", nil
}
