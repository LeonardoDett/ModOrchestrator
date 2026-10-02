package installer

import (
	"errors"
	"slices"
	"testing"

	"modorchestrator/internal/core/domain/game"
)

// bethesdaLike mimics what an adapter such as skyrimse declares.
func bethesdaLike() Context {
	return Context{
		Definition: game.Definition{
			ID: "g", Name: "G", Targets: []game.TargetID{"data", "root"},
			ModTypes: []game.ModType{
				{ID: game.DefaultModType, Target: "data"},
				{ID: "enb", Target: "root", Priority: 20, Detect: []game.DetectRule{{All: []string{"d3d11.dll", "enbseries.ini"}}}},
			},
		},
		Hints: RootHints{Dirs: []string{"meshes", "textures", "scripts"}, Extensions: []string{".esp", ".esm", ".bsa"}},
	}
}

func entries(t *testing.T, paths ...string) []Entry {
	t.Helper()
	raw := make([]RawEntry, len(paths))
	for i, p := range paths {
		raw[i] = RawEntry{Path: p, Size: 10}
		if p[len(p)-1] == '/' {
			raw[i] = RawEntry{Path: p, Dir: true}
		}
	}
	out, unsafe := Inspect(raw)
	if len(unsafe) > 0 {
		t.Fatalf("unexpected unsafe entries %v", unsafe)
	}
	return out
}

func dests(p *Plan) []string {
	var out []string
	for _, f := range p.Files {
		out = append(out, f.Dest.String())
	}
	return out
}

// INV-ID-04: an archive with a path escaping its root is refused as a whole
// and every bad entry is listed.
func TestInspectRefusesUnsafeEntries(t *testing.T) {
	_, unsafe := Inspect([]RawEntry{
		{Path: "textures/ok.dds"},
		{Path: "../evil.dll"},
		{Path: `C:\Windows\evil.dll`},
		{Path: "data/file.txt:stream"},
		{Path: "con.txt"},
		{Path: "link", Link: true},
	})
	var raws []string
	for _, u := range unsafe {
		raws = append(raws, u.Raw)
	}
	want := []string{"../evil.dll", `C:\Windows\evil.dll`, "data/file.txt:stream", "con.txt", "link"}
	if !slices.Equal(raws, want) {
		t.Fatalf("unsafe = %v, want %v", raws, want)
	}
}

func TestInspectAddsImpliedFoldersAndNormalises(t *testing.T) {
	es := entries(t, `Wrapper\textures\a.dds`, "./")
	var got []string
	for _, e := range es {
		got = append(got, e.Path.String())
	}
	if !slices.Equal(got, []string{"Wrapper", "Wrapper/textures", "Wrapper/textures/a.dds"}) {
		t.Fatalf("entries = %v", got)
	}
}

func TestLimits(t *testing.T) {
	es := entries(t, "a.esp", "b.esp")
	if _, err := (Limits{MaxEntries: 1}).Check(es, 1); err == nil {
		t.Fatal("expected entries limit")
	}
	var le *LimitError
	if _, err := (Limits{MaxSize: 15}).Check(es, 1); !errors.As(err, &le) || le.Limit != "size" {
		t.Fatalf("expected size limit, got %v", err)
	}
	if sus, _ := (Limits{SuspiciousRatio: 10}).Check(es, 1); !sus {
		t.Fatal("20 bytes from 1 should be suspicious")
	}
	if sus, _ := (Limits{SuspiciousRatio: 10}).Check(es, 0); sus {
		t.Fatal("folders are never suspicious")
	}
}

// core/02 §13: a wrapper folder is descended without asking.
func TestBasicDescendsWrapper(t *testing.T) {
	es := entries(t, "My Mod/readme.txt", "My Mod/My Mod/textures/a.dds", "My Mod/My Mod/plugin.esp", "My Mod/My Mod/fomod/info.xml")
	res, err := Basic{}.Plan(es, bethesdaLike(), nil)
	if err != nil || res.Plan == nil {
		t.Fatalf("plan: %v %+v", err, res)
	}
	if got := dests(res.Plan); !slices.Equal(got, []string{"plugin.esp", "textures/a.dds"}) {
		t.Fatalf("dests = %v", got)
	}
	if r, _ := res.Plan.Options.Root(); r != "My Mod/My Mod" {
		t.Fatalf("root option = %q", r)
	}
	if res.Plan.ModType != game.DefaultModType {
		t.Fatalf("mod type = %s", res.Plan.ModType)
	}
}

