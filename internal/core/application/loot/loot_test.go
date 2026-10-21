package loot

import (
	"context"
	"errors"
	"fmt"
	"hash/crc32"
	"regexp"
	"strings"
	"testing"
	"time"

	"modorchestrator/internal/core/application/plugins"
	"modorchestrator/internal/core/application/ports"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/testutil/memfs"
)

const data = `C:\Game\Data`

const sample = `
prelude:
  common:
    - &dirtyNote
      type: say
      content: 'old'
common:
  - &cleanIt
    util: '[xEdit](https://example.org/xedit)'
groups:
  - name: &early Early Loaders
  - name: default
    after: [ *early ]
  - name: &late Late
    after: [ default ]
globals:
  - type: warn
    content: 'Game too old'
    condition: 'file("../Old.exe")'
  - type: say
    content: 'Read the news'
plugins:
  - name: 'Base.esm'
    group: *early
  - name: 'Patch.esp'
    group: *late
    after: [ 'Mod A.esp' ]
    req:
      - name: 'Needed.esp'
        display: '[Needed Mod](https://example.org/needed)'
    inc: [ 'Rival.esp' ]
    msg:
      - type: error
        content:
          - lang: en
            text: 'Delete. Already in {0}.'
          - lang: pt_BR
            text: 'Exclua. Já está em {0}.'
        subs: [ '**Big Mod**' ]
        condition: 'active("Big Mod.esp")'
      - type: say
        content: 'Never shown'
        condition: 'product_version("../Game.exe", "1.0", >=)'
  - name: 'Mod [AB]\.esp'
    after:
      - name: 'Base.esm'
        condition: 'not file("NoBase.txt")'
  - name: 'Dirty.esp'
    dirty:
      - <<: *cleanIt
        crc: 0x%s
        itm: 12
        udr: 3
`

type fakeAdapter struct{ lg bool }

func (fakeAdapter) Name() string    { return "fake" }
func (fakeAdapter) Version() string { return "1" }
func (fakeAdapter) Definitions() []game.Definition {
	return nil
}
func (fakeAdapter) InstanceDefinition(id game.ID, _ []game.Target) (game.Definition, error) {
	return game.Definition{ID: id, Capabilities: game.NewCapabilities(game.CapPlugins)}, nil
}
func (fakeAdapter) ValidateRoot(context.Context, ports.FileReader, game.ID, string) error { return nil }
func (fakeAdapter) Targets(game.ID, string, []game.TargetSpec) ([]game.Target, error) {
	return nil, nil
}
func (fakeAdapter) RootHints(game.ID) ports.RootHints                       { return ports.RootHints{} }
func (fakeAdapter) ContentFlags(game.ID, []game.Location) []mod.ContentFlag { return nil }

type lootAdapter struct {
	fakeAdapter
	ml []byte
}

func (a lootAdapter) LootGame(game.ID) (ports.LootGame, bool) {
	return ports.LootGame{Repository: "sample", Folder: "Sample", Masterlist: a.ml, Date: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}, true
}

type settings map[string]string

func (s settings) AppValue(_ context.Context, key string) (appsettings.Effective, error) {
	return appsettings.Effective{Value: s[key]}, nil
}
func (s settings) InstanceValue(_ context.Context, _, key string) (appsettings.Effective, error) {
	v, ok := s[key]
	if !ok {
		return appsettings.Effective{}, errors.New("unset")
	}
	return appsettings.Effective{Value: v}, nil
}

type clock struct{ t time.Time }

func (c clock) Now() time.Time { return c.t }

func setup(t *testing.T) (*Service, *memfs.FS, lootAdapter) {
	t.Helper()
	fs := memfs.New("C:")
	fs.AddDir(data)
	fs.AddFile(data+`\Dirty.esp`, "dirty bytes")
	crc := fmt.Sprintf("%08X", crc32.ChecksumIEEE([]byte("dirty bytes")))
	ad := lootAdapter{ml: []byte(strings.Replace(sample, "0x%s", "0x"+crc, 1))}
	s := New(Deps{FS: fs, Settings: settings{"ui.language": "pt-BR"}, Clock: clock{time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)}, Dir: `C:\AppData\loot`})
	return s, fs, ad
}

