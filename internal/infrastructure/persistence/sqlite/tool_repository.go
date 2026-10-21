package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/tool"
)

// ToolRepository implements ports.Tools (D146).
type ToolRepository struct{ db querier }

var _ ports.Tools = (*ToolRepository)(nil)

// NewToolRepository returns a repository over an opened database.
func NewToolRepository(db *sql.DB) *ToolRepository { return &ToolRepository{db: db} }

type envRecord struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type toolRecord struct {
	Name         string      `json:"name"`
	Known        string      `json:"known,omitempty"`
	Exe          string      `json:"exe"`
	Args         string      `json:"args,omitempty"`
	WorkDir      string      `json:"workDir,omitempty"`
	Env          []envRecord `json:"env,omitempty"`
	Icon         string      `json:"icon,omitempty"`
	Exclusive    bool        `json:"exclusive,omitempty"`
	DeployBefore bool        `json:"deployBefore,omitempty"`
}

func (r *ToolRepository) List(ctx context.Context, instance game.InstanceID) ([]tool.Tool, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, position, body_json FROM tools WHERE instance_id = ? ORDER BY position, id`, string(instance))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []tool.Tool
	for rows.Next() {
		var id, body string
		var pos int
		if err := rows.Scan(&id, &pos, &body); err != nil {
			return nil, err
		}
		var rec toolRecord
		if err := json.Unmarshal([]byte(body), &rec); err != nil {
			return nil, fmt.Errorf("sqlite: decode tool %s: %w", id, err)
		}
		t := tool.Tool{
			ID: tool.ID(id), Instance: instance, Position: pos, Name: rec.Name, Known: rec.Known, Exe: rec.Exe,
			Args: rec.Args, WorkDir: rec.WorkDir, Icon: rec.Icon, Exclusive: rec.Exclusive, DeployBefore: rec.DeployBefore,
		}
		for _, e := range rec.Env {
			t.Env = append(t.Env, tool.EnvVar{Name: e.Name, Value: e.Value})
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *ToolRepository) Save(ctx context.Context, t tool.Tool) error {
	rec := toolRecord{
		Name: t.Name, Known: t.Known, Exe: t.Exe, Args: t.Args, WorkDir: t.WorkDir, Icon: t.Icon,
		Exclusive: t.Exclusive, DeployBefore: t.DeployBefore,
	}
	for _, e := range t.Env {
		rec.Env = append(rec.Env, envRecord{Name: e.Name, Value: e.Value})
	}
	body, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `INSERT INTO tools (instance_id, id, position, body_json) VALUES (?, ?, ?, ?)
		ON CONFLICT (instance_id, id) DO UPDATE SET position = excluded.position, body_json = excluded.body_json`,
		string(t.Instance), string(t.ID), t.Position, string(body))
	return err
}

func (r *ToolRepository) Delete(ctx context.Context, instance game.InstanceID, id tool.ID) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM tools WHERE instance_id = ? AND id = ?`, string(instance), string(id))
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ports.ErrNotFound
	}
	return nil
}