// core/02 §13: two option folders ask; the recorded answer does not ask again.
func TestBasicAsksForAmbiguousRootAndRepeatsTheAnswer(t *testing.T) {
	es := entries(t, "Option A/textures/a.dds", "Option B/textures/b.dds", "readme.md")
	res, err := Basic{}.Plan(es, bethesdaLike(), nil)
	if err != nil || res.Decision == nil || res.Decision.Kind != DecisionRootAmbiguous {
		t.Fatalf("expected ambiguous root, got %+v %v", res, err)
	}
	if !slices.Equal(res.Decision.Candidates, []string{"Option A", "Option B"}) {
		t.Fatalf("candidates = %v", res.Decision.Candidates)
	}
	res, err = Basic{}.Plan(es, bethesdaLike(), Options{OptionRoot: "Option B"})
	if err != nil || res.Plan == nil {
		t.Fatalf("plan with root: %v", err)
	}
	if got := dests(res.Plan); !slices.Equal(got, []string{"textures/b.dds"}) {
		t.Fatalf("dests = %v", got)
	}
	if _, err := (Basic{}).Plan(es, bethesdaLike(), Options{OptionRoot: "Gone"}); !errors.Is(err, ErrInvalidOption) {
		t.Fatalf("stale root must fail, got %v", err)
	}
}

func TestBasicPicksTheOnlyRecognisedBranch(t *testing.T) {
	es := entries(t, "Docs/manual.pdf", "Data/meshes/a.nif")
	res, _ := Basic{}.Plan(es, bethesdaLike(), nil)
	if res.Plan == nil || !slices.Equal(dests(res.Plan), []string{"meshes/a.nif"}) {
		t.Fatalf("plan = %+v", res)
	}
}

func TestBasicUnrecognisedAsksAndCanInstallAsIs(t *testing.T) {
	es := entries(t, "Stuff/thing.dat")
	res, _ := Basic{}.Plan(es, bethesdaLike(), nil)
	if res.Decision == nil || res.Decision.Kind != DecisionRootUnrecognized || !slices.Equal(res.Decision.Candidates, []string{"Stuff"}) {
		t.Fatalf("decision = %+v", res.Decision)
	}
	res, _ = Basic{}.Plan(es, bethesdaLike(), Options{OptionRoot: ""})
	if res.Plan == nil || !slices.Equal(dests(res.Plan), []string{"Stuff/thing.dat"}) {
		t.Fatalf("as-is plan = %+v", res)
	}
}

// Generic games declare nothing to recognise: the unwrapped level installs.
func TestBasicWithoutHintsInstallsUnwrappedLevel(t *testing.T) {
	ctx := Context{Definition: game.Definition{ID: "x", Name: "X", Targets: []game.TargetID{"mods"}, ModTypes: []game.ModType{{ID: game.DefaultModType, Target: "mods"}}}}
	es := entries(t, "Wrap/a.pak", "Wrap/b/c.pak")
	res, _ := Basic{}.Plan(es, ctx, nil)
	if res.Plan == nil || !slices.Equal(dests(res.Plan), []string{"a.pak", "b/c.pak"}) {
		t.Fatalf("plan = %+v", res)
	}
}

func TestBasicDetectsModTypeFromFootprint(t *testing.T) {
	es := entries(t, "ENB Preset/d3d11.dll", "ENB Preset/enbseries.ini", "ENB Preset/enbseries/effect.fx")
	res, _ := Basic{}.Plan(es, bethesdaLike(), nil)
	if res.Plan == nil || res.Plan.ModType != "enb" {
		t.Fatalf("plan = %+v", res)
	}
	if !slices.Equal(dests(res.Plan), []string{"d3d11.dll", "enbseries.ini", "enbseries/effect.fx"}) {
		t.Fatalf("dests = %v", dests(res.Plan))
	}
}

// core/03 §7: a C# script is never run; the user picks a folder and the
// basic installer installs it.
func TestFomodScriptAsksForFolder(t *testing.T) {
	es := entries(t, "fomod/script.cs", "Core/textures/a.dds", "Option/textures/b.dds")
	if ok, why := (Fomod{}).Supports(es, bethesdaLike()); !ok || why != "fomod/script.cs" {
		t.Fatalf("supports = %v %q", ok, why)
	}
	res, err := Fomod{}.Plan(es, bethesdaLike(), nil)
	if err != nil || res.Decision == nil || res.Decision.Kind != DecisionFomodScript {
		t.Fatalf("decision = %+v, %v", res.Decision, err)
	}
	res, _ = Fomod{}.Plan(es, bethesdaLike(), Options{OptionRoot: "Core"})
	if res.Plan == nil || res.Plan.Installer != BasicID || !slices.Equal(dests(res.Plan), []string{"textures/a.dds"}) {
		t.Fatalf("plan = %+v", res)
	}
}

