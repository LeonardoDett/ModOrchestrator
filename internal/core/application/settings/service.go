// Package settings is the application service over the settings catalog
// (core/13): it resolves effective values (explicit value, else catalog or
// derived default) and validates changes through the domain.
package settings

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"modorchestrator/internal/core/application/ports"
	domain "modorchestrator/internal/core/domain/settings"
)

// ErrUnknown is returned for keys outside the available catalog.
var ErrUnknown = errors.New("settings: unknown setting")

// ErrReadOnly is returned when a setting cannot be stored: it is shown only
// (app.dataDir) or it changes through an operation (staging, method).
var ErrReadOnly = errors.New("settings: setting is not editable here")

// Preferences reports the OS preferences derived defaults follow
// ("segue o SO", core/13).
type Preferences interface {
	ReduceMotion() bool
}

// Effective is a setting with the value that applies now.
type Effective struct {
	Def   domain.Def
	Value string
	// Default is the literal or derived default; empty when a derived
	// default cannot be determined yet (it belongs to a later phase).
	Default   string
	IsDefault bool
}

// Service reads and changes app-scoped settings.
type Service struct {
	repo    ports.Settings
	locale  ports.SystemLocale
	release domain.Release
	// DataDir is the application data folder (app.dataDir, shown only).
	DataDir string
	// Prefs gives the OS preferences (nil: none known).
	Prefs Preferences
}

// NewService wires the service; only settings of release r are exposed.
func NewService(repo ports.Settings, locale ports.SystemLocale, r domain.Release) *Service {
	return &Service{repo: repo, locale: locale, release: r}
}

// App returns every available app-scoped setting, in catalog order.
func (s *Service) App(ctx context.Context) ([]Effective, error) {
	stored, err := s.repo.List(ctx, domain.ScopeApp, "")
	if err != nil {
		return nil, err
	}
	explicit := make(map[string]string, len(stored))
	for _, v := range stored {
		explicit[v.Key] = v.Value
	}
	var out []Effective
	for _, d := range domain.Available(s.release) {
		if d.Scope != domain.ScopeApp {
			continue
		}
		out = append(out, s.effective(d, explicit))
	}
	return out, nil
}

// AppValue returns the effective value of one app-scoped setting.
func (s *Service) AppValue(ctx context.Context, key string) (Effective, error) {
	d, err := s.appDef(key)
	if err != nil {
		return Effective{}, err
	}
	explicit := map[string]string{}
	switch v, err := s.repo.Get(ctx, domain.ScopeApp, "", key); {
	case err == nil:
		explicit[key] = v.Value
	case !errors.Is(err, ports.ErrNotFound):
		return Effective{}, err
	}
	return s.effective(d, explicit), nil
}

// SetApp validates and stores an explicit app-scoped value. Choosing the
// default value stores it explicitly: the user picked it.
func (s *Service) SetApp(ctx context.Context, key, value string) error {
	if d, err := s.appDef(key); err != nil {
		return err
	} else if d.ReadOnly {
		return fmt.Errorf("%w: %q", ErrReadOnly, key)
	}
	v, err := domain.NewValue(domain.ScopeApp, "", key, value)
	if err != nil {
		return err
	}
	return s.repo.Save(ctx, v)
}

// ResetApp removes the explicit value so the default applies again.
func (s *Service) ResetApp(ctx context.Context, key string) error {
	if _, err := s.appDef(key); err != nil {
		return err
	}
	return s.repo.Reset(ctx, domain.ScopeApp, "", key)
}

func (s *Service) appDef(key string) (domain.Def, error) {
	for _, d := range domain.Available(s.release) {
		if d.Key == key && d.Scope == domain.ScopeApp {
			return d, nil
		}
	}
	return domain.Def{}, fmt.Errorf("%w: %q", ErrUnknown, key)
}

func (s *Service) effective(d domain.Def, explicit map[string]string) Effective {
	def := d.Default
	if d.DerivedDefault {
		def = s.derivedDefault(d)
	}
	e := Effective{Def: d, Default: def, Value: def, IsDefault: true}
	// A stored value that no longer validates (catalog changed) is ignored
	// rather than trusted.
	if v, ok := explicit[d.Key]; ok && d.Validate(v) == nil {
		e.Value, e.IsDefault = v, false
	}
	return e
}

func (s *Service) derivedDefault(d domain.Def) string {
	switch d.Key {
	case "ui.language":
		return MatchLanguage(s.locale.Language(), d.Options)
	case "ui.reduceMotion":
		return strconv.FormatBool(s.Prefs != nil && s.Prefs.ReduceMotion())
	case "app.dataDir":
		return s.DataDir
	}
	return ""
}

