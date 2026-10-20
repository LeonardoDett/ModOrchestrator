package sqlite

import (
	"context"
	"slices"
	"strings"
	"testing"

	"modorchestrator/internal/core/domain/plugin"
)

// D133: a profile and a snapshot stored before the plugins section keep
// their plugin states, load order and locks at the top level; reading them
// moves those into the section, and the next save writes the new form.
func TestProfileStoredBeforeSectionsIsRead(t *testing.T) {
	ctx := context.Background()
	db, err := Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := NewGameInstanceRepository(db).Save(ctx, sampleInstance("i1", "Main")); err != nil {
		t.Fatal(err)
	}
	old := `{"ID":"p1","Instance":"i1","Name":"Default","Mods":{},` +
		`"PluginsEnabled":{"A.esp":true,"B.esp":false},"LoadOrder":["A.esp","B.esp"],"IndexLocks":{"A.esp":0},` +
		`"CreatedAt":"2026-10-01T00:00:00Z","UpdatedAt":"2026-10-01T00:00:00Z"}`
	if _, err := db.ExecContext(ctx, `INSERT INTO profiles (id, instance_id, name, data_json, updated_at) VALUES ('p1', 'i1', 'Default', ?, '2026-10-01T00:00:00Z')`, old); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO profile_snapshots (id, profile_id, reason, created_at, data_json) VALUES ('s1', 'p1', 'manual', '2026-10-01T00:00:00.000000000Z', ?)`, old); err != nil {
		t.Fatal(err)
	}
	repo := NewProfileRepository(db)
	p, err := repo.Get(ctx, "p1")
	if err != nil {
		t.Fatal(err)
	}
	check := func(what string, st *plugin.ProfileState, err error) {
		t.Helper()
		if err != nil {
			t.Fatalf("%s: %v", what, err)
		}
		if on, _ := st.Enabled("a.esp"); !on || !slices.Equal(st.LoadOrder(), []plugin.Name{"A.esp", "B.esp"}) || len(st.IndexLocks()) != 1 {
			t.Fatalf("%s: state = %+v", what, st)
		}
	}
	st, err := plugin.StateOf(p)
	check("profile", st, err)
	snaps, err := repo.Snapshots(ctx, "p1")
	if err != nil || len(snaps) != 1 {
		t.Fatalf("snapshots = %+v, %v", snaps, err)
	}
	if _, ok := snaps[0].State.Sections[plugin.SectionID]; !ok {
		t.Fatal("the snapshot gets the plugins section")
	}
	if err := repo.Save(ctx, p); err != nil {
		t.Fatal(err)
	}
	var data string
	if err := db.QueryRowContext(ctx, `SELECT data_json FROM profiles WHERE id = 'p1'`).Scan(&data); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(data, `"PluginsEnabled"`) || strings.Contains(data, `"IndexLocks"`) {
		t.Fatalf("the new form has no top-level plugin fields: %s", data)
	}
	again, err := repo.Get(ctx, "p1")
	if err != nil {
		t.Fatal(err)
	}
	st, err = plugin.StateOf(again)
	check("saved again", st, err)
}
