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
