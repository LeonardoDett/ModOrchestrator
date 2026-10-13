package game

import (
	"errors"
	"slices"
	"strings"
	"testing"
)

const sampleManifest = `{
  "schema": 1,
  "id": "sample-game",
  "name": "Sample: The Game",
  "version": "3",
  "discovery": {
    "stores": [{"store": "steam", "appId": "100"}, {"store": "gog", "appId": "200"}],
    "registry": [{"id": "sample", "key": "HKLM\\SOFTWARE\\Sample", "value": "InstallPath"}],
    "markers": ["Sample.exe"],
    "versionFile": "Sample.exe",
    "processes": ["Sample.exe"]
  },
  "layout": {
    "targets": [{"id": "mods", "path": "Mods"}, {"id": "root", "path": ""}],
    "modTypes": [
      {"id": "default", "name": "Default", "target": "mods"},
      {"id": "root", "name": "Root", "target": "root", "methods": ["hardlink", "copy"], "priority": 10,
       "detect": [{"all": ["root/"]}]}
    ],
    "rootHints": {"dirs": ["mods"], "extensions": [".pak"]},
    "toolOutputs": [{"target": "mods", "path": "Generated"}],
    "unmanagedHints": [{"target": "mods", "glob": "*.log"}]
  },
  "launch": [
    {"id": "game", "exe": "Sample.exe", "default": true},
    {"id": "safe", "exe": "bin/Sample.exe", "args": ["-safe"], "workDir": "bin"}
  ]
}`

func TestManifestBecomesADefinition(t *testing.T) {
	m, err := ParseManifest([]byte(sampleManifest))
	if err != nil {
		t.Fatal(err)
	}
	d, err := m.Definition(SupportDeclared)
	if err != nil {
		t.Fatal(err)
	}
	if d.ID != "sample-game" || d.Name != "Sample: The Game" || d.SupportLevel() != SupportDeclared || d.CustomTargets {
		t.Fatalf("identity = %+v", d)
	}
	if !slices.Equal(d.Targets, []TargetID{"mods", "root"}) || len(d.ModTypes) != 2 {
		t.Fatalf("layout = %v %v", d.Targets, d.ModTypes)
	}
	if got := d.DetectModType([]string{"root/Sample.dll"}); got != "root" {
		t.Errorf("detected %q", got)
	}
	root, _ := d.ModType("root")
	if root.Allows(MethodSymlink) || !root.Allows(MethodCopy) {
		t.Error("methods of the mod type are kept")
	}
	if !d.Discovery.Matches(StoreSteam, "100") || !d.Discovery.Matches(StoreRegistry, "sample") || d.Discovery.VersionFile != "Sample.exe" {
		t.Errorf("discovery = %+v", d.Discovery)
	}
	if len(d.ToolOutputs) != 1 || d.ToolOutputs[0].String() != "mods:Generated" || len(d.UnmanagedHints) != 1 {
		t.Errorf("outputs = %v, hints = %v", d.ToolOutputs, d.UnmanagedHints)
	}
	want := []Capability{CapExternalChanges, CapFilesystemTarget, CapInstaller, CapLaunch, CapModTypes, CapRunningDetection}
	if got := d.Capabilities.List(); !slices.Equal(got, want) {
		t.Errorf("capabilities = %v", got)
	}
	if specs := m.TargetSpecs(); len(specs) != 2 || specs[0].Path != "Mods" || specs[1].Path != "" {
		t.Errorf("target specs = %+v", specs)
	}
}

// What the app offers is derived from the manifest; a file cannot claim a
// process that needs code, nor where it came from.
func TestManifestDerivesCapabilitiesAndSupport(t *testing.T) {
	minimal := `{"schema":1,"id":"user.plain","name":"Plain","discovery":{},"layout":{"targets":[{"id":"mods","path":"Mods"}],"rootHints":{}}}`
	m, err := ParseManifest([]byte(minimal))
	if err != nil {
		t.Fatal(err)
	}
	d, err := m.Definition(SupportCustom)
	if err != nil {
		t.Fatal(err)
	}
	if got := d.Capabilities.List(); !slices.Equal(got, []Capability{CapFilesystemTarget, CapInstaller}) {
		t.Errorf("capabilities = %v", got)
	}
	if len(d.ModTypes) != 1 || d.ModTypes[0].ID != DefaultModType || d.ModTypes[0].Target != "mods" {
		t.Errorf("the default type serves the first target: %+v", d.ModTypes)
	}
	if d.SupportLevel() != SupportCustom {
		t.Errorf("support = %q", d.SupportLevel())
	}
	for _, claim := range []string{`"capabilities":["plugins"]`, `"support":"full"`, `"features":[]`, `"origin":"builtin"`, `"adapter":"x"`} {
		if _, err := ParseManifest([]byte(strings.Replace(minimal, `"schema":1,`, `"schema":1,`+claim+`,`, 1))); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s must be refused: %v", claim, err)
		}
	}
}

func TestManifestOfAnotherSchemaIsNeverReadByHalves(t *testing.T) {
	for _, schema := range []string{`2`, `0`, `-1`} {
		raw := strings.Replace(sampleManifest, `"schema": 1`, `"schema": `+schema, 1)
		if _, err := ParseManifest([]byte(raw)); !errors.Is(err, ErrManifestSchema) {
			t.Errorf("schema %s: %v", schema, err)
		}
	}
	if _, err := ParseManifest([]byte(strings.Replace(sampleManifest, `"schema": 1,`, ``, 1))); !errors.Is(err, ErrManifestSchema) {
		t.Errorf("missing schema: %v", err)
	}
	for name, raw := range map[string]string{
		"not json":       `{"schema": 1`,
		"trailing":       sampleManifest + `{}`,
		"too large":      `{"schema":1,"name":"` + strings.Repeat("x", manifestMaxBytes) + `"}`,
		"array":          `[]`,
		"schema as text": `{"schema":"1"}`,
	} {
		if _, err := ParseManifest([]byte(raw)); !errors.Is(err, ErrInvalid) && !errors.Is(err, ErrManifestSchema) {
			t.Errorf("%s: %v", name, err)
		}
	}
}

