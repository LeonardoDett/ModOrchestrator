package integration_test

import (
	"slices"
	"strings"
	"testing"

	"modorchestrator/internal/core/application/library"
	"modorchestrator/internal/core/domain/fomod"
	"modorchestrator/internal/core/domain/installer"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/rules"
)

// A FOMOD in the shape of real Skyrim installers: a module dependency on
// SkyUI, a texture choice, an optional patch whose type depends on a plugin
// of the game, and a conditional install driven by a flag.
const wizardConfig = `<?xml version="1.0" encoding="utf-8"?>
<config>
  <moduleName>Wizard Mod</moduleName>
  <moduleImage path="fomod\images\header.png"/>
  <moduleDependencies operator="And"><fileDependency file="SkyUI_SE.esp" state="Active"/></moduleDependencies>
  <requiredInstallFiles><file source="Core\WizardMod.esp" destination="WizardMod.esp"/></requiredInstallFiles>
  <installSteps order="Explicit">
    <installStep name="Textures">
      <optionalFileGroups order="Explicit">
        <group name="Resolution" type="SelectExactlyOne">
          <plugins order="Explicit">
            <plugin name="2K">
              <description>2K textures</description>
              <image path="fomod\images\2k.png"/>
              <files><folder source="2K" destination=""/></files>
              <conditionFlags><flag name="res">2k</flag></conditionFlags>
              <typeDescriptor><type name="Recommended"/></typeDescriptor>
            </plugin>
            <plugin name="4K">
              <description>4K textures</description>
              <files><folder source="4K" destination=""/></files>
              <conditionFlags><flag name="res">4k</flag></conditionFlags>
              <typeDescriptor><type name="Optional"/></typeDescriptor>
            </plugin>
          </plugins>
        </group>
        <group name="Patches" type="SelectAny">
          <plugins order="Explicit">
            <plugin name="Dawnguard patch">
              <description>Needs Dawnguard</description>
              <files><file source="Patches\WizardMod - Dawnguard.esp" destination="WizardMod - Dawnguard.esp"/></files>
              <typeDescriptor><dependencyType><defaultType name="NotUsable"/>
                <patterns><pattern><dependencies><fileDependency file="Dawnguard.esm" state="Active"/></dependencies><type name="Optional"/></pattern></patterns>
              </dependencyType></typeDescriptor>
            </plugin>
          </plugins>
        </group>
      </optionalFileGroups>
    </installStep>
  </installSteps>
  <conditionalFileInstalls><patterns>
    <pattern><dependencies><flagDependency flag="res" value="4k"/></dependencies>
      <files><file source="Core\4k.ini" destination="SKSE\Plugins\WizardMod.ini"/></files></pattern>
  </patterns></conditionalFileInstalls>
</config>`

func (e *env) wizardArchive() string {
	return e.zipFile("Wizard Mod-100-1-0-1700000000.zip",
		"Wizard Mod/fomod/ModuleConfig.xml", wizardConfig,
		"Wizard Mod/fomod/info.xml", `<fomod><Name>Wizard Mod</Name><Version>1.0</Version></fomod>`,
		"Wizard Mod/fomod/images/header.png", "\x89PNG header",
		"Wizard Mod/fomod/images/2k.png", "\x89PNG 2k",
		"Wizard Mod/Core/WizardMod.esp", "esp",
		"Wizard Mod/Core/4k.ini", "ini",
		"Wizard Mod/2K/textures/wizard.dds", "2k",
		"Wizard Mod/4K/textures/wizard.dds", "4k!",
		"Wizard Mod/Patches/WizardMod - Dawnguard.esp", "patch",
	)
}

func (e *env) installSkyUI() mod.ID {
	e.t.Helper()
	e.importAndWait(e.zipFile("SkyUI.zip", "SkyUI_SE.esp", "esp", "interface/skyui.swf", "swf"))
	for _, r := range e.rows() {
		if strings.HasPrefix(r.Name, "SkyUI") {
			return r.ID
		}
	}
	e.t.Fatal("SkyUI not installed")
	return ""
}

func (e *env) modNamed(prefix string) library.ModRow {
	e.t.Helper()
	for _, r := range e.rows() {
		if strings.HasPrefix(r.Name, prefix) {
			return r
		}
	}
	e.t.Fatalf("no mod %q in %+v", prefix, e.rows())
	return library.ModRow{}
}

