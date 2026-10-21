package loot

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"hash/crc32"
	"io"
	"regexp"
	"strconv"
	"strings"

	"modorchestrator/internal/core/application/plugins"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/core/domain/pluginhealth"
	"modorchestrator/internal/core/domain/rules"
)

// SourceLoot is the source of the rules, groups and assignments of LOOT.
const SourceLoot rules.Source = "loot"

// ProviderName is how the diagnostics name the provider.
const ProviderName = "LOOT"

func lower(s string) string { return strings.ToLower(s) }

// Provide evaluates the masterlist against the plugins of an instance
// (plugins.Provider).
func (s *Service) Provide(ctx context.Context, in plugins.ProviderInput) (plugins.ProviderOutput, bool, error) {
	if in.Adapter == nil {
		return plugins.ProviderOutput{}, false, nil
	}
	lg, ok := lootGame(in.Adapter, in.Instance)
	if !ok || !s.enabled(ctx, in.Instance.ID) {
		return plugins.ProviderOutput{}, false, nil
	}
	l, err := s.load(ctx, lg)
	if err != nil {
		return plugins.ProviderOutput{}, false, err
	}
	env := s.newEnv(ctx, in)
	return evaluate(l, env, in, s.language(ctx)), true, nil
}

// evaluate turns the masterlist into rules, groups, assignments and
// diagnostics for the given plugins.
func evaluate(l *loaded, env *env, in plugins.ProviderInput, lang string) plugins.ProviderOutput {
	out := plugins.ProviderOutput{Data: plugin.Provided{Source: SourceLoot, Assignments: map[plugin.Name]string{}}}
	for _, g := range l.list.Groups {
		out.Data.Groups = append(out.Data.Groups, plugin.Group{Name: g.Name, After: g.After})
	}
	conds := map[string]*Condition{}
	holds := func(c string) bool {
		if strings.TrimSpace(c) == "" {
			return true
		}
		pc, ok := conds[c]
		if !ok {
			pc, _ = ParseCondition(c)
			conds[c] = pc
		}
		if pc == nil {
			return false
		}
		v, err := pc.Eval(env)
		return err == nil && v
	}
	add := func(spec diagnostic.Spec) {
		if d, err := diagnostic.New(spec); err == nil {
			out.Diagnostics = append(out.Diagnostics, d)
		}
	}
	for _, p := range in.Plugins {
		entries := l.exact[p.Name.Key()]
		var matched []PluginEntry
		for _, i := range entries {
			matched = append(matched, l.list.Plugins[i])
		}
		for _, i := range l.regex {
			if l.list.Plugins[i].Matches(string(p.Name)) {
				matched = append(matched, l.list.Plugins[i])
			}
		}
		if len(matched) == 0 {
			continue
		}
		group := ""
		for _, e := range matched {
			if group == "" && e.Group != "" {
				group = e.Group
			}
			for _, f := range append(append([]File{}, e.After...), e.Req...) {
				if !holds(f.Condition) {
					continue
				}
				if q, ok := env.plugin(f.Name); ok && q.Name.Key() != p.Name.Key() {
					out.Data.Rules = append(out.Data.Rules, plugin.Rule{ID: plugin.ProvidedRuleID(SourceLoot, p.Name, q.Name), Plugin: p.Name, After: q.Name})
				}
			}
		}
		if group != "" {
			out.Data.Assignments[p.Name] = group
		}
		if !p.Enabled {
			continue
		}
		ref := event.EntityRef{Kind: "plugin", ID: p.Name.Key()}
		for _, e := range matched {
			for _, f := range e.Req {
				if holds(f.Condition) && !env.FileExists(f.Name) {
					add(diagnostic.Spec{
						Code: diagnostic.CodePluginRequirementMissing, Severity: diagnostic.SeverityError,
						Params:   diagnostic.Params{"plugin": string(p.Name), "file": display(f), "provider": ProviderName},
						Evidence: []diagnostic.Evidence{{Kind: "provider_requirement", Params: diagnostic.Params{"plugin": string(p.Name), "file": f.Name}}},
						Actions:  []diagnostic.Action{{ID: pluginhealth.ActionDisablePlugin, Target: &ref, Params: diagnostic.Params{"plugin": string(p.Name)}}},
						Related:  []event.EntityRef{ref, {Kind: "provider_file", ID: lower(f.Name)}},
					})
				}
			}
			for _, f := range e.Inc {
				if !holds(f.Condition) {
					continue
				}
				present := env.FileExists(f.Name)
				if q, ok := env.plugin(f.Name); ok {
					present = env.Active(string(q.Name))
				}
				if present {
					add(diagnostic.Spec{
						Code: diagnostic.CodePluginIncompatible, Severity: diagnostic.SeverityError,
						Params:   diagnostic.Params{"plugin": string(p.Name), "file": display(f), "provider": ProviderName},
						Evidence: []diagnostic.Evidence{{Kind: "provider_incompatibility", Params: diagnostic.Params{"plugin": string(p.Name), "file": f.Name}}},
						Actions:  []diagnostic.Action{{ID: pluginhealth.ActionDisablePlugin, Target: &ref, Params: diagnostic.Params{"plugin": string(p.Name)}}},
						Related:  []event.EntityRef{ref, {Kind: "provider_file", ID: lower(f.Name)}},
					})
				}
			}
			for _, m := range e.Msg {
				if holds(m.Condition) {
					add(messageSpec(m, lang, &p, ref))
				}
			}
			for _, d := range e.Dirty {
				if !holds(d.Condition) {
					continue
				}
				crc, err := env.Checksum(string(p.Name))
				if err != nil || crc != d.CRC {
					continue
				}
				add(diagnostic.Spec{
					Code: diagnostic.CodePluginDirty, Severity: diagnostic.SeverityWarning,
					Params: diagnostic.Params{
						"plugin": string(p.Name), "itm": strconv.Itoa(d.ITM), "udr": strconv.Itoa(d.UDR), "nav": strconv.Itoa(d.Nav),
						"util": PlainText(d.Util), "crc": strings.ToUpper(strconv.FormatUint(uint64(d.CRC), 16)), "provider": ProviderName,
					},
					Evidence: []diagnostic.Evidence{{Kind: "provider_dirty", Params: diagnostic.Params{"plugin": string(p.Name), "crc": strconv.FormatUint(uint64(d.CRC), 16)}}},
					Actions:  []diagnostic.Action{{ID: "plugins.show", NavigateTo: pluginhealth.NavigatePlugins, Params: diagnostic.Params{"plugin": string(p.Name)}}},
					Related:  []event.EntityRef{ref},
				})
			}
		}
	}
	// Global messages: only warnings and errors whose condition holds (the
	// "say" ones are news about LOOT itself).
	for _, m := range l.list.Globals {
		if (m.Type == "warn" || m.Type == "error") && strings.TrimSpace(m.Condition) != "" && holds(m.Condition) {
			add(messageSpec(m, lang, nil, event.EntityRef{Kind: "instance", ID: string(in.Instance.ID)}))
		}
	}
	return out
}

