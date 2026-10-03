package settings

import (
	"context"
	"errors"
	"testing"

	"modorchestrator/internal/core/application/ports"
	domain "modorchestrator/internal/core/domain/settings"
)

type memRepo struct{ values map[string]domain.Value }

func (m *memRepo) Get(_ context.Context, _ domain.Scope, _, key string) (domain.Value, error) {
	v, ok := m.values[key]
	if !ok {
		return domain.Value{}, ports.ErrNotFound
	}
	return v, nil
}

func (m *memRepo) List(context.Context, domain.Scope, string) ([]domain.Value, error) {
	var out []domain.Value
	for _, v := range m.values {
		out = append(out, v)
	}
	return out, nil
}

func (m *memRepo) Save(_ context.Context, v domain.Value) error { m.values[v.Key] = v; return nil }

func (m *memRepo) Reset(_ context.Context, _ domain.Scope, _, key string) error {
	delete(m.values, key)
	return nil
}

type fixedLocale string

func (l fixedLocale) Language() string { return string(l) }

func newService(lang string) (*Service, *memRepo) {
	repo := &memRepo{values: map[string]domain.Value{}}
	return NewService(repo, fixedLocale(lang), domain.V1), repo
}

func TestLanguageDefaultFollowsTheOS(t *testing.T) {
	ctx := context.Background()
	for tag, want := range map[string]string{"pt-BR": "pt-BR", "pt_PT": "pt-BR", "en-US": "en", "de-DE": "en", "": "en"} {
		svc, _ := newService(tag)
		got, err := svc.AppValue(ctx, "ui.language")
		if err != nil || got.Value != want || !got.IsDefault || got.Default != want {
			t.Errorf("OS %q: got %+v, %v; want %s", tag, got, err, want)
		}
	}
}

func TestSetValidatesAndResetRestoresDefault(t *testing.T) {
	ctx := context.Background()
	svc, repo := newService("en-US")

	if err := svc.SetApp(ctx, "theme.mode", "purple"); !errors.Is(err, domain.ErrInvalid) {
		t.Fatalf("invalid value: err = %v", err)
	}
	if err := svc.SetApp(ctx, "mods.stagingPath", "C:/x"); !errors.Is(err, ErrUnknown) {
		t.Fatalf("instance setting through the app API: err = %v", err)
	}
	if err := svc.SetApp(ctx, "automation.installOnDownload", "true"); !errors.Is(err, ErrUnknown) {
		t.Fatalf("reserved V2 setting: err = %v", err)
	}
	if err := svc.SetApp(ctx, "ui.language", "pt-BR"); err != nil {
		t.Fatal(err)
	}
	got, _ := svc.AppValue(ctx, "ui.language")
	if got.Value != "pt-BR" || got.IsDefault {
		t.Fatalf("after set: %+v", got)
	}
	if err := svc.ResetApp(ctx, "ui.language"); err != nil {
		t.Fatal(err)
	}
	got, _ = svc.AppValue(ctx, "ui.language")
	if got.Value != "en" || !got.IsDefault {
		t.Fatalf("after reset: %+v", got)
	}

	// A stale stored value is ignored, not trusted.
	repo.values["theme.mode"] = domain.Value{Scope: domain.ScopeApp, Key: "theme.mode", Value: "sepia"}
	got, _ = svc.AppValue(ctx, "theme.mode")
	if got.Value != "dark" || !got.IsDefault {
		t.Fatalf("stale value: %+v", got)
	}
}

func TestAppListsOnlyAvailableAppSettings(t *testing.T) {
	svc, _ := newService("en")
	all, err := svc.App(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	keys := map[string]bool{}
	for _, e := range all {
		if e.Def.Scope != domain.ScopeApp || e.Def.Release != domain.V1 {
			t.Errorf("%s should not be listed", e.Def.Key)
		}
		keys[e.Def.Key] = true
	}
	for _, k := range []string{"ui.language", "theme.mode", "theme.id", "ui.customTitleBar"} {
		if !keys[k] {
			t.Errorf("%s missing", k)
		}
	}
}

type prefs bool

func (p prefs) ReduceMotion() bool { return bool(p) }

func TestDerivedDefaultsReadOnlyAndRestart(t *testing.T) {
	ctx := context.Background()
	svc, _ := newService("en")
	svc.DataDir, svc.Prefs = `C:\data`, prefs(true)
	if v, _ := svc.AppValue(ctx, "app.dataDir"); v.Value != `C:\data` {
		t.Fatalf("dataDir: %+v", v)
	}
	if v, _ := svc.AppValue(ctx, "ui.reduceMotion"); v.Value != "true" || !v.IsDefault {
		t.Fatalf("reduceMotion follows the OS: %+v", v)
	}
	if err := svc.SetApp(ctx, "app.dataDir", `D:\x`); !errors.Is(err, ErrReadOnly) {
		t.Fatalf("dataDir is read-only: %v", err)
	}
	if err := svc.SetInstance(ctx, "i1", "deploy.method", "copy"); !errors.Is(err, ErrReadOnly) {
		t.Fatalf("method changes through an operation: %v", err)
	}
	inst, err := svc.Instance(ctx, "i1", nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range inst {
		if e.Def.ByOperation || e.Def.Scope != domain.ScopeInstance {
			t.Errorf("%s must not be listed", e.Def.Key)
		}
	}
	start, _ := svc.RestartValues(ctx)
	if p, _ := svc.RestartPending(ctx, start); len(p) != 0 {
		t.Fatalf("nothing changed: %v", p)
	}
	_ = svc.SetApp(ctx, "app.gpuAcceleration", "false")
	if p, _ := svc.RestartPending(ctx, start); len(p) != 1 || p[0] != "app.gpuAcceleration" {
		t.Fatalf("pending: %v", p)
	}
}
