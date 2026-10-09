package integration_test

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	deploysvc "modorchestrator/internal/core/application/deployment"
)

// TestWriteMigrationFixture records a database the app really wrote (mods,
// deploy, profiles, rules, plugin groups, settings, diagnostics, history)
// as the fixture of the migration tests (core/14 §2: "cada migration testada
// com banco da versão anterior contendo dados reais de fixture"). Run it
// with MO_WRITE_MIGRATION_FIXTURE=1 after a migration is added.
func TestWriteMigrationFixture(t *testing.T) {
	if os.Getenv("MO_WRITE_MIGRATION_FIXTURE") == "" {
		t.Skip("set MO_WRITE_MIGRATION_FIXTURE=1 to rewrite the fixture")
	}
	e, _ := maintScenario(t, t.TempDir(), envOptions{})
	alpha, bravo := modNamed(t, e, "Alpha"), modNamed(t, e, "Bravo")
	if _, err := e.prof.CreateOrderRule(ctx, e.inst.ID, alpha, bravo); err != nil {
		t.Fatal(err)
	}
	active, err := e.prof.ActiveProfile(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.prof.Create(ctx, e.inst.ID, "Survival", active); err != nil {
		t.Fatal(err)
	}
	if _, err := e.prof.CreateSnapshot(ctx, active); err != nil {
		t.Fatal(err)
	}
	if err := e.plug.SaveGroup(ctx, e.inst.ID, "Late", nil, true); err != nil {
		t.Fatal(err)
	}
	e.setApp("library.verifyStagingOnStartup", "true")
	e.write(e.data("Stray.esp"), "not managed")
	if err := e.diag.RefreshAll(ctx); err != nil {
		t.Fatal(err)
	}
	if v := e.problems(); len(v.Items) > 0 {
		_ = e.diag.Suppress(ctx, e.inst.ID, v.Items[0].Key, false)
	}
	e.deploy(deploysvc.KindDeploy)

	dump := map[string][]map[string]fixtureValue{}
	tables, err := e.db.QueryContext(ctx, `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('sqlite_sequence', 'schema_migrations') ORDER BY name`)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for tables.Next() {
		var n string
		_ = tables.Scan(&n)
		names = append(names, n)
	}
	tables.Close()
	for _, n := range names {
		rows, err := e.db.QueryContext(ctx, `SELECT * FROM "`+n+`" ORDER BY rowid`)
		if err != nil {
			t.Fatal(err)
		}
		cols, _ := rows.Columns()
		for rows.Next() {
			vals := make([]any, len(cols))
			ptrs := make([]any, len(cols))
			for i := range vals {
				ptrs[i] = &vals[i]
			}
			if err := rows.Scan(ptrs...); err != nil {
				t.Fatal(err)
			}
			row := map[string]fixtureValue{}
			for i, c := range cols {
				v := toFixture(vals[i])
				// The temporary folder names the user running the test.
				v.V = strings.NewReplacer(e.dir, fixtureDir, strings.ReplaceAll(e.dir, `\`, `\\`), strings.ReplaceAll(fixtureDir, `\`, `\\`)).Replace(v.V)
				row[c] = v
			}
			dump[n] = append(dump[n], row)
		}
		rows.Close()
	}
	body, _ := json.MarshalIndent(dump, "", " ")
	out := filepath.Join("..", "infrastructure", "persistence", "sqlite", "testdata", "migrations", "fixture.json")
	if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(out, body, 0o644); err != nil {
		t.Fatal(err)
	}
	for _, n := range names {
		t.Logf("%s: %d rows", n, len(dump[n]))
	}
}

const fixtureDir = `C:\Games\MO-fixture`

// fixtureValue keeps the SQLite storage class: K is n(ull), i(nteger),
// f(loat), s(tring) or b(lob, hex).
type fixtureValue struct {
	K string `json:"k"`
	V string `json:"v,omitempty"`
}

func toFixture(v any) fixtureValue {
	switch x := v.(type) {
	case nil:
		return fixtureValue{K: "n"}
	case int64:
		return fixtureValue{K: "i", V: fmt.Sprint(x)}
	case float64:
		return fixtureValue{K: "f", V: fmt.Sprint(x)}
	case string:
		return fixtureValue{K: "s", V: x}
	case []byte:
		return fixtureValue{K: "b", V: hex.EncodeToString(x)}
	}
	panic(fmt.Sprintf("unexpected %T", v))
}
