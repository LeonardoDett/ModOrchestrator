package integration_test

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"

	"modorchestrator/internal/core/domain/fomod"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/installer"
	"modorchestrator/internal/core/domain/relpath"
)

// update rewrites the expected plans: go test ./internal/integration -run RealFomod -update
// Review every changed file before committing it.
var update = flag.Bool("update", false, "rewrite testdata/fomod/*/expected")

// fomodData holds the real FOMOD fixtures (core/03 §9).
const fomodData = "testdata/fomod"

// fixtureCase is one row of testdata/fomod/cases.json: a real FOMOD (taken from
// a Skyrim SE archive by tools/fomodfixtures), an env and a selection.
type fixtureCase struct {
	Fixture string              `json:"fixture"`
	Name    string              `json:"name"`
	Game    string              `json:"game"`
	Files   map[string]string   `json:"files"`
	Select  []fixtureSelection  `json:"select"`
	Expect  map[string]yesOrNot `json:"expect"`
	Covers  []string            `json:"covers"`
}

type fixtureSelection struct {
	Step    int   `json:"step"`
	Group   int   `json:"group"`
	Options []int `json:"options"`
}

// yesOrNot asserts that a destination is (true) or is not (false) planned.
type yesOrNot bool

func loadCases(t *testing.T) []fixtureCase {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(fomodData, "cases.json"))
	if err != nil {
		t.Fatal(err)
	}
	var cases []fixtureCase
	if err := json.Unmarshal(b, &cases); err != nil {
		t.Fatal(err)
	}
	return cases
}

