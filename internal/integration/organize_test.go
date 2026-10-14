package integration_test

import (
	"slices"
	"testing"

	"modorchestrator/internal/core/application/library"
	overviewsvc "modorchestrator/internal/core/application/overview"
	"modorchestrator/internal/core/domain/fomod"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/rules"
)

// D123: a category carries a palette color and an icon id; the Mods row
// shows them. Raw colors are refused.
func TestCategoryLookReachesTheRow(t *testing.T) {
	e := newEnv(t)
	ids := e.installMods("Alpha")
	cat, err := e.lib.SaveCategory(ctx, e.inst.ID, library.CategoryInput{Name: "Gráficos", Color: "violet", Icon: "image"})
	if err != nil {
		t.Fatal(err)
	}
	if err := e.lib.SetCategory(ctx, e.inst.ID, ids, cat); err != nil {
		t.Fatal(err)
	}
	r := e.modNamed("Alpha")
	if r.CategoryColor != "violet" || r.CategoryIcon != "image" {
		t.Fatalf("row look = %q %q", r.CategoryColor, r.CategoryIcon)
	}
	if _, err := e.lib.SaveCategory(ctx, e.inst.ID, library.CategoryInput{Name: "Bad", Color: "#ff0000"}); err == nil {
		t.Fatal("raw color accepted")
	}
}

