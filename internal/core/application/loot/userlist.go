package loot

import (
	"context"
	"strings"

	"modorchestrator/internal/core/application/plugins"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/plugin"
)

// UserlistPath finds the userlist LOOT keeps for the instance's game, in the
// folder of LOOT 0.17 and later, then in the older one. ok is false when
// none exists.
func (s *Service) UserlistPath(ctx context.Context, instance game.InstanceID) (string, bool) {
	_, lg, ok := s.game(ctx, instance)
	if !ok || s.Folders == nil || lg.Folder == "" {
		return "", false
	}
	base, err := s.Folders.Folder(ports.FolderLocalAppData)
	if err != nil {
		return "", false
	}
	for _, p := range []string{
		game.JoinPath(base, "LOOT", "games", lg.Folder, "userlist.yaml"),
		game.JoinPath(base, "LOOT", lg.Folder, "userlist.yaml"),
	} {
		if info, err := s.FS.Stat(ctx, p); err == nil && info.Exists && !info.IsDir {
			return p, true
		}
	}
	return "", false
}

// ImportUserlist brings the rules of a LOOT userlist into the instance as
// the user's own (source "import", D128): "after" and "req" between plugins
// become rules, groups and their "after" become groups, and "group" becomes
// the plugin's group. Entries with a condition or a regular expression are
// left out: they describe LOOT's evaluation, not a choice of the user. An
// empty path uses UserlistPath.
func (s *Service) ImportUserlist(ctx context.Context, instance game.InstanceID, path string) (plugins.ImportResult, error) {
	if _, _, ok := s.game(ctx, instance); !ok {
		return plugins.ImportResult{}, fail(CodeUnsupported, nil)
	}
	if strings.TrimSpace(path) == "" {
		p, ok := s.UserlistPath(ctx, instance)
		if !ok {
			return plugins.ImportResult{}, fail(CodeUserlistAbsent, nil)
		}
		path = p
	}
	data, err := readAll(ctx, s.FS, path)
	if err != nil {
		return plugins.ImportResult{}, fail(CodeUserlistAbsent, err, "path", path)
	}
	m, err := Parse(data, nil)
	if err != nil {
		return plugins.ImportResult{}, fail(CodeUserlistBad, err, "path", path)
	}
	in := Imported(m)
	return s.Plugins.ImportPluginRules(ctx, instance, in)
}

// Imported converts a parsed userlist into the plugins module's import.
func Imported(m *Masterlist) plugins.ImportedRules {
	in := plugins.ImportedRules{Assignments: map[plugin.Name]string{}}
	for _, g := range m.Groups {
		in.Groups = append(in.Groups, plugin.Group{Name: g.Name, After: g.After})
	}
	for _, e := range m.Plugins {
		if e.IsRegex() {
			continue
		}
		if e.Group != "" {
			in.Assignments[plugin.Name(e.Name)] = e.Group
		}
		for _, f := range append(append([]File{}, e.After...), e.Req...) {
			if f.Condition != "" || isRegex(f.Name) || strings.ContainsAny(f.Name, `/\`) {
				continue
			}
			in.Rules = append(in.Rules, plugin.Rule{Plugin: plugin.Name(e.Name), After: plugin.Name(f.Name)})
		}
	}
	return in
}
