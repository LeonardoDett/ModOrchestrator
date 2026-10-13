package gamesflow_test

import (
	"testing"

	"modorchestrator/internal/core/application/ports"
)

// The same installation reported by Steam and by the registry (with a
// trailing slash and another letter case) is one candidate, credited to the
// store that knows the game best.
func TestSameInstallationFromSeveralSourcesIsOneCandidate(t *testing.T) {
	e := newEnv()
	root := e.skyrim(`C:\Program Files (x86)\Steam\steamapps\common\Skyrim Special Edition`)
	e.stores.installs = []ports.StoreInstall{
		{Store: "steam", AppID: "489830", Path: `c:\program files (x86)\steam\steamapps\common\Skyrim Special Edition`},
		{Store: "registry", AppID: "bethesda", Path: root + `\`},
	}
	if n, err := e.svc.ScanQuick(ctx); err != nil || n != 2 {
		t.Fatalf("scan = %d, %v", n, err)
	}
	v, _ := e.svc.View(ctx, false)
	if len(v.Discovered) != 1 || v.Discovered[0].Candidate.Store != "steam" {
		t.Fatalf("discovered = %+v", v.Discovered)
	}
	if got := v.Discovered[0].Candidate.Root; got[len(got)-1] == '\\' {
		t.Fatalf("root keeps a trailing separator: %q", got)
	}
}

// D113: only installations a definition declares, in a folder the adapter
// accepts, become candidates.
func TestQuickScanKeepsDeclaredInstallationsWithAValidFolder(t *testing.T) {
	e := newEnv()
	steam := e.skyrim(`C:\Steam\steamapps\common\Skyrim Special Edition`)
	gog := e.skyrim(`D:\GOG\Skyrim`)
	e.fs.AddDir(`D:\Epic\Skyrim`) // executable missing
	e.stores.installs = []ports.StoreInstall{
		{Store: "steam", AppID: "489830", Path: steam},
		{Store: "steam", AppID: "22330", Path: `C:\Steam\steamapps\common\Oblivion`},
		{Store: "gog", AppID: "1711230643", Path: gog},
		{Store: "epic", AppID: "ac82db5035584c7f8a2c548d98c86b2c", Path: `D:\Epic\Skyrim`},
		{Store: "gog", AppID: "999", Path: gog},
		{Store: "steam", AppID: "489830", Path: ""},
	}
	if n, err := e.svc.ScanQuick(ctx); err != nil || n != 2 {
		t.Fatalf("scan = %d, %v", n, err)
	}
	v, _ := e.svc.View(ctx, false)
	if len(v.Discovered) != 2 {
		t.Fatalf("discovered = %+v", v.Discovered)
	}
	for _, d := range v.Discovered {
		if d.Candidate.Game != "skyrimse" || (d.Candidate.Store != "steam" && d.Candidate.Store != "gog") {
			t.Errorf("candidate = %+v", d.Candidate)
		}
	}
}