// MatchLanguage picks the supported option for an OS language tag: exact
// match first, then the same primary language, else the first option
// ("en"). Comparison ignores case and accepts "_" as separator.
func MatchLanguage(tag string, options []string) string {
	if len(options) == 0 {
		return ""
	}
	norm := strings.ToLower(strings.ReplaceAll(tag, "_", "-"))
	primary, _, _ := strings.Cut(norm, "-")
	for _, o := range options {
		if strings.ToLower(o) == norm {
			return o
		}
	}
	if primary != "" {
		for _, o := range options {
			p, _, _ := strings.Cut(strings.ToLower(o), "-")
			if p == primary {
				return o
			}
		}
	}
	return options[0]
}

// InstanceValue returns the effective value of an instance-scoped setting.
func (s *Service) InstanceValue(ctx context.Context, instance, key string) (Effective, error) {
	d, err := s.instanceDef(key)
	if err != nil {
		return Effective{}, err
	}
	explicit := map[string]string{}
	switch v, err := s.repo.Get(ctx, domain.ScopeInstance, instance, key); {
	case err == nil:
		explicit[key] = v.Value
	case !errors.Is(err, ports.ErrNotFound):
		return Effective{}, err
	}
	return s.effective(d, explicit), nil
}

// Instance returns the instance-scoped settings among keys (catalog order);
// nil keys means every editable one. Settings changed by an operation
// (ByOperation) are never listed: their value lives in the instance.
func (s *Service) Instance(ctx context.Context, instance string, keys []string) ([]Effective, error) {
	stored, err := s.repo.List(ctx, domain.ScopeInstance, instance)
	if err != nil {
		return nil, err
	}
	explicit := make(map[string]string, len(stored))
	for _, v := range stored {
		explicit[v.Key] = v.Value
	}
	var out []Effective
	for _, d := range domain.Available(s.release) {
		if d.Scope == domain.ScopeInstance && !d.ByOperation && (keys == nil || slices.Contains(keys, d.Key)) {
			out = append(out, s.effective(d, explicit))
		}
	}
	return out, nil
}

// SetInstance validates and stores an explicit instance-scoped value.
func (s *Service) SetInstance(ctx context.Context, instance, key, value string) error {
	if d, err := s.instanceDef(key); err != nil {
		return err
	} else if d.ByOperation {
		return fmt.Errorf("%w: %q", ErrReadOnly, key)
	}
	v, err := domain.NewValue(domain.ScopeInstance, instance, key, value)
	if err != nil {
		return err
	}
	return s.repo.Save(ctx, v)
}

// ResetInstance removes the explicit instance value.
func (s *Service) ResetInstance(ctx context.Context, instance, key string) error {
	if _, err := s.instanceDef(key); err != nil {
		return err
	}
	return s.repo.Reset(ctx, domain.ScopeInstance, instance, key)
}

func (s *Service) instanceDef(key string) (domain.Def, error) {
	for _, d := range domain.Available(s.release) {
		if d.Key == key && d.Scope == domain.ScopeInstance {
			return d, nil
		}
	}
	return domain.Def{}, fmt.Errorf("%w: %q", ErrUnknown, key)
}

// AppSummary returns every app-scoped setting as key → effective value
// (support bundle summary, core/10 §4). Path settings are left out: they
// are user folders, not configuration worth sharing.
func (s *Service) AppSummary(ctx context.Context) (map[string]string, error) {
	all, err := s.App(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[string]string, len(all))
	for _, e := range all {
		if e.Def.Type == domain.TypePath {
			continue
		}
		out[e.Def.Key] = e.Value
	}
	return out, nil
}

// RestartValues returns the effective values of the settings that apply
// only after a restart. The composition root keeps them as read at startup
// and RestartPending compares against them.
func (s *Service) RestartValues(ctx context.Context) (map[string]string, error) {
	all, err := s.App(ctx)
	if err != nil {
		return nil, err
	}
	out := map[string]string{}
	for _, e := range all {
		if e.Def.RestartRequired {
			out[e.Def.Key] = e.Value
		}
	}
	return out, nil
}

// RestartPending lists the restart-required settings whose effective value
// differs from the one the running process started with ("Reiniciar
// agora", core/13).
func (s *Service) RestartPending(ctx context.Context, startup map[string]string) ([]string, error) {
	now, err := s.RestartValues(ctx)
	if err != nil {
		return nil, err
	}
	var out []string
	for _, d := range domain.Available(s.release) {
		if v, ok := now[d.Key]; ok && startup[d.Key] != v {
			out = append(out, d.Key)
		}
	}
	return out, nil
}