func display(f File) string {
	if f.Display != "" {
		return PlainText(f.Display)
	}
	return f.Name
}

// messageSpec turns a LOOT message into a diagnostic: say is info, warn a
// warning, error an error with "Disable" (or "Open plugins" for a message
// about no plugin).
func messageSpec(m Message, lang string, p *plugins.ProviderPlugin, ref event.EntityRef) diagnostic.Spec {
	text := PlainText(m.Text(lang))
	h := sha256.Sum256([]byte(m.Text("en")))
	sev := diagnostic.SeverityInfo
	switch m.Type {
	case "warn":
		sev = diagnostic.SeverityWarning
	case "error":
		sev = diagnostic.SeverityError
	}
	params := diagnostic.Params{"text": text, "provider": ProviderName, "type": m.Type}
	actions := []diagnostic.Action{{ID: "plugins.open", NavigateTo: pluginhealth.NavigatePlugins}}
	if p != nil {
		params["plugin"] = string(p.Name)
		actions = []diagnostic.Action{{ID: "plugins.show", NavigateTo: pluginhealth.NavigatePlugins, Params: diagnostic.Params{"plugin": string(p.Name)}}}
		if m.Type == "error" && !p.Implicit {
			actions = append([]diagnostic.Action{{ID: pluginhealth.ActionDisablePlugin, Target: &ref, Params: diagnostic.Params{"plugin": string(p.Name)}}}, actions...)
		}
	}
	return diagnostic.Spec{
		Code: diagnostic.CodePluginProviderMessage, Severity: sev, Params: params,
		Evidence: []diagnostic.Evidence{{Kind: "provider_message", Params: diagnostic.Params{"type": m.Type, "condition": m.Condition}}},
		Actions:  actions,
		Related:  []event.EntityRef{ref, {Kind: "provider_message", ID: hex.EncodeToString(h[:8])}},
	}
}

