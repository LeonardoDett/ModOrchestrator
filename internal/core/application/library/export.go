package library

import (
	"context"
	"strings"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
)

// ModListText is the mod list of the active profile as plain text (Mods ›
// Mais ações › "Exportar a lista em texto"): one mod per line in priority
// order, lowest first, "[x]" when enabled, with the version; separators as
// "## Label". It is meant to be read or shared, never imported back.
func (s *Service) ModListText(ctx context.Context, instance game.InstanceID) (string, error) {
	e, err := s.env(ctx, instance)
	if err != nil {
		return "", err
	}
	active, err := s.Profiles.Active(ctx, instance)
	if err != nil {
		return "", err
	}
	p, err := s.Profiles.Get(ctx, active)
	if err != nil {
		return "", err
	}
	mods, err := s.Mods.ListByInstance(ctx, instance)
	if err != nil {
		return "", err
	}
	byID := map[mod.ID]*mod.Mod{}
	for _, m := range mods {
		byID[m.ID] = m
	}
	var b strings.Builder
	b.WriteString("# " + e.inst.DisplayName +" · " + p.Name() + "\r\n")
	for _, en := range p.Order() {
		if en.Separator != "" {
			if sep, ok := p.Separator(en.Separator); ok {
				b.WriteString("\r\n## " + sep.Label + "\r\n")
			}
			continue
		}
		m := byID[en.Mod]
		if m == nil || m.State == mod.StateRemoved {
			continue
		}
		mark := "[ ]"
		if p.IsEnabled(m.ID) {
			mark = "[x]"
		}
		line := mark + " " + m.DisplayName()
		if v := strings.TrimSpace(m.Attributes.Version); v != "" {
			line += " " + v
		}
		b.WriteString(line + "\r\n")
	}
	return b.String(), nil
}

// ExportModList writes ModListText to path, a file the user chose.
func (s *Service) ExportModList(ctx context.Context, instance game.InstanceID, path string) error {
	text, err := s.ModListText(ctx, instance)
	if err != nil {
		return err
	}
	return s.FS.WriteFile(ctx, path, []byte(text))
}
