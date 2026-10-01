package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/operation"
)

// timeLayout has fixed-width fractions so stored UTC timestamps sort lexically.
const timeLayout = "2006-01-02T15:04:05.000000000Z07:00"

// OperationRepository implements operations.Repository.
type OperationRepository struct {
	db *sql.DB
}

var _ operations.Repository = (*OperationRepository)(nil)

// NewOperationRepository returns a repository over an opened database.
func NewOperationRepository(db *sql.DB) *OperationRepository {
	return &OperationRepository{db: db}
}

// Persistence DTOs keep JSON concerns out of the domain.
type stepRecord struct {
	Name       string     `json:"name"`
	Status     string     `json:"status"`
	StartedAt  *time.Time `json:"startedAt,omitempty"`
	FinishedAt *time.Time `json:"finishedAt,omitempty"`
}

type errorRecord struct {
	Code      string            `json:"code"`
	Message   string            `json:"message"`
	Step      string            `json:"step,omitempty"`
	Detail    string            `json:"detail,omitempty"`
	Retryable bool              `json:"retryable,omitempty"`
	Params    map[string]string `json:"params,omitempty"`
}

type progressRecord struct {
	Current int64 `json:"current"`
	Total   int64 `json:"total"`
}

type operationPayloadRecord struct {
	Kind     string          `json:"kind"`
	Status   string          `json:"status"`
	Step     string          `json:"step,omitempty"`
	Progress *progressRecord `json:"progress,omitempty"`
	Error    *errorRecord    `json:"error,omitempty"`
}