// loadFixture reads the archive listing and the FOMOD of a fixture.
func loadFixture(t *testing.T, name string) ([]installer.Entry, installer.Context) {
	t.Helper()
	dir := filepath.Join(fomodData, name)
	f, err := os.Open(filepath.Join(dir, "entries.txt"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	var raw []installer.RawEntry
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasSuffix(line, "/") {
			raw = append(raw, installer.RawEntry{Path: line, Dir: true})
			continue
		}
		p, size, _ := strings.Cut(line, "\t")
		n, _ := strconv.ParseInt(size, 10, 64)
		raw = append(raw, installer.RawEntry{Path: p, Size: n})
	}
	entries, unsafe := installer.Inspect(raw)
	if len(unsafe) > 0 {
		t.Fatalf("%s: unsafe entries %v", name, unsafe)
	}
	ctx := installer.Context{
		Definition: skyrimLike(),
		// Only the XML files of fomod/ were kept in the fixture.
		Content: func(p relpath.Path) ([]byte, error) {
			segs := strings.Split(p.String(), "/")
			return os.ReadFile(filepath.Join(dir, "fomod", fixtureName(segs[len(segs)-1])))
		},
	}
	return entries, ctx
}

func fixtureName(base string) string {
	switch strings.ToLower(base) {
	case "moduleconfig.xml":
		return "ModuleConfig.xml"
	case "info.xml":
		return "info.xml"
	}
	return strings.ToLower(base)
}

func skyrimLike() game.Definition {
	return game.Definition{
		ID: "skyrimse", Name: "Skyrim", Targets: []game.TargetID{"data", "root"},
		ModTypes: []game.ModType{
			{ID: game.DefaultModType, Target: "data"},
			{ID: "enb", Target: "root", Priority: 20, Detect: []game.DetectRule{{All: []string{"d3d11.dll", "enbseries.ini"}}}},
		},
	}
}

func (c fixtureCase) env() fomod.Env {
	env := fomod.Env{GameVersion: c.Game, ManagerVersion: "1.0.0", Files: map[string]fomod.FileState{}}
	for f, s := range c.Files {
		env.Files[fomod.FileKey(f)] = fomod.FileState(s)
	}
	return env
}

func (c fixtureCase) selection() fomod.Selection {
	sel := fomod.Selection{}
	for _, s := range c.Select {
		sel[fomod.GroupKey{Step: s.Step, Group: s.Group}] = s.Options
	}
	return sel
}

// render is the comparable form of a plan: visible steps, flags, warnings,
// requirements, the recorded options and every file.
func render(p *installer.Plan, st *fomod.State) string {
	var b strings.Builder
	var visible []string
	for _, s := range st.VisibleSteps() {
		visible = append(visible, strconv.Itoa(s.Index))
	}
	fmt.Fprintf(&b, "# visible steps: %s\n", strings.Join(visible, ","))
	var flags []string
	for k, v := range st.Flags {
		flags = append(flags, k+"="+v)
	}
	slices.Sort(flags)
	fmt.Fprintf(&b, "# flags: %s\n", strings.Join(flags, " "))
	for _, w := range p.Warnings {
		var ps []string
		for k, v := range w.Params {
			ps = append(ps, k+"="+v)
		}
		slices.Sort(ps)
		fmt.Fprintf(&b, "# warning: %s %s\n", w.Code, strings.Join(ps, " "))
	}
	fmt.Fprintf(&b, "# requirements: %s\n", strings.Join(p.Requirements, ", "))
	fmt.Fprintf(&b, "# mod type: %s\n", p.ModType)
	fmt.Fprintf(&b, "# options: %s\n", p.Options[installer.OptionFomod])
	for _, f := range p.Files {
		fmt.Fprintf(&b, "%s <- %s (%d)\n", f.Dest, f.Source, f.Size)
	}
	return b.String()
}

// core/03 §9: for each real FOMOD and selection the plan is identical to
// the expected one, and the cases together cover every group type, flags,
// conditionalFileInstalls, fileDependency and invisible steps.
func TestRealFomodFixtures(t *testing.T) {
	cases := loadCases(t)
	fixtures := map[string]bool{}
	covered := map[string]bool{}
	for _, c := range cases {
		t.Run(c.Fixture+"/"+c.Name, func(t *testing.T) {
			fixtures[c.Fixture] = true
			entries, ctx := loadFixture(t, c.Fixture)
			ctx.Fomod = c.env()
			pkg, err := installer.LoadFomod(entries, ctx)
			if err != nil || pkg == nil {
				t.Fatalf("load: %v", err)
			}
			plan, st, err := installer.FomodPlan(pkg, entries, ctx, c.selection())
			if err != nil {
				t.Fatalf("plan: %v", err)
			}
			got := render(plan, st)
			golden := filepath.Join(fomodData, c.Fixture, "expected", c.Name+".txt")
			if *update {
				if err := os.MkdirAll(filepath.Dir(golden), 0o755); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(golden, []byte(got), 0o644); err != nil {
					t.Fatal(err)
				}
			}
			want, err := os.ReadFile(golden)
			if err != nil {
				t.Fatalf("missing expected plan (run with -update and review): %v", err)
			}
			if got != strings.ReplaceAll(string(want), "\r\n", "\n") {
				t.Errorf("plan differs from %s:\n%s", golden, got)
			}
			for dest, want := range c.Expect {
				has := slices.ContainsFunc(plan.Files, func(f installer.File) bool { return f.Dest.Key() == strings.ToLower(dest) })
				if has != bool(want) {
					t.Errorf("destination %s planned = %v, want %v", dest, has, want)
				}
			}
			for _, k := range c.Covers {
				covered[k] = true
			}

			// Determinism and reinstall: the recorded options reproduce the
			// same plan without asking (core/03 §9).
			res, err := installer.Fomod{}.Plan(entries, ctx, plan.Options)
			if err != nil || res.Plan == nil {
				t.Fatalf("replan: %+v %v", res, err)
			}
			if again := render(res.Plan, st); again != got {
				t.Errorf("recorded options give another plan:\n%s", again)
			}
		})
	}
	if len(fixtures) < 10 {
		t.Errorf("only %d real FOMODs, core/03 §9 asks for at least 10", len(fixtures))
	}
	for _, k := range []string{
		"SelectExactlyOne", "SelectAtMostOne", "SelectAtLeastOne", "SelectAll", "SelectAny",
		"flags", "conditionalFileInstalls", "fileDependency", "invisibleStep", "gameDependency", "typeDescriptor",
	} {
		if !covered[k] {
			t.Errorf("no fixture case covers %s", k)
		}
	}
}