func input(ad ports.GameAdapter, ps ...plugins.ProviderPlugin) plugins.ProviderInput {
	return plugins.ProviderInput{Instance: game.Instance{ID: "i1", Game: "g"}, Adapter: ad, DataDir: data, Plugins: ps}
}

func pl(name string, on bool) plugins.ProviderPlugin {
	return plugins.ProviderPlugin{Name: plugin.Name(name), Enabled: on, Path: data + `\` + name}
}

func codes(ds []diagnostic.Diagnostic) map[diagnostic.Code][]diagnostic.Diagnostic {
	out := map[diagnostic.Code][]diagnostic.Diagnostic{}
	for _, d := range ds {
		out[d.Code] = append(out[d.Code], d)
	}
	return out
}

func TestProvideRulesGroupsAndDiagnostics(t *testing.T) {
	s, _, ad := setup(t)
	out, ok, err := s.Provide(context.Background(), input(ad,
		pl("Base.esm", true), pl("Mod A.esp", true), pl("Mod B.esp", false), pl("Patch.esp", true),
		pl("Big Mod.esp", true), pl("Rival.esp", true), pl("Dirty.esp", true),
	))
	if err != nil || !ok {
		t.Fatalf("provide: %v %v", ok, err)
	}
	d := out.Data
	if d.Source != SourceLoot || d.Assignments["Base.esm"] != "Early Loaders" || d.Assignments["Patch.esp"] != "Late" {
		t.Fatalf("assignments: %+v", d.Assignments)
	}
	if len(d.Groups) != 3 || d.Groups[1].Name != plugin.DefaultGroup || d.Groups[1].After[0] != "Early Loaders" {
		t.Fatalf("groups: %+v", d.Groups)
	}
	want := map[plugin.RuleID]bool{
		plugin.ProvidedRuleID(SourceLoot, "Patch.esp", "Mod A.esp"): true,
		plugin.ProvidedRuleID(SourceLoot, "Mod A.esp", "Base.esm"):  true, // regex entry
		plugin.ProvidedRuleID(SourceLoot, "Mod B.esp", "Base.esm"):  true, // inactive plugins still order
	}
	for _, r := range d.Rules {
		if !want[r.ID] {
			t.Errorf("unexpected rule %s", r.ID)
		}
		delete(want, r.ID)
	}
	if len(want) != 0 {
		t.Errorf("missing rules %v", want)
	}
	c := codes(out.Diagnostics)
	if len(c[diagnostic.CodePluginRequirementMissing]) != 1 || c[diagnostic.CodePluginRequirementMissing][0].Params["file"] != "Needed Mod (https://example.org/needed)" {
		t.Errorf("req: %+v", c[diagnostic.CodePluginRequirementMissing])
	}
	if len(c[diagnostic.CodePluginIncompatible]) != 1 {
		t.Errorf("inc: %+v", c[diagnostic.CodePluginIncompatible])
	}
	msgs := c[diagnostic.CodePluginProviderMessage]
	if len(msgs) != 1 || msgs[0].Params["text"] != "Exclua. Já está em Big Mod." || msgs[0].Severity != diagnostic.SeverityError || msgs[0].Actions[0].ID != "plugins.disable" {
		t.Errorf("messages (pt-BR, subs, markdown, unsupported condition hidden): %+v", msgs)
	}
	dirty := c[diagnostic.CodePluginDirty]
	if len(dirty) != 1 || dirty[0].Params["itm"] != "12" || dirty[0].Params["util"] != "xEdit (https://example.org/xedit)" {
		t.Errorf("dirty: %+v", dirty)
	}
}

func TestGlobalMessagesAndConditionsOnDisk(t *testing.T) {
	s, fs, ad := setup(t)
	fs.AddFile(`C:\Game\Old.exe`, "x")
	fs.AddFile(data+`\NoBase.txt`, "x")
	out, _, err := s.Provide(context.Background(), input(ad, pl("Base.esm", true), pl("Mod A.esp", true)))
	if err != nil {
		t.Fatal(err)
	}
	c := codes(out.Diagnostics)
	if m := c[diagnostic.CodePluginProviderMessage]; len(m) != 1 || m[0].Params["text"] != "Game too old" || m[0].Severity != diagnostic.SeverityWarning {
		t.Fatalf("global warn with a condition on the game root: %+v", m)
	}
	if len(out.Data.Rules) != 0 {
		t.Fatalf("the after with a false condition must not apply: %+v", out.Data.Rules)
	}
}

func TestProviderOffOrWithoutLootData(t *testing.T) {
	s, _, ad := setup(t)
	s.Settings = settings{SettingKey: "false"}
	if _, ok, _ := s.Provide(context.Background(), input(ad, pl("Base.esm", true))); ok {
		t.Fatal("setting off: no data")
	}
	s.Settings = settings{}
	if _, ok, _ := s.Provide(context.Background(), input(fakeAdapter{}, pl("Base.esm", true))); ok {
		t.Fatal("a game without LOOT data (generic) gets nothing")
	}
}

type fetcher map[string]string

func (f fetcher) Fetch(_ context.Context, url string) ([]byte, error) {
	v, ok := f[url]
	if !ok {
		return nil, errors.New("404")
	}
	return []byte(v), nil
}

type instances struct{ inst game.Instance }

func (i instances) Get(_ context.Context, id game.InstanceID) (game.Instance, error) {
	if id != i.inst.ID {
		return game.Instance{}, ports.ErrNotFound
	}
	return i.inst, nil
}

type registry struct{ a ports.GameAdapter }

func (r registry) ByName(string) (ports.GameAdapter, bool) { return r.a, true }

func TestUpdateMasterlistOnlyReplacesWithValidData(t *testing.T) {
	s, fs, ad := setup(t)
	s.Instances = instances{game.Instance{ID: "i1", Game: "g", Adapter: "fake"}}
	s.Registry = registry{ad}
	ctx := context.Background()
	st, err := s.Status(ctx, "i1")
	if err != nil || !st.Supported || st.Source.Kind != "bundled" || st.CanUpdate {
		t.Fatalf("status before: %+v %v", st, err)
	}
	newer := sample + "\n  - name: 'New.esp'\n    group: *late\n"
	s.Fetcher = fetcher{masterlistURL("sample"): "plugins: [ broken", preludeURL(): ""}
	if _, err := s.UpdateMasterlist(ctx, "i1"); err == nil {
		t.Fatal("a masterlist that does not parse must be refused")
	}
	s.Fetcher = fetcher{masterlistURL("sample"): strings.Replace(newer, "0x%s", "0x1", 1), preludeURL(): ""}
	st, err = s.UpdateMasterlist(ctx, "i1")
	if err != nil || st.Source.Kind != "downloaded" {
		t.Fatalf("after update: %+v %v", st, err)
	}
	if !fs.Exists(`C:\AppData\loot\sample\masterlist.yaml`) {
		t.Fatal("download not stored")
	}
	out, _, _ := s.Provide(ctx, input(ad, pl("New.esp", true)))
	if out.Data.Assignments["New.esp"] != "Late" {
		t.Fatalf("downloaded data not used: %+v", out.Data.Assignments)
	}
	// A new app version with a newer shipped copy wins over an old download.
	s.Clock = clock{time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)}
	_, _ = s.UpdateMasterlist(ctx, "i1")
	if st, _ := s.Status(ctx, "i1"); st.Source.Kind != "bundled" {
		t.Fatalf("older download must not win: %+v", st)
	}
}

func TestConditions(t *testing.T) {
	cases := map[string]bool{
		``:                                   true,
		`active("A.esp")`:                    true,
		`not active("A.esp")`:                false,
		`active("B.esp") or active("A.esp")`: true,
		`active("A.esp") and (file("missing.esp") or many("[AB]\.esp"))`: true,
		`many_active("[AB]\.esp")`:                                       false,
		`version("A.esp", "1.2", >=) and version("A.esp", "1.10", <)`:    true,
		`version("Gone.esp", "1.0", <)`:                                  true,
		`checksum("A.esp", DEADBEEF)`:                                    true,
		`is_master("A.esp")`:                                             true,
		`description_contains("A.esp", "great")`:                         true,
	}
	e := testEnv{}
	for c, want := range cases {
		pc, err := ParseCondition(c)
		if err != nil {
			t.Fatalf("%s: %v", c, err)
		}
		got, err := pc.Eval(e)
		if err != nil || got != want {
			t.Errorf("%s = %v (%v), want %v", c, got, err, want)
		}
	}
	pc, _ := ParseCondition(`not product_version("../Game.exe", "1.0", >=)`)
	if v, err := pc.Eval(e); v || !errors.Is(err, ErrUnsupported) {
		t.Error("an unsupported function is never true, even negated")
	}
	if _, err := ParseCondition(`active("A.esp"`); err == nil {
		t.Error("unbalanced condition must fail")
	}
}

type testEnv struct{}

func (testEnv) FileExists(p string) bool { return p == "A.esp" || p == "B.esp" }
func (testEnv) CountFiles(_ string, re *regexp.Regexp) int {
	n := 0
	for _, f := range []string{"A.esp", "B.esp"} {
		if re.MatchString(f) {
			n++
		}
	}
	return n
}
func (testEnv) Readable(string) bool { return true }
func (testEnv) Active(n string) bool { return n == "A.esp" }
func (testEnv) CountActive(re *regexp.Regexp) int {
	return map[bool]int{true: 1}[re.MatchString("A.esp")]
}
func (testEnv) IsMaster(p string) (bool, error)    { return p == "A.esp", nil }
func (testEnv) Checksum(string) (uint32, error)    { return 0xDEADBEEF, nil }
func (testEnv) Version(string) (string, error)     { return "1.5", nil }
func (testEnv) Description(string) (string, error) { return "A great mod", nil }

func TestCompareVersions(t *testing.T) {
	for _, c := range []struct {
		a, b string
		want int
	}{{"1.10", "1.9", 1}, {"1.0", "1", 0}, {"1.0.0-beta", "1.0.0", -1}, {"2.1a", "2.1b", -1}} {
		if got := CompareVersions(c.a, c.b); got != c.want {
			t.Errorf("%s vs %s = %d", c.a, c.b, got)
		}
	}
}

func TestPlainText(t *testing.T) {
	if got := PlainText("See [the guide](https://x.org) and **this** or [https://y.org](https://y.org)."); got != "See the guide (https://x.org) and this or https://y.org." {
		t.Fatal(got)
	}
}

func TestUserlistConversion(t *testing.T) {
	m, err := Parse([]byte(`
groups:
  - name: Mine
    after: [ default ]
plugins:
  - name: 'B.esp'
    group: Mine
    after: [ 'A.esp', { name: 'C.esp', condition: 'active("X.esp")' } ]
    req: [ 'D.esp', 'meshes/x.nif' ]
  - name: 'E.*\.esp'
    after: [ 'A.esp' ]
`), nil)
	if err != nil {
		t.Fatal(err)
	}
	in := Imported(m)
	if len(in.Groups) != 1 || in.Assignments["B.esp"] != "Mine" {
		t.Fatalf("groups: %+v %+v", in.Groups, in.Assignments)
	}
	if len(in.Rules) != 2 || in.Rules[0].After != "A.esp" || in.Rules[1].After != "D.esp" {
		t.Fatalf("rules (no condition, no regex, no file path): %+v", in.Rules)
	}
}