// Save upserts the operation and appends its events in one transaction.
func (r *OperationRepository) Save(ctx context.Context, op *operation.Operation, events []event.Event) ([]event.Event, error) {
	steps := make([]stepRecord, len(op.Steps))
	for i, s := range op.Steps {
		steps[i] = stepRecord{Name: s.Name, Status: string(s.Status), StartedAt: s.StartedAt, FinishedAt: s.FinishedAt}
	}
	stepsJSON, err := json.Marshal(steps)
	if err != nil {
		return nil, err
	}
	var errJSON sql.NullString
	if op.Error != nil {
		b, err := json.Marshal(toErrorRecord(op.Error))
		if err != nil {
			return nil, err
		}
		errJSON = sql.NullString{String: string(b), Valid: true}
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		INSERT INTO operations (id, kind, status, subject_kind, subject_id, steps_json, current_step,
			progress_current, progress_total, error_json, created_at, started_at, finished_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			status = excluded.status,
			steps_json = excluded.steps_json,
			current_step = excluded.current_step,
			progress_current = excluded.progress_current,
			progress_total = excluded.progress_total,
			error_json = excluded.error_json,
			started_at = excluded.started_at,
			finished_at = excluded.finished_at,
			updated_at = excluded.updated_at`,
		string(op.ID), string(op.Kind), string(op.Status), op.Subject.Kind, op.Subject.ID, string(stepsJSON),
		op.CurrentStep, op.Progress.Current, op.Progress.Total, errJSON,
		formatTime(op.CreatedAt), formatTimePtr(op.StartedAt), formatTimePtr(op.FinishedAt), formatTime(op.UpdatedAt),
	)
	if err != nil {
		return nil, fmt.Errorf("upsert operation: %w", err)
	}

	stored := make([]event.Event, len(events))
	for i, e := range events {
		payload, err := encodePayload(e.Payload)
		if err != nil {
			return nil, err
		}
		res, err := tx.ExecContext(ctx, `
			INSERT INTO events (id, type, occurred_at, operation_id, subject_kind, subject_id, payload_json)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			e.ID, string(e.Type), formatTime(e.OccurredAt), nullString(e.OperationID), e.Subject.Kind, e.Subject.ID, payload,
		)
		if err != nil {
			return nil, fmt.Errorf("append event: %w", err)
		}
		seq, err := res.LastInsertId()
		if err != nil {
			return nil, err
		}
		e.Sequence = seq
		stored[i] = e
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return stored, nil
}

const selectOperation = `SELECT id, kind, status, subject_kind, subject_id, steps_json, current_step,
	progress_current, progress_total, error_json, created_at, started_at, finished_at, updated_at FROM operations`

// Get loads one operation.
func (r *OperationRepository) Get(ctx context.Context, id operation.ID) (*operation.Operation, error) {
	rows, err := r.db.QueryContext(ctx, selectOperation+` WHERE id = ?`, string(id))
	if err != nil {
		return nil, err
	}
	ops, err := scanOperations(rows)
	if err != nil {
		return nil, err
	}
	if len(ops) == 0 {
		return nil, operations.ErrNotFound
	}
	return ops[0], nil
}

// ListRecent returns operations ordered by creation, newest first.
func (r *OperationRepository) ListRecent(ctx context.Context, limit int) ([]*operation.Operation, error) {
	rows, err := r.db.QueryContext(ctx, selectOperation+` ORDER BY created_at DESC, id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	return scanOperations(rows)
}

// ListByStatus returns operations in any of the given statuses.
func (r *OperationRepository) ListByStatus(ctx context.Context, statuses ...operation.Status) ([]*operation.Operation, error) {
	if len(statuses) == 0 {
		return nil, nil
	}
	args := make([]any, len(statuses))
	for i, s := range statuses {
		args[i] = string(s)
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(statuses)), ",")
	rows, err := r.db.QueryContext(ctx, selectOperation+` WHERE status IN (`+placeholders+`) ORDER BY created_at`, args...)
	if err != nil {
		return nil, err
	}
	return scanOperations(rows)
}

// Events returns the ordered event history of one operation.
func (r *OperationRepository) Events(ctx context.Context, id operation.ID) ([]event.Event, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT seq, id, type, occurred_at, COALESCE(operation_id, ''), subject_kind, subject_id, payload_json
		FROM events WHERE operation_id = ? ORDER BY seq`, string(id))
	if err != nil {
		return nil, err
	}
	// Domain events of the operation (mod.*, archive.*) are included with
	// their own payloads (D064).
	return scanEvents(rows)
}

func scanOperations(rows *sql.Rows) ([]*operation.Operation, error) {
	defer rows.Close()
	var out []*operation.Operation
	for rows.Next() {
		var (
			op                             operation.Operation
			id, kind, status, stepsJSON    string
			errJSON, startedAt, finishedAt sql.NullString
			createdAt, updatedAt           string
		)
		if err := rows.Scan(&id, &kind, &status, &op.Subject.Kind, &op.Subject.ID, &stepsJSON, &op.CurrentStep,
			&op.Progress.Current, &op.Progress.Total, &errJSON, &createdAt, &startedAt, &finishedAt, &updatedAt); err != nil {
			return nil, err
		}
		op.ID, op.Kind, op.Status = operation.ID(id), operation.Kind(kind), operation.Status(status)

		var steps []stepRecord
		if err := json.Unmarshal([]byte(stepsJSON), &steps); err != nil {
			return nil, fmt.Errorf("decode steps of %s: %w", id, err)
		}
		op.Steps = make([]operation.Step, len(steps))
		for i, s := range steps {
			op.Steps[i] = operation.Step{Name: s.Name, Status: operation.StepStatus(s.Status), StartedAt: s.StartedAt, FinishedAt: s.FinishedAt}
		}
		if errJSON.Valid {
			var rec errorRecord
			if err := json.Unmarshal([]byte(errJSON.String), &rec); err != nil {
				return nil, fmt.Errorf("decode error of %s: %w", id, err)
			}
			op.Error = fromErrorRecord(&rec)
		}
		var err error
		if op.CreatedAt, err = parseTime(createdAt); err != nil {
			return nil, err
		}
		if op.UpdatedAt, err = parseTime(updatedAt); err != nil {
			return nil, err
		}
		if op.StartedAt, err = parseTimePtr(startedAt); err != nil {
			return nil, err
		}
		if op.FinishedAt, err = parseTimePtr(finishedAt); err != nil {
			return nil, err
		}
		out = append(out, &op)
	}
	return out, rows.Err()
}

func encodePayload(p any) (string, error) {
	switch v := p.(type) {
	case operation.EventPayload:
		rec := operationPayloadRecord{Kind: string(v.Kind), Status: string(v.Status), Step: v.Step, Error: toErrorRecord(v.Error)}
		if v.Progress != nil {
			rec.Progress = &progressRecord{Current: v.Progress.Current, Total: v.Progress.Total}
		}
		b, err := json.Marshal(rec)
		return string(b), err
	case map[string]string:
		b, err := json.Marshal(v)
		return string(b), err
	case nil:
		return "{}", nil
	default:
		return "", errors.New("sqlite: unsupported event payload type " + fmt.Sprintf("%T", p))
	}
}

func fromPayloadRecord(rec operationPayloadRecord) operation.EventPayload {
	p := operation.EventPayload{Kind: operation.Kind(rec.Kind), Status: operation.Status(rec.Status), Step: rec.Step, Error: fromErrorRecord(rec.Error)}
	if rec.Progress != nil {
		p.Progress = &operation.Progress{Current: rec.Progress.Current, Total: rec.Progress.Total}
	}
	return p
}

func toErrorRecord(e *operation.Error) *errorRecord {
	if e == nil {
		return nil
	}
	return &errorRecord{Code: e.Code, Message: e.Message, Step: e.Step, Detail: e.Detail, Retryable: e.Retryable, Params: e.Params}
}

func fromErrorRecord(r *errorRecord) *operation.Error {
	if r == nil {
		return nil
	}
	return &operation.Error{Code: r.Code, Message: r.Message, Step: r.Step, Detail: r.Detail, Retryable: r.Retryable, Params: r.Params}
}

func formatTime(t time.Time) string { return t.UTC().Format(timeLayout) }

func formatTimePtr(t *time.Time) sql.NullString {
	if t == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: formatTime(*t), Valid: true}
}

func parseTime(s string) (time.Time, error) { return time.Parse(timeLayout, s) }

func parseTimePtr(s sql.NullString) (*time.Time, error) {
	if !s.Valid {
		return nil, nil
	}
	t, err := parseTime(s.String)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func nullString(s string) sql.NullString { return sql.NullString{String: s, Valid: s != ""} }
