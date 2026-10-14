package integration_test

import (
	"testing"

	"modorchestrator/internal/core/application/library"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/rules"
)

// importPackage imports a mod package as the mod sites of the game publish
// it and enables it.
func (e *env) importPackage(file, manifest string) mod.ID {
	e.t.Helper()
	before := map[mod.ID]bool{}
	for _, r := range e.rows() {
		before[r.ID] = true
	}
	e.importAndWait(e.zipFile(file, "manifest.json", manifest, "Plugin.dll", file))
	var id mod.ID
	for _, r := range e.rows() {
		if !before[r.ID] {
			id = r.ID
		}
	}
	if id == "" {
		e.t.Fatalf("%s was not imported", file)
	}
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{id}, true); err != nil {
		e.t.Fatal(err)
	}
	return id
}

func (e *env) dependencyRules() []rules.DependencyRule {
	e.t.Helper()
	set, err := e.rules.Get(ctx, e.inst.ID)
	if err != nil {
		return nil
	}
	return set.DependencyRules()
}

// D125: the dependencies a package declares become requirements. Before
// the required package is in the library the mod reports it missing (the
// framework pack is the adapter's own check, never a package requirement);
// installing it links the two with a metadata rule, and a reinstall does
// not repeat it.
func TestPackageDependenciesBecomeRequirements(t *testing.T) {
	e, _ := frameworkEnv(t)
	plans := e.importPackage("Author-Plans_Plus-1.0.0.zip",
		`{"name":"Plans_Plus","version_number":"1.0.0","dependencies":["denikson-BepInExPack_Valheim-5.4.2202","ValheimModding-Jotunn-2.20.0"]}`)

	m, err := e.mods.Get(ctx, plans)
	if err != nil {
		t.Fatal(err)
	}
	if m.Package.Name != "Plans_Plus" || len(m.Package.Requires) != 1 || m.Package.Requires[0] != (mod.PackageRef{Name: "Jotunn", Version: "2.20.0"}) {
		t.Fatalf("package = %+v", m.Package)
	}
	it, ok := e.problem(diagnostic.CodeModRequirementMissing)
	if !ok || it.Params["target"] != "Jotunn" || it.Params["version"] != "2.20.0" {
		t.Fatalf("missing package problem = %+v %v", it, ok)
	}
	if s := e.overview().Mod(ctx, e.inst.ID, plans); s.Requirements == nil || s.Requirements.Total != 1 || s.Requirements.Present != 0 {
		t.Fatalf("summary before = %+v", s.Requirements)
	}
	if deps := e.dependencyRules(); len(deps) != 0 {
		t.Fatalf("rules before the package = %+v", deps)
	}

	jotunn := e.importPackage("ValheimModding-Jotunn-2.20.0.zip", `{"name":"Jotunn","version_number":"2.20.0","dependencies":[]}`)
	deps := e.dependencyRules()
	if len(deps) != 1 || deps[0].Mod != plans || deps[0].Target != jotunn || deps[0].Kind != rules.Requires ||
		deps[0].Source != rules.SourceMetadata || deps[0].Note != "Jotunn 2.20.0" {
		t.Fatalf("rules = %+v", deps)
	}
	if it, ok := e.problem(diagnostic.CodeModRequirementMissing); ok {
		t.Fatalf("requirement still reported: %+v", it)
	}
	if s := e.overview().Mod(ctx, e.inst.ID, plans); s.Requirements == nil || s.Requirements.Total != 1 || s.Requirements.Present != 1 {
		t.Fatalf("summary after = %+v", s.Requirements)
	}

	for _, id := range []mod.ID{plans, jotunn} {
		if _, err := e.lib.ReinstallMods(ctx, e.inst.ID, []mod.ID{id}); err != nil {
			t.Fatal(err)
		}
		e.lib.Wait()
	}
	if deps := e.dependencyRules(); len(deps) != 1 {
		t.Fatalf("rules after reinstall = %+v", deps)
	}
}

// D125: the generic game declares no package, so a manifest.json in a mod
// is just a file: no package, no rule, no problem.
func TestGenericGameDeclaresNoPackages(t *testing.T) {
	e := newEnv(t)
	// The generic game asks where the root is; install the archive as is.
	ids, err := e.lib.ImportFiles(ctx, e.inst.ID, []string{e.zipFile("Author-Plans_Plus-1.0.0.zip",
		"manifest.json", `{"name":"Plans_Plus","dependencies":["ValheimModding-Jotunn-2.20.0"]}`, "Plugin.dll", "dll")})
	if err != nil {
		t.Fatal(err)
	}
	e.waitDecision(ids[0])
	if err := e.lib.Resolve(ids[0], library.Answer{Choice: library.ChoiceRoot, Root: ""}); err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	id := e.only().ID
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{id}, true); err != nil {
		t.Fatal(err)
	}
	m, err := e.mods.Get(ctx, id)
	if err != nil || m.Installation == "" {
		t.Fatalf("generic mod = %+v %v", m, err)
	}
	if m.Package.Name != "" || len(m.Package.Requires) != 0 {
		t.Fatalf("generic package = %+v", m.Package)
	}
	if _, ok := e.problem(diagnostic.CodeModRequirementMissing); ok {
		t.Fatal("generic game reported a package requirement")
	}
	if deps := e.dependencyRules(); len(deps) != 0 {
		t.Fatalf("generic rules = %+v", deps)
	}
}
