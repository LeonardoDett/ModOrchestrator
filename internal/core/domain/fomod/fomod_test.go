package fomod

import (
	"errors"
	"slices"
	"strings"
	"testing"
	"unicode/utf16"

	"modorchestrator/internal/core/domain/relpath"
)

const sample = `<?xml version="1.0" encoding="UTF-8"?>
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <moduleName>Sample</moduleName>
  <moduleImage path="fomod\images\header.png"/>
  <requiredInstallFiles>
    <file source="core\a.esp" destination="a.esp" priority="9"/>
  </requiredInstallFiles>
  <installSteps>
    <installStep name="Zeta">
      <optionalFileGroups order="Explicit">
        <group name="Body" type="SelectExactlyOne">
          <plugins order="Explicit">
            <plugin name="Slim">
              <description>Slim body</description>
              <files><folder source="slim" destination=""/></files>
              <conditionFlags><flag name="body">slim</flag></conditionFlags>
              <typeDescriptor><type name="Optional"/></typeDescriptor>
            </plugin>
            <plugin name="Curvy">
              <description>Curvy</description>
              <files><folder source="curvy"/></files>
              <conditionFlags><flag name="body">curvy</flag></conditionFlags>
              <typeDescriptor><type name="Recommended"/></typeDescriptor>
            </plugin>
          </plugins>
        </group>
        <group name="Extras" type="SelectAny">
          <plugins order="Explicit">
            <plugin name="Broken">
              <description/>
              <files><file source="extras\x.txt" destination="x.txt" installIfUsable="true"/></files>
              <typeDescriptor><dependencyType><defaultType name="Optional"/>
                <patterns><pattern><dependencies><fileDependency file="Needed.esp" state="Missing"/></dependencies><type name="NotUsable"/></pattern></patterns>
              </dependencyType></typeDescriptor>
            </plugin>
            <plugin name="Always">
              <description/>
              <files><file source="extras\always.txt" destination="always.txt" alwaysInstall="true"/></files>
              <typeDescriptor><type name="Optional"/></typeDescriptor>
            </plugin>
          </plugins>
        </group>
      </optionalFileGroups>
    </installStep>
    <installStep name="Alpha">
      <visible><flagDependency flag="body" value="curvy"/></visible>
      <optionalFileGroups>
        <group name="Physics" type="SelectAtMostOne">
          <plugins>
            <plugin name="Physics B"><description/><files><file source="phys\b.ini" destination="core.ini" priority="0"/></files><typeDescriptor><type name="Optional"/></typeDescriptor></plugin>
            <plugin name="Physics A"><description/><files><file source="phys\a.ini" destination="core.ini" priority="1"/></files><typeDescriptor><type name="Optional"/></typeDescriptor></plugin>
          </plugins>
        </group>
      </optionalFileGroups>
    </installStep>
  </installSteps>
  <conditionalFileInstalls>
    <patterns>
      <pattern>
        <dependencies operator="Or">
          <flagDependency flag="body" value="curvy"/>
          <gameDependency version="9.0"/>
        </dependencies>
        <files><file source="core\patch.esp" destination="a.esp" priority="-5"/></files>
      </pattern>
    </patterns>
  </conditionalFileInstalls>
</config>`

