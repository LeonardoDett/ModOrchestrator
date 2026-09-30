package sqlite

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/settings"
)

func TestSettingsRepositoryRoundTrip(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "state.db")
	db, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	repo := NewSettingsRepository(db)

	if _, err := repo.Get(ctx, settings.ScopeApp, "", "ui.language"); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("unset value: err = %v, want ErrNotFound", err)
	}
	v, _ := settings.NewValue(settings.ScopeApp, "", "ui.language", "pt-BR")
	if err := repo.Save(ctx, v); err != nil {
		t.Fatal(err)
	}
	v.Value = "en"
	if err := repo.Save(ctx, v); err != nil {
		t.Fatal(err)
	}
	mode, _ := settings.NewValue(settings.ScopeApp, "", "theme.mode", "light")
	if err := repo.Save(ctx, mode); err != nil {
		t.Fatal(err)
	}
	db.Close()

	// Values survive a reopen.
	db, err = Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	repo = NewSettingsRepository(db)
	got, err := repo.Get(ctx, settings.ScopeApp, "", "ui.language")
	if err != nil || got.Value != "en" {
		t.Fatalf("get = %+v, %v", got, err)
	}
	list, err := repo.List(ctx, settings.ScopeApp, "")
	if err != nil || len(list) != 2 || list[0].Key != "theme.mode" || list[1].Key != "ui.language" {
		t.Fatalf("list = %+v, %v", list, err)
	}
	if err := repo.Reset(ctx, settings.ScopeApp, "", "ui.language"); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.Get(ctx, settings.ScopeApp, "", "ui.language"); !errors.Is(err, ports.ErrNotFound) {
		t.Fatalf("after reset: err = %v", err)
	}
}