func TestNoInstallableFiles(t *testing.T) {
	es := entries(t, "empty/")
	if _, err := (Basic{}).Plan(es, bethesdaLike(), Options{OptionRoot: "empty"}); !errors.Is(err, ErrNoInstallableFiles) {
		t.Fatalf("err = %v", err)
	}
}

// INV-LIB-02: a plan never has two files on one destination.
func TestFinishKeepsLastOnSameDestination(t *testing.T) {
	es := entries(t, "a/x.esp", "b/X.ESP")
	p, err := Finish(&Plan{Files: []File{{Source: es[1].Path, Dest: es[1].Path}, {Source: es[3].Path, Dest: es[1].Path}}})
	if err != nil || len(p.Files) != 1 || p.Files[0].Source.String() != "b/X.ESP" {
		t.Fatalf("finish = %+v %v", p, err)
	}
}

type fake struct {
	id       string
	priority int
	ok       bool
}

func (f fake) ID() string                                     { return f.id }
func (f fake) Priority() int                                  { return f.priority }
func (f fake) Supports([]Entry, Context) (bool, string)       { return f.ok, f.id }
func (f fake) Plan([]Entry, Context, Options) (Result, error) { return Result{}, nil }

func TestSelectHonoursPriorityAndForce(t *testing.T) {
	stack := []Installer{Basic{}, fake{id: "adapter", priority: 20, ok: true}, fake{id: "never", priority: 10}}
	sel, err := Select(stack, nil, Context{}, "")
	if err != nil || sel.Installer.ID() != "adapter" {
		t.Fatalf("select = %v %v", sel, err)
	}
	sel, _ = Select(stack, nil, Context{}, BasicID)
	if sel.Installer.ID() != BasicID || sel.Reason != "forced" {
		t.Fatalf("forced = %v", sel)
	}
}

func TestNameFromArchive(t *testing.T) {
	cases := map[string]Metadata{
		"Unofficial Patch-266-4-3-2-1690000000.7z": {Name: "Unofficial Patch", Version: "4.3.2"},
		"SkyUI_5_2_SE-12604-5-2SE-1573337209.zip":  {Name: "SkyUI_5_2_SE", Version: "5.2SE"},
		"Cool Mod v1.2.3.rar":                      {Name: "Cool Mod", Version: "1.2.3"},
		"Plain":                                    {Name: "Plain"},
	}
	for in, want := range cases {
		if got := NameFromArchive(in); got != want {
			t.Errorf("%s: got %+v want %+v", in, got, want)
		}
	}
}

func TestParseInfoXMLEncodings(t *testing.T) {
	utf8 := []byte(`<?xml version="1.0" encoding="UTF-8"?><fomod><Name>Mod É</Name><Author>A</Author><Version>1.0</Version></fomod>`)
	m, err := ParseInfoXML(utf8)
	if err != nil || m.Name != "Mod É" || m.Version != "1.0" || m.Author != "A" {
		t.Fatalf("utf8: %+v %v", m, err)
	}
	cp := []byte("<?xml version=\"1.0\" encoding=\"Windows-1252\"?><fomod><Name>Caf\xe9 \x93x\x94</Name></fomod>")
	if m, err := ParseInfoXML(cp); err != nil || m.Name != "Café “x”" {
		t.Fatalf("cp1252: %+v %v", m, err)
	}
	s := `<?xml version="1.0" encoding="UTF-16"?><fomod><Name>Wide</Name></fomod>`
	u16 := []byte{0xFF, 0xFE}
	for _, r := range s {
		u16 = append(u16, byte(r), 0)
	}
	if m, err := ParseInfoXML(u16); err != nil || m.Name != "Wide" {
		t.Fatalf("utf16: %+v %v", m, err)
	}
	if _, err := ParseInfoXML([]byte("<fomod><Name>")); !errors.Is(err, ErrInvalidXML) {
		t.Fatalf("broken xml: %v", err)
	}
}
