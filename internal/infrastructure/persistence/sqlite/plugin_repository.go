package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/core/domain/rules"
)

// PluginRuleRepository implements ports.PluginRules as one document per
// instance.
type PluginRuleRepository struct{ db querier }

var _ ports.PluginRules = (*PluginRuleRepository)(nil)

// NewPluginRuleRepository returns a repository over an opened database.
func NewPluginRuleRepository(db *sql.DB) *PluginRuleRepository { return &PluginRuleRepository{db: db} }

type pluginRuleRecord struct {
	ID        string `json:"id"`
	Plugin    string `json:"plugin"`
	After     string `json:"after"`
	Source    string `json:"source"`
	Disabled  bool   `json:"disabled,omitempty"`
	CreatedAt string `json:"createdAt"`
}

type pluginGroupRecord struct {
	Name  string   `json:"name"`
	After []string `json:"after"`
}

type pluginRulesDoc struct {
	Rules       []pluginRuleRecord  `json:"rules"`
	Groups      []pluginGroupRecord `json:"groups"`
	Assignments map[string]string   `json:"assignments"`
}

// Get returns a set with only the default group when the instance has none.
func (r *PluginRuleRepository) Get(ctx context.Context, instance game.InstanceID) (*plugin.Rules, error) {
	var data string
	err := r.db.QueryRowContext(ctx, `SELECT data_json FROM instance_plugin_rules WHERE instance_id = ?`, string(instance)).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		return plugin.NewRules(instance)
	}
	if err != nil {
		return nil, err
	}
	var doc pluginRulesDoc
	if err := json.Unmarshal([]byte(data), &doc); err != nil {
		return nil, fmt.Errorf("sqlite: decode plugin rules: %w", err)
	}
	d := plugin.Data{Instance: instance, Assignments: map[plugin.Name]string{}}
	for _, rr := range doc.Rules {
		at, err := parseTime(rr.CreatedAt)
		if err != nil {
			return nil, err
		}
		d.Rules = append(d.Rules, plugin.Rule{ID: plugin.RuleID(rr.ID), Plugin: plugin.Name(rr.Plugin), After: plugin.Name(rr.After), Source: rules.Source(rr.Source), Disabled: rr.Disabled, CreatedAt: at})
	}
	for _, g := range doc.Groups {
		d.Groups = append(d.Groups, plugin.Group{Name: g.Name, After: g.After})
	}
	for p, g := range doc.Assignments {
		d.Assignments[plugin.Name(p)] = g
	}
	return plugin.RestoreRules(d)
}

func (r *PluginRuleRepository) Save(ctx context.Context, s *plugin.Rules) error {
	d := s.Data()
	doc := pluginRulesDoc{Rules: []pluginRuleRecord{}, Groups: []pluginGroupRecord{}, Assignments: map[string]string{}}
	for _, rr := range d.Rules {
		doc.Rules = append(doc.Rules, pluginRuleRecord{ID: string(rr.ID), Plugin: string(rr.Plugin), After: string(rr.After), Source: string(rr.Source), Disabled: rr.Disabled, CreatedAt: formatTime(rr.CreatedAt)})
	}
	for _, g := range d.Groups {
		after := g.After
		if after == nil {
			after = []string{}
		}
		doc.Groups = append(doc.Groups, pluginGroupRecord{Name: g.Name, After: after})
	}
	for p, g := range d.Assignments {
		doc.Assignments[string(p)] = g
	}
	b, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `INSERT INTO instance_plugin_rules (instance_id, data_json) VALUES (?, ?)
		ON CONFLICT(instance_id) DO UPDATE SET data_json = excluded.data_json`, string(s.Instance()), string(b))
	return err
}