// A manifest holds no absolute path and nothing that leaves the game
// folder (INV-ID-01, INV-LIB-03).
func TestManifestRefusesWhatLeavesTheGameFolder(t *testing.T) {
	bad := map[string][2]string{
		"absolute target":     {`"path": "Mods"`, `"path": "C:\\Windows"`},
		"target outside":      {`"path": "Mods"`, `"path": "../Other"`},
		"target id":           {`{"id": "mods", "path": "Mods"}`, `{"id": "My Mods", "path": "Mods"}`},
		"marker outside":      {`"markers": ["Sample.exe"]`, `"markers": ["..\\Sample.exe"]`},
		"version file drive":  {`"versionFile": "Sample.exe"`, `"versionFile": "D:\\Sample.exe"`},
		"process with folder": {`"processes": ["Sample.exe"]`, `"processes": ["bin/Sample.exe"]`},
		"launch outside":      {`"exe": "Sample.exe", "default": true`, `"exe": "..\\cmd.exe", "default": true`},
		"launch absolute":     {`"exe": "Sample.exe", "default": true`, `"exe": "C:\\Windows\\System32\\cmd.exe", "default": true`},
		"work dir outside":    {`"workDir": "bin"`, `"workDir": "../.."`},
		"tool output outside": {`"path": "Generated"`, `"path": "../Generated"`},
		"tool output target":  {`{"target": "mods", "path": "Generated"}`, `{"target": "nope", "path": "Generated"}`},
		"pattern outside":     {`"glob": "*.log"`, `"glob": "../*.log"`},
		"pattern syntax":      {`"glob": "*.log"`, `"glob": "[a-"`},
		"detect outside":      {`"all": ["root/"]`, `"all": ["../root/"]`},
		"empty detect":        {`"all": ["root/"]`, `"all": []`},
		"hint dir with path":  {`"dirs": ["mods"]`, `"dirs": ["a/b"]`},
		"hint extension":      {`"extensions": [".pak"]`, `"extensions": ["pak"]`},
		"unknown method":      {`"methods": ["hardlink", "copy"]`, `"methods": ["junction"]`},
		"mod type target":     {`"name": "Root", "target": "root"`, `"name": "Root", "target": "nope"`},
		"two defaults":        {`"args": ["-safe"]`, `"args": ["-safe"], "default": true`},
		"no default":          {`"exe": "Sample.exe", "default": true`, `"exe": "Sample.exe"`},
		"launch id twice":     {`"id": "safe"`, `"id": "game"`},
		"store without id":    {`"appId": "100"`, `"appId": ""`},
		"registry as store":   {`"store": "gog"`, `"store": "registry"`},
		"id with upper case":  {`"id": "sample-game"`, `"id": "Sample"`},
		"id with path":        {`"id": "sample-game"`, `"id": "../x"`},
		"empty name":          {`"name": "Sample: The Game"`, `"name": "  "`},
	}
	for name, change := range bad {
		if !strings.Contains(sampleManifest, change[0]) {
			t.Fatalf("%s: the sample has no %s", name, change[0])
		}
		raw := strings.Replace(sampleManifest, change[0], change[1], 1)
		if _, err := ParseManifest([]byte(raw)); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s must be refused, got %v", name, err)
		}
	}
}

func TestManifestRoundTrip(t *testing.T) {
	m, err := ParseManifest([]byte(sampleManifest))
	if err != nil {
		t.Fatal(err)
	}
	out, err := m.Marshal()
	if err != nil {
		t.Fatal(err)
	}
	again, err := ParseManifest(out)
	if err != nil {
		t.Fatalf("what the app exports must import back: %v\n%s", err, out)
	}
	a, _ := m.Definition(SupportCustom)
	b, _ := again.Definition(SupportCustom)
	if !slices.Equal(a.Capabilities.List(), b.Capabilities.List()) || len(a.ModTypes) != len(b.ModTypes) || a.Discovery.VersionFile != b.Discovery.VersionFile {
		t.Fatalf("round trip changed the definition:\n%+v\n%+v", a, b)
	}
	if _, err := (Manifest{Schema: 1, ID: "x", Name: "X"}).Marshal(); !errors.Is(err, ErrInvalid) {
		t.Errorf("an invalid manifest is never exported: %v", err)
	}
}

func FuzzParseManifest(f *testing.F) {
	f.Add([]byte(sampleManifest))
	f.Add([]byte(`{"schema":1}`))
	f.Fuzz(func(t *testing.T, data []byte) {
		m, err := ParseManifest(data)
		if err != nil {
			return
		}
		d, err := m.Definition(SupportCustom)
		if err != nil {
			t.Fatalf("a parsed manifest must give a definition: %v", err)
		}
		if err := d.Validate(); err != nil {
			t.Fatalf("definition of a parsed manifest is invalid: %v", err)
		}
		for _, s := range m.TargetSpecs() {
			if strings.Contains(s.Path, "..") || strings.Contains(s.Path, ":") {
				t.Fatalf("target leaves the game folder: %q", s.Path)
			}
		}
	})
}
