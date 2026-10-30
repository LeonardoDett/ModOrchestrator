package skyrimse

import (
	"context"
	"reflect"
	"testing"

	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/testutil/memfs"
	"modorchestrator/sdk"
	"modorchestrator/sdk/game"
)

func TestParseSKSELog(t *testing.T) {
	for _, tt := range []struct {
		name, log string
		want      []failedPlugin
	}{
		{"loaded", `plugin C:\Game\Data\SKSE\Plugins\Good.dll (00000001 Good 00000001) loaded correctly (handle 00007FF123)`, nil},
		{"disabled", `plugin C:\Game\Data\SKSE\Plugins\Bad.dll (00000001 Bad 00000001) disabled, address library needs to be updated`, []failedPlugin{{"Bad.dll", "address library needs to be updated"}}},
		{"missing dependency", `couldn't load plugin C:\Game\Data\SKSE\Plugins\Missing.dll (Error: 126 The specified module could not be found.)`, []failedPlugin{{"Missing.dll", "Error: 126 The specified module could not be found."}}},
		{"incompatible", `plugin C:\Game\Data\SKSE\Plugins\X.dll (00000001 X 00000001) reported as incompatible during query`, []failedPlugin{{"X.dll", "reported as incompatible during query"}}},
		{"later success clears failure", "plugin C:\\Game\\Bad.dll (...) disabled, failed\nplugin C:\\Game\\bad.dll (...) loaded correctly (handle 00007FF123)", nil},
		{"header and garbage", "SKSE64 runtime: initialize\nchecking plugin Good.dll\ngarbage\nplugin not-a-dll (...) failed", nil},
		{"first appearance order", "plugin C:\\Game\\Z.dll (...) disabled, first\nplugin C:\\Game\\A.dll (...) disabled, second\nplugin C:\\Game\\Z.dll (...) disabled, latest", []failedPlugin{{"Z.dll", "latest"}, {"A.dll", "second"}}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := parseSKSELog([]byte(tt.log)); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("failures = %+v, want %+v", got, tt.want)
			}
		})
	}
}

type logOwners struct {
	managed   bool
	locations []game.Location
}

func (o *logOwners) Owner(_ context.Context, loc game.Location) (sdk.TargetFile, bool, error) {
	o.locations = append(o.locations, loc)
	return sdk.TargetFile{Mod: "m1", ModName: "Bad Mod"}, o.managed, nil
}

func TestRunLogChecks(t *testing.T) {
	for _, tt := range []struct {
		name            string
		managed, exists bool
		count           int
	}{
		{"managed", true, false, 1},
		{"unmanaged present", false, true, 1},
		{"unmanaged absent", false, false, 0},
	} {
		t.Run(tt.name, func(t *testing.T) {
			fs := memfs.New("C:")
			if tt.exists {
				fs.AddFile(`C:\Game\Data\SKSE\Plugins\Bad.dll`, "dll")
			}
			owners := &logOwners{managed: tt.managed}
			inst := game.Instance{ID: "i1", Targets: []game.Target{{ID: TargetData, Path: `C:\Game\Data`}}}
			specs, err := (Adapter{}).RunLogChecks(context.Background(), fs, inst, sdk.RunLog{Content: []byte(`plugin C:\Game\Data\SKSE\Plugins\Bad.dll (...) disabled, address library needs to be updated`)}, owners)
			if err != nil {
				t.Fatal(err)
			}
			if len(specs) != tt.count {
				t.Fatalf("specs = %+v, want %d", specs, tt.count)
			}
			if len(owners.locations) != 1 || owners.locations[0].Target != TargetData || owners.locations[0].Path.String() != "SKSE/Plugins/Bad.dll" {
				t.Fatalf("owner lookup = %+v", owners.locations)
			}
			for _, sp := range specs {
				if _, err := diagnostic.New(sp); err != nil {
					t.Fatal(err)
				}
				if sp.Code != CodeSKSEPluginFailed || sp.Severity != diagnostic.SeverityWarning || sp.Params["plugin"] != "Bad.dll" || sp.Params["reason"] != "address library needs to be updated" {
					t.Fatalf("spec = %+v", sp)
				}
				if tt.managed {
					if sp.Params["mod"] != "Bad Mod" || len(sp.Related) < 1 || sp.Related[0].Kind != "mod" || sp.Related[0].ID != "m1" || len(sp.Actions) != 1 || sp.Actions[0].ID != "mod.folder.open" {
						t.Fatalf("managed spec = %+v", sp)
					}
				} else if _, hasMod := sp.Params["mod"]; hasMod || len(sp.Actions) != 0 {
					t.Fatalf("unmanaged spec = %+v", sp)
				}
			}
		})
	}
}

func TestSKSELogCatalogTexts(t *testing.T) {
	c := (Adapter{}).Catalog()
	declared := false
	for _, d := range c.Diagnostics {
		if d.Code == CodeSKSEPluginFailed {
			declared = true
		}
	}
	if !declared {
		t.Fatal("skse_plugin_failed not declared")
	}
	for _, lang := range []string{"en", "pt-BR"} {
		for _, key := range []string{"diag.code.skse_plugin_failed", "diag.impact.skse_plugin_failed", "diag.evidence.skse_log"} {
			if c.Messages[lang][key] == "" {
				t.Errorf("%s: missing %s", lang, key)
			}
		}
	}
}