var (
	mdLink = regexp.MustCompile(`\[([^\]]+)\]\(([^)]+)\)`)
	mdBold = regexp.MustCompile(`\*\*([^*]+)\*\*|__([^_]+)__`)
)

// PlainText removes the Markdown of LOOT texts: links become "text (url)"
// and emphasis is dropped.
func PlainText(s string) string {
	s = mdLink.ReplaceAllStringFunc(s, func(m string) string {
		g := mdLink.FindStringSubmatch(m)
		if g[1] == g[2] {
			return g[2]
		}
		return g[1] + " (" + g[2] + ")"
	})
	s = mdBold.ReplaceAllString(s, "$1$2")
	return strings.TrimSpace(s)
}

// env answers the conditions for one evaluation.
type env struct {
	ctx     context.Context
	s       *Service
	fs      ports.FileReader
	dataDir string
	byKey   map[string]plugins.ProviderPlugin
	dirs    map[string][]string
}

func (s *Service) newEnv(ctx context.Context, in plugins.ProviderInput) *env {
	e := &env{ctx: ctx, s: s, fs: s.FS, dataDir: in.DataDir, byKey: map[string]plugins.ProviderPlugin{}, dirs: map[string][]string{}}
	for _, p := range in.Plugins {
		e.byKey[p.Name.Key()] = p
	}
	return e
}

