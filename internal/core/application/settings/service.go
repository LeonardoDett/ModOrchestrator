// Package settings is the application service over the settings catalog
// (core/13): it resolves effective values (explicit value, else catalog or
// derived default) and validates changes through the domain.
package settings

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"modorchestrator/internal/core/application/ports"
	domain "modorchestrator/internal/core/domain/settings"
)

// ErrUnknown is returned for keys outside the available catalog.
var ErrUnknown = errors.New("settings: unknown setting")

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
	if _, err := s.appDef(key); err != nil {
		return err
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