// D123: tags are defined per instance; renaming changes every mod that
// carries the tag, deleting takes it off them, and a name typed on a mod
// without a definition still shows in the list.
func TestTagsRenameAndDeleteReachTheMods(t *testing.T) {
	e := newEnv(t)
	ids := e.installMods("Alpha", "Bravo")
	for _, id := range ids {
		d, err := e.lib.Details(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		if err := e.lib.SetAttributes(ctx, id, library.AttributesInput{Name: d.Name, Tags: []string{"essencial", "loose"}}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := e.lib.SaveTag(ctx, e.inst.ID, library.TagInput{Name: "essencial", Color: "amber"}); err != nil {
		t.Fatal(err)
	}
	tags, err := e.lib.TagList(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(tags) != 2 || tags[0].Name != "essencial" || tags[0].Color != "amber" || tags[0].Mods != 2 || tags[1].Name != "loose" || tags[1].Mods != 2 {
		t.Fatalf("tags = %+v", tags)
	}

	if _, err := e.lib.SaveTag(ctx, e.inst.ID, library.TagInput{Name: "essencial", NewName: "Loose"}); err == nil {
		t.Fatal("renaming onto another tag must be refused")
	}
	if _, err := e.lib.SaveTag(ctx, e.inst.ID, library.TagInput{Name: "essencial", NewName: "core", Color: "amber"}); err != nil {
		t.Fatal(err)
	}
	if got := e.modNamed("Alpha").Tags; !slices.Equal(got, []string{"core", "loose"}) {
		t.Fatalf("after rename = %v", got)
	}

	if err := e.lib.DeleteTag(ctx, e.inst.ID, "core"); err != nil {
		t.Fatal(err)
	}
	if got := e.modNamed("Bravo").Tags; !slices.Equal(got, []string{"loose"}) {
		t.Fatalf("after delete = %v", got)
	}
	tags, _ = e.lib.TagList(ctx, e.inst.ID)
	if len(tags) != 1 || tags[0].Name != "loose" {
		t.Fatalf("tags after delete = %+v", tags)
	}
}

// D123: files by extension, for any game (no adapter data).
func TestExtensionCounts(t *testing.T) {
	e := newEnv(t)
	e.importAndWait(e.zipFile("Mix.zip", "textures/a.dds", "aa", "textures/b.DDS", "b", "meshes/c.nif", "ccc", "readme", "r"))
	counts, err := e.lib.ExtensionCounts(ctx, e.modNamed("Mix").ID)
	if err != nil {
		t.Fatal(err)
	}
	want := []library.ExtensionCount{{Ext: ".dds", Files: 2, Size: 3}, {Ext: "", Files: 1, Size: 1}, {Ext: ".nif", Files: 1, Size: 3}}
	if !slices.Equal(counts, want) {
		t.Fatalf("counts = %+v", counts)
	}
}

// D124: "install all" installs what needs no choice and leaves the mod
// whose installer asks (FOMOD) imported, its operation cancelled, without
// blocking the queue.
func TestInstallAllSkipsModsThatAsk(t *testing.T) {
	e := newEnv(t)
	e.installSkyUI()
	ids, _ := e.lib.ImportFiles(ctx, e.inst.ID, []string{e.wizardArchive()})
	e.waitDecision(ids[0])
	if err := e.lib.Resolve(ids[0], library.Answer{Choice: library.ChoiceCancel}); err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	wizard := e.modNamed("Wizard Mod").ID

	// A plain mod whose install was undone (archive kept, core/02 §11).
	plain := e.installMods("Plain")[0]
	m, err := e.mods.Get(ctx, plain)
	if err != nil {
		t.Fatal(err)
	}
	m.State, m.Installation = mod.StateImported, ""
	if err := e.mods.Save(ctx, m); err != nil {
		t.Fatal(err)
	}

	ops, err := e.lib.InstallAll(ctx, e.inst.ID, []mod.ID{wizard, plain})
	if err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	if o := e.op(ops[0]); o.Status != operation.StatusCancelled {
		t.Fatalf("wizard operation = %s", o.Status)
	}
	if o := e.op(ops[1]); o.Status != operation.StatusSucceeded {
		t.Fatalf("plain operation = %s", o.Status)
	}
	if s := e.modNamed("Wizard Mod").State; s != mod.StateImported {
		t.Fatalf("wizard state = %s", s)
	}
	if s := e.modNamed("Plain").State; s != mod.StateInstalled {
		t.Fatalf("plain state = %s", s)
	}
}

// D124 and B9: the wizard summary can organize the mod, and the recorded
// choices come back readable in the details.
func TestFomodOrganizesAndRecordsReadableChoices(t *testing.T) {
	e := newEnv(t)
	e.installSkyUI()
	cat, err := e.lib.SaveCategory(ctx, e.inst.ID, library.CategoryInput{Name: "Texturas", Color: "blue"})
	if err != nil {
		t.Fatal(err)
	}
	ids, _ := e.lib.ImportFiles(ctx, e.inst.ID, []string{e.wizardArchive()})
	e.waitDecision(ids[0])
	if err := e.lib.Resolve(ids[0], library.Answer{
		Choice: library.ChoiceInstall, Fomod: fomod.Selection{{Step: 0, Group: 0}: {1}},
		Category: cat, Tags: []string{" fiel  ao lore ", "4K", "4k"},
	}); err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	r := e.modNamed("Wizard Mod")
	if r.Category != cat || !slices.Equal(r.Tags, []string{"fiel ao lore", "4K"}) {
		t.Fatalf("organized = %q %v", r.Category, r.Tags)
	}
	d, err := e.lib.Details(ctx, r.ID)
	if err != nil || d.Installation == nil {
		t.Fatalf("details = %+v %v", d, err)
	}
	c := d.Installation.Choices
	if len(c) == 0 || c[0].StepName != "Textures" || c[0].GroupName != "Resolution" || !slices.Equal(c[0].Names, []string{"4K"}) {
		t.Fatalf("choices = %+v", c)
	}
}

// B13: the summary of a mod counts its opponents and its requirements.
func TestModSummary(t *testing.T) {
	e := newEnv(t)
	e.installFiles(map[string][]string{"Alpha": {"textures/a.dds", "a"}, "Bravo": {"textures/a.dds", "b"}, "Base": {"textures/base.dds", "x"}}, "Alpha", "Bravo", "Base")
	alpha, base := e.modNamed("Alpha").ID, e.modNamed("Base").ID
	if _, err := e.prof.AddDependency(ctx, e.inst.ID, alpha, base, rules.Requires); err != nil {
		t.Fatal(err)
	}
	ov := e.overview()
	s := ov.Mod(ctx, e.inst.ID, alpha)
	if s.Conflicts == nil || s.Conflicts.Opponents != 1 || s.Conflicts.WinsAgainst+s.Conflicts.LosesTo != 1 || s.Conflicts.FilesWon+s.Conflicts.FilesLost != 1 {
		t.Fatalf("conflicts = %+v", s.Conflicts)
	}
	if s.Requirements == nil || s.Requirements.Total != 1 || s.Requirements.Present != 1 {
		t.Fatalf("requirements = %+v", s.Requirements)
	}
	var _ *overviewsvc.ModSummary = &s
}