func (e *env) plugin(name string) (plugins.ProviderPlugin, bool) {
	if strings.ContainsAny(name, `/\`) {
		return plugins.ProviderPlugin{}, false
	}
	p, ok := e.byKey[lower(name)]
	return p, ok
}

// abs resolves a data-relative path ("../" is the game root).
func (e *env) abs(rel string) string {
	rel = strings.ReplaceAll(rel, `\`, "/")
	base := e.dataDir
	for strings.HasPrefix(rel, "../") {
		rel = strings.TrimPrefix(rel, "../")
		if i := strings.LastIndexAny(base, `\/`); i > 0 {
			base = base[:i]
		}
	}
	return game.JoinPath(base, rel)
}

func (e *env) FileExists(path string) bool {
	if _, ok := e.plugin(path); ok {
		return true
	}
	if e.dataDir == "" || e.fs == nil {
		return false
	}
	info, err := e.fs.Stat(e.ctx, e.abs(path))
	return err == nil && info.Exists && !info.IsDir
}

func (e *env) list(dir string) []string {
	k := lower(dir)
	if names, ok := e.dirs[k]; ok {
		return names
	}
	var names []string
	if dir == "" {
		for _, p := range e.byKey {
			names = append(names, string(p.Name))
		}
	}
	if e.dataDir != "" && e.fs != nil {
		path := e.dataDir
		if dir != "" {
			path = e.abs(dir)
		}
		if entries, err := e.fs.ReadDir(e.ctx, path); err == nil {
			seen := map[string]bool{}
			for _, n := range names {
				seen[lower(n)] = true
			}
			for _, d := range entries {
				if !d.IsDir && !seen[lower(d.Name)] {
					names = append(names, d.Name)
				}
			}
		}
	}
	e.dirs[k] = names
	return names
}

func (e *env) CountFiles(dir string, re *regexp.Regexp) int {
	n := 0
	for _, name := range e.list(dir) {
		if re.MatchString(name) {
			n++
		}
	}
	return n
}

func (e *env) Readable(path string) bool {
	p := e.abs(path)
	if q, ok := e.plugin(path); ok && q.Path != "" {
		p = q.Path
	}
	if e.fs == nil {
		return false
	}
	f, err := e.fs.Open(e.ctx, p)
	if err != nil {
		return false
	}
	_ = f.Close()
	return true
}

func (e *env) Active(name string) bool {
	p, ok := e.plugin(name)
	return ok && p.Enabled
}

func (e *env) CountActive(re *regexp.Regexp) int {
	n := 0
	for _, p := range e.byKey {
		if p.Enabled && re.MatchString(string(p.Name)) {
			n++
		}
	}
	return n
}

func (e *env) IsMaster(path string) (bool, error) {
	p, ok := e.plugin(path)
	if !ok {
		return false, nil
	}
	return p.Header.Flags != nil && containsFlag(p.Header.Flags, "master"), nil
}

func containsFlag(fs []plugin.Flag, f plugin.Flag) bool {
	for _, x := range fs {
		if x == f {
			return true
		}
	}
	return false
}

func (e *env) Checksum(path string) (uint32, error) {
	p := e.abs(path)
	if q, ok := e.plugin(path); ok && q.Path != "" {
		p = q.Path
	}
	return e.s.checksum(e.ctx, p)
}

var versionRe = regexp.MustCompile(`(?i)(?:^|[\s(\[])v(?:ersion)?\s*[:.]?\s*(\d+(?:[._-]\d+)*[a-z]?)`)

func (e *env) Version(path string) (string, error) {
	p, ok := e.plugin(path)
	if !ok {
		return "", ErrUnsupported // executables and other files
	}
	m := versionRe.FindStringSubmatch(p.Header.Description)
	if m == nil {
		return "", ErrUnsupported
	}
	return m[1], nil
}

func (e *env) Description(path string) (string, error) {
	p, ok := e.plugin(path)
	if !ok {
		return "", ErrUnsupported
	}
	return p.Header.Description, nil
}

// checksum is the CRC-32 of a file, kept by path, size and modification
// time for the life of the app.
func (s *Service) checksum(ctx context.Context, path string) (uint32, error) {
	if s.FS == nil {
		return 0, ErrUnsupported
	}
	info, err := s.FS.Stat(ctx, path)
	if err != nil || !info.Exists || info.IsDir {
		return 0, ErrUnsupported
	}
	key := lower(path) + "|" + strconv.FormatInt(info.Size, 10) + "|" + strconv.FormatInt(info.ModTime.UnixNano(), 10)
	s.mu.Lock()
	c, ok := s.crcs[key]
	s.mu.Unlock()
	if ok {
		return c, nil
	}
	f, err := s.FS.Open(ctx, path)
	if err != nil {
		return 0, ErrUnsupported
	}
	defer f.Close()
	h := crc32.NewIEEE()
	if _, err := io.Copy(h, f); err != nil {
		return 0, ErrUnsupported
	}
	c = h.Sum32()
	s.mu.Lock()
	s.crcs[key] = c
	s.mu.Unlock()
	return c, nil
}

func readAll(ctx context.Context, fs ports.FileReader, path string) ([]byte, error) {
	f, err := fs.Open(ctx, path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(io.LimitReader(f, 64<<20))
}