func mustParse(t *testing.T, xml string) *Module {
	t.Helper()
	m, err := Parse([]byte(xml))
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func archive(paths ...string) []ArchiveFile {
	var out []ArchiveFile
	for _, p := range paths {
		out = append(out, ArchiveFile{Path: relpath.MustParse(p), Size: 1})
	}
	return out
}

func dests(rs []Resolved) []string {
	var out []string
	for _, r := range rs {
		out = append(out, r.Dest.String()+"<"+r.Source.String())
	}
	return out
}

func TestParseOrdersAndPaths(t *testing.T) {
	m := mustParse(t, sample)
	if m.Name != "Sample" || m.Image != "fomod/images/header.png" {
		t.Fatalf("module = %q %q", m.Name, m.Image)
	}
	// installSteps has no order: the schema default (Ascending) applies.
	if m.Steps[0].Name != "Alpha" || m.Steps[1].Name != "Zeta" {
		t.Fatalf("steps = %q, %q", m.Steps[0].Name, m.Steps[1].Name)
	}
	if o := m.Steps[0].Groups[0].Options; o[0].Name != "Physics A" {
		t.Fatalf("ascending options = %q", o[0].Name)
	}
	if o := m.Steps[1].Groups[0].Options; o[0].Name != "Slim" {
		t.Fatalf("explicit options = %q", o[0].Name)
	}
	if f := m.Required[0]; f.Source != "core/a.esp" || f.Priority != 9 {
		t.Fatalf("required = %+v", f)
	}
}

// core/03 §7: no entity declarations, bounded size.
func TestParseRefusesEntitiesAndHugeFiles(t *testing.T) {
	xxe := `<?xml version="1.0"?><!DOCTYPE config [<!ENTITY x SYSTEM "file:///c:/windows/win.ini">]><config><moduleName>&x;</moduleName></config>`
	if _, err := Parse([]byte(xxe)); !errors.Is(err, ErrInvalidXML) {
		t.Fatalf("xxe err = %v", err)
	}
	if _, err := Parse(make([]byte, MaxXMLSize+1)); !errors.Is(err, ErrInvalidXML) {
		t.Fatalf("size err = %v", err)
	}
	if _, err := Parse([]byte("<config><moduleName>x</config")); !errors.Is(err, ErrInvalidXML) {
		t.Fatalf("broken err = %v", err)
	}
	if _, err := Parse([]byte("<other/>")); !errors.Is(err, ErrInvalidXML) {
		t.Fatalf("root err = %v", err)
	}
}

func TestParseEncodings(t *testing.T) {
	doc := `<?xml version="1.0" encoding="UTF-16"?><config><moduleName>Café</moduleName></config>`
	u := utf16.Encode([]rune(doc))
	le := []byte{0xFF, 0xFE}
	bomless := []byte{}
	for _, c := range u {
		le = append(le, byte(c), byte(c>>8))
		bomless = append(bomless, byte(c), byte(c>>8))
	}
	cp := []byte(`<?xml version="1.0" encoding="windows-1252"?><config><moduleName>Caf` + "\xe9 \x93q\x94" + `</moduleName></config>`)
	for name, b := range map[string][]byte{"utf16le": le, "utf16 without bom": bomless, "cp1252": cp, "utf8 bom": append([]byte{0xEF, 0xBB, 0xBF}, doc...)} {
		m, err := Parse(b)
		if err != nil || !strings.HasPrefix(m.Name, "Café") {
			t.Errorf("%s: %v %q", name, err, m.Name)
		}
	}
}

func TestEvaluateDefaultsTypesAndVisibility(t *testing.T) {
	m := mustParse(t, sample)
	st := Evaluate(m, Env{GameVersion: "1.6.1170.0"}, nil)
	body := st.Steps[1].Groups[0]
	// Recommended is preselected on the first visit.
	if !slices.Equal(body.Selected(), []int{1}) {
		t.Fatalf("body = %v", body.Selected())
	}
	extras := st.Steps[1].Groups[1]
	if !extras.Options[0].Disabled || extras.Options[0].Type != TypeNotUsable {
		t.Fatalf("NotUsable option = %+v", extras.Options[0])
	}
	// Alpha reads the flag set by Zeta only through visibility of later
	// steps; Alpha comes first, so it is evaluated without it.
	if st.Steps[0].Visible {
		t.Fatal("Alpha should be hidden: flags of later steps do not count")
	}
	if st.Flags["body"] != "curvy" {
		t.Fatalf("flags = %v", st.Flags)
	}
	// With the file present the option becomes usable.
	st = Evaluate(m, Env{Files: map[string]FileState{FileKey("needed.ESP"): FileActive}}, nil)
	if st.Steps[1].Groups[1].Options[0].Disabled {
		t.Fatal("option should be usable when Needed.esp exists")
	}
}

func TestGroupValidation(t *testing.T) {
	m := mustParse(t, sample)
	st := Evaluate(m, Env{}, Selection{{Step: 1, Group: 0}: {}})
	if st.Steps[1].Groups[0].Problem != ProblemExactlyOne || len(st.Problems()) != 1 {
		t.Fatalf("problem = %q", st.Steps[1].Groups[0].Problem)
	}
	// A NotUsable option chosen by a stale selection is never selected.
	st = Evaluate(m, Env{}, Selection{{Step: 1, Group: 1}: {0, 1}})
	if got := st.Steps[1].Groups[1].Selected(); !slices.Equal(got, []int{1}) {
		t.Fatalf("selected = %v", got)
	}
	// Single-choice groups keep at most one option.
	st = Evaluate(m, Env{}, Selection{{Step: 1, Group: 0}: {0, 1}})
	if got := st.Steps[1].Groups[0].Selected(); !slices.Equal(got, []int{0}) {
		t.Fatalf("selected = %v", got)
	}
}

// D085: phases (required < options < conditional), then priority, then
// declaration order. Invisible steps contribute nothing.
func TestResolvePhasesPriorityAndFlags(t *testing.T) {
	m := mustParse(t, sample)
	files := archive("core/a.esp", "core/patch.esp", "slim/meshes/body.nif", "curvy/meshes/body.nif",
		"extras/always.txt", "phys/a.ini", "phys/b.ini", "fomod/ModuleConfig.xml")
	// Curvy is the default; the conditional patch (priority -5) still beats
	// the required file (priority 9) because it comes in a later phase.
	st := Evaluate(m, Env{}, nil)
	got, warns := Resolve(st.Instructions, "", files)
	want := []string{"a.esp<core/patch.esp", "always.txt<extras/always.txt", "curvy/meshes/body.nif<curvy/meshes/body.nif"}
	if !slices.Equal(dests(got), want) {
		t.Fatalf("plan = %v", dests(got))
	}
	// extras/x.txt is installIfUsable of a NotUsable option: skipped, and it
	// does not exist either; no warning because it was not asked for.
	if len(warns) != 0 {
		t.Fatalf("warnings = %v", warns)
	}
	// Slim on an older game: Alpha stays hidden, the conditional does not
	// apply, the folder with empty destination lands at the root.
	st = Evaluate(m, Env{GameVersion: "1.0"}, Selection{{Step: 1, Group: 0}: {0}})
	got, _ = Resolve(st.Instructions, "", files)
	want = []string{"a.esp<core/a.esp", "always.txt<extras/always.txt", "meshes/body.nif<slim/meshes/body.nif"}
	if !slices.Equal(dests(got), want) {
		t.Fatalf("plan = %v", dests(got))
	}
}

func TestResolvePriorityInsidePhaseAndMissingSources(t *testing.T) {
	m := mustParse(t, strings.Replace(sample, `<installSteps>`, `<installSteps order="Descending">`, 1))
	// Descending: Zeta, then Alpha.
	if m.Steps[0].Name != "Zeta" {
		t.Fatalf("steps = %q", m.Steps[0].Name)
	}
	files := archive("Root/core/a.esp", "Root/phys/a.ini", "Root/phys/b.ini", "Root/curvy/x.nif")
	sel := Selection{{Step: 1, Group: 0}: {0, 1}}
	st := Evaluate(m, Env{}, sel)
	// Physics is SelectAtMostOne: only the first chosen counts.
	if got := st.Steps[1].Groups[0].Selected(); len(got) != 1 {
		t.Fatalf("selected = %v", got)
	}
	// Both physics files target core.ini; choose both through a SelectAny
	// copy of the module to check priority inside a phase.
	m.Steps[1].Groups[0].Type = SelectAny
	st = Evaluate(m, Env{}, sel)
	got, warns := Resolve(st.Instructions, "Root", files)
	if !slices.Contains(dests(got), "core.ini<Root/phys/a.ini") {
		t.Fatalf("priority 1 should win: %v", dests(got))
	}
	codes := map[string]bool{}
	for _, w := range warns {
		codes[w.Code+":"+w.Params["source"]] = true
	}
	if !codes[WarnMissingSource+":core/patch.esp"] || !codes[WarnMissingSource+":extras/always.txt"] {
		t.Fatalf("warnings = %v", warns)
	}
}

func TestVersionsAndUnknownFormats(t *testing.T) {
	c := Condition{Operator: OpAnd, Game: []string{"1.6.640"}}
	ev := &evaluator{env: Env{GameVersion: "1.6.1170.0"}, flags: map[string]string{}, warned: map[string]bool{}}
	if !ev.eval(c) {
		t.Fatal("1.6.1170 >= 1.6.640")
	}
	ev.env.GameVersion = "1.5.97.0"
	if ev.eval(c) {
		t.Fatal("1.5.97 < 1.6.640")
	}
	ev.env.GameVersion = ""
	if !ev.eval(c) || len(ev.warnings) != 1 || ev.warnings[0].Code != WarnUnknownVersion {
		t.Fatalf("unknown version must be true with a warning: %v", ev.warnings)
	}
}

func TestModuleDependenciesAndRequirements(t *testing.T) {
	xml := `<config><moduleName>D</moduleName><moduleDependencies operator="And">
	  <fileDependency file="SkyUI_SE.esp" state="Active"/>
	  <dependencies operator="Or"><fileDependency file="A.esp" state="Active"/><fileDependency file="B.esp" state="Active"/></dependencies>
	</moduleDependencies></config>`
	m := mustParse(t, xml)
	st := Evaluate(m, Env{Files: map[string]FileState{"a.esp": FileActive}}, nil)
	if st.DependenciesMet || !slices.Equal(st.Unmet, []string{"file:SkyUI_SE.esp:Active"}) {
		t.Fatalf("met = %v %v", st.DependenciesMet, st.Unmet)
	}
	if got := m.RequiredFiles(); !slices.Equal(got, []string{"SkyUI_SE.esp"}) {
		t.Fatalf("requirements = %v", got)
	}
	if got := m.FileConditions(); len(got) != 3 {
		t.Fatalf("file conditions = %v", got)
	}
}

func TestChoicesRoundTripAndDrop(t *testing.T) {
	m := mustParse(t, sample)
	st := Evaluate(m, Env{}, Selection{{Step: 1, Group: 0}: {1}, {Step: 0, Group: 0}: {0}})
	enc := Encode(m, st.Effective())
	sel, warns, err := Decode(m, enc)
	if err != nil || len(warns) != 0 {
		t.Fatalf("decode: %v %v", err, warns)
	}
	if again := Evaluate(m, Env{}, sel); Encode(m, again.Effective()) != enc {
		t.Fatal("recorded selection must reproduce the same state")
	}
	m.Steps[1].Groups[0].Options[1].Name = "Renamed"
	sel, warns, _ = Decode(m, enc)
	if len(warns) != 1 || warns[0].Code != WarnChoiceDropped {
		t.Fatalf("warnings = %v", warns)
	}
	if _, ok := sel[GroupKey{1, 0}]; ok {
		t.Fatal("a choice that no longer matches is dropped")
	}
}