// core/03 §5, DLG-06: the import waits on the wizard, every selection is
// evaluated by the backend, the summary lists files, warnings and
// requirements, and confirming installs the plan, records the choices and
// creates the confirmed requirement as a metadata rule.
func TestFomodWizardInstallsAndRecordsChoices(t *testing.T) {
	e := newEnv(t)
	skyui := e.installSkyUI()
	ids, err := e.lib.ImportFiles(ctx, e.inst.ID, []string{e.wizardArchive()})
	if err != nil {
		t.Fatal(err)
	}
	d := e.waitDecision(ids[0])
	if d.Kind != string(installer.DecisionFomod) || d.Fomod == nil || d.Fomod.Module != "Wizard Mod" || !d.Fomod.HasImage || len(d.Fomod.Previous) != 0 {
		t.Fatalf("decision = %+v %+v", d, d.Fomod)
	}
	if !slices.Equal(d.Choices(), []string{library.ChoiceInstall, library.ChoiceCancel}) {
		t.Fatalf("choices = %v", d.Choices())
	}

	v, err := e.lib.FomodState(ctx, ids[0], nil)
	if err != nil {
		t.Fatal(err)
	}
	group := v.Steps[0].Groups[0]
	if !group.Options[0].Selected || group.Options[1].Selected {
		t.Fatalf("Recommended 2K should be preselected: %+v", group.Options)
	}
	patch := v.Steps[0].Groups[1].Options[0]
	if !patch.Disabled || patch.Type != fomod.TypeNotUsable {
		t.Fatalf("Dawnguard.esm is missing, the patch must be NotUsable: %+v", patch)
	}
	if v.Summary == nil || v.Summary.Files != 2 || len(v.Summary.Requirements) != 1 || v.Summary.Requirements[0].Mod != skyui {
		t.Fatalf("summary = %+v", v.Summary)
	}

	// Choosing 4K changes the flag and with it the conditional install.
	v, _ = e.lib.FomodState(ctx, ids[0], fomod.Selection{{Step: 0, Group: 0}: {1}})
	if v.Summary == nil || v.Summary.Files != 3 {
		t.Fatalf("4K summary = %+v", v.Summary)
	}
	// An invalid selection is reported per group, never installed.
	v, _ = e.lib.FomodState(ctx, ids[0], fomod.Selection{{Step: 0, Group: 0}: {}})
	if v.PlanError != library.CodeFomodInvalidSelection || len(v.Problems) != 1 {
		t.Fatalf("invalid = %+v", v)
	}

	// Images are served as data and only when the installer references them.
	if img, err := e.lib.FomodImage(ctx, ids[0], ""); err != nil || img.Mime != "image/png" || string(img.Data) != "\x89PNG header" {
		t.Fatalf("module image = %+v %v", img, err)
	}
	if _, err := e.lib.FomodImage(ctx, ids[0], "Core/WizardMod.esp"); err == nil {
		t.Fatal("a file that is not an image of the installer must be refused")
	}

	if err := e.lib.Resolve(ids[0], library.Answer{
		Choice: library.ChoiceInstall, Fomod: fomod.Selection{{Step: 0, Group: 0}: {1}}, Requirements: []string{"SkyUI_SE.esp"},
	}); err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	if o := e.op(ids[0]); o.Status != operation.StatusSucceeded {
		t.Fatalf("operation = %s %+v", o.Status, o.Error)
	}
	m := e.modNamed("Wizard Mod")
	want := []string{"data:SKSE/Plugins/WizardMod.ini", "data:textures/wizard.dds", "data:WizardMod.esp"}
	if got := e.files(m.ID); !slices.Equal(got, want) {
		t.Fatalf("files = %v", got)
	}
	details, err := e.lib.Details(ctx, m.ID)
	if err != nil || details.Installation == nil || details.Installation.Installer != installer.FomodID ||
		!strings.Contains(details.Installation.Options[installer.OptionFomod], `"names":["4K"]`) {
		t.Fatalf("installation = %+v %v", details.Installation, err)
	}
	set, err := e.rules.Get(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	if deps := set.DependencyRules(); len(deps) != 1 || deps[0].Mod != m.ID || deps[0].Target != skyui ||
		deps[0].Kind != rules.Requires || deps[0].Source != rules.SourceMetadata {
		t.Fatalf("rules = %+v", deps)
	}

	// Reinstall opens the wizard with the previous choices (D030); using
	// them reproduces the same plan (core/03 §9).
	re, err := e.lib.ReinstallMods(ctx, e.inst.ID, []mod.ID{m.ID})
	if err != nil {
		t.Fatal(err)
	}
	d = e.waitDecision(re[0])
	if d.Fomod == nil || len(d.Fomod.Previous) != 2 || !slices.Equal(d.Fomod.Previous[0].Options, []int{1}) {
		t.Fatalf("previous = %+v", d.Fomod)
	}
	prev := fomod.Selection{}
	for _, c := range d.Fomod.Previous {
		prev[fomod.GroupKey{Step: c.Step, Group: c.Group}] = c.Options
	}
	if err := e.lib.Resolve(re[0], library.Answer{Choice: library.ChoiceInstall, Fomod: prev}); err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	if got := e.files(m.ID); !slices.Equal(got, want) {
		t.Fatalf("files after reinstall = %v", got)
	}
	again, _ := e.lib.Details(ctx, m.ID)
	if again.Installation.Options[installer.OptionFomod] != details.Installation.Options[installer.OptionFomod] {
		t.Fatalf("recorded choices changed: %v", again.Installation.Options)
	}

	// Reinstall changing the options.
	re, _ = e.lib.ReinstallMods(ctx, e.inst.ID, []mod.ID{m.ID})
	e.waitDecision(re[0])
	if err := e.lib.Resolve(re[0], library.Answer{Choice: library.ChoiceInstall, Fomod: fomod.Selection{{Step: 0, Group: 0}: {0}}}); err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	if got := e.files(m.ID); !slices.Equal(got, []string{"data:textures/wizard.dds", "data:WizardMod.esp"}) {
		t.Fatalf("files after changing options = %v", got)
	}
	if set, _ := e.rules.Get(ctx, e.inst.ID); len(set.DependencyRules()) != 1 {
		t.Fatalf("requirement duplicated: %+v", set.DependencyRules())
	}
}

// core/03 §8: unmet moduleDependencies refuse the installation with the
// failing terms, before any wizard.
func TestFomodModuleDependenciesRefuse(t *testing.T) {
	e := newEnv(t)
	ids := e.importAndWait(e.wizardArchive())
	o := e.op(ids[0])
	if o.Status != operation.StatusFailed || o.Error == nil || o.Error.Code != library.CodeFomodModuleDeps ||
		!strings.Contains(o.Error.Params["unmet"], "SkyUI_SE.esp") {
		t.Fatalf("operation = %s %+v", o.Status, o.Error)
	}
}

// core/03 §7, INV-LIB-04: a scripted FOMOD is never run; the user picks a
// folder and the basic installer installs it.
func TestFomodScriptFallsBackToFolder(t *testing.T) {
	e := newEnv(t)
	ids, err := e.lib.ImportFiles(ctx, e.inst.ID, []string{e.zipFile("Scripted.zip",
		"fomod/script.cs", "class Script { void Run() { System.IO.File.Delete(\"x\"); } }",
		"Main/textures/a.dds", "a", "Optional/textures/b.dds", "b")})
	if err != nil {
		t.Fatal(err)
	}
	d := e.waitDecision(ids[0])
	if d.Kind != string(installer.DecisionFomodScript) || !slices.Equal(d.Candidates, []string{"Main", "Optional"}) {
		t.Fatalf("decision = %+v", d)
	}
	if err := e.lib.Resolve(ids[0], library.Answer{Choice: library.ChoiceRoot, Root: "Main"}); err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	m := e.only()
	if got := e.files(m.ID); !slices.Equal(got, []string{"data:textures/a.dds"}) || m.Installer != installer.BasicID {
		t.Fatalf("files = %v installer = %s", got, m.Installer)
	}
}

// D064: cancelling the wizard installs nothing; the retained archive stays
// as an imported mod, and installing it later opens the wizard again.
func TestFomodWizardCancel(t *testing.T) {
	e := newEnv(t)
	e.installSkyUI()
	ids, _ := e.lib.ImportFiles(ctx, e.inst.ID, []string{e.wizardArchive()})
	e.waitDecision(ids[0])
	if err := e.lib.Resolve(ids[0], library.Answer{Choice: library.ChoiceCancel}); err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	if o := e.op(ids[0]); o.Status != operation.StatusCancelled {
		t.Fatalf("operation = %s", o.Status)
	}
	if _, err := e.lib.FomodState(ctx, ids[0], nil); err == nil {
		t.Fatal("the wizard session must end with the decision")
	}
	m := e.modNamed("Wizard Mod")
	if m.State != mod.StateImported || m.Files != 0 {
		t.Fatalf("mod = %+v", m)
	}
	again, err := e.lib.InstallMods(ctx, e.inst.ID, []mod.ID{m.ID})
	if err != nil {
		t.Fatal(err)
	}
	if d := e.waitDecision(again[0]); d.Kind != string(installer.DecisionFomod) {
		t.Fatalf("decision = %+v", d)
	}
	if err := e.lib.Resolve(again[0], library.Answer{Choice: library.ChoiceInstall}); err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	if got := e.files(m.ID); !slices.Equal(got, []string{"data:textures/wizard.dds", "data:WizardMod.esp"}) {
		t.Fatalf("files = %v", got)
	}
}
