package bridge

import (
	"context"
	"testing"

	"modorchestrator/internal/bootstrap"
	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/infrastructure/appdata"
)

func TestBridgeForwardsOperationEventsAndQueries(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(appdata.EnvDataDir, dir)
	ctx := context.Background()

	c, err := bootstrap.New(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()

	app := NewApp(c)
	var emitted []EventDTO
	app.emit = func(_ context.Context, name string, data ...any) {
		if name != EventOperation {
			t.Errorf("unexpected channel %s", name)
		}
		emitted = append(emitted, data[0].(EventDTO))
	}
	app.Startup(ctx)
	defer app.Shutdown(ctx)

	id, err := c.Operations.Run(ctx, operations.Spec{Kind: "noop", Steps: []string{"only"}}, func(ctx context.Context, tr *operations.Tracker) error {
		if err := tr.BeginStep(ctx, "only"); err != nil {
			return err
		}
		return tr.CompleteStep(ctx, "only")
	})
	if err != nil {
		t.Fatal(err)
	}

	if len(emitted) != 5 || emitted[len(emitted)-1].Status != "succeeded" {
		t.Fatalf("emitted = %+v", emitted)
	}

	ops, err := app.ListRecentOperations(10)
	if err != nil || len(ops) != 1 || ops[0].ID != string(id) || ops[0].Steps[0].Status != "completed" {
		t.Fatalf("ops = %+v, err = %v", ops, err)
	}
	evs, err := app.GetOperationEvents(string(id))
	if err != nil || len(evs) != len(emitted) {
		t.Fatalf("events = %d, emitted = %d, err = %v", len(evs), len(emitted), err)
	}

	info := app.GetAppInfo()
	if info.DataDir == "" || info.SchemaVersion == 0 {
		t.Fatalf("info = %+v", info)
	}
}
