package externalchange

import (
	"errors"
	"testing"

	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/relpath"
)

var loc = game.Location{Target: "data", Path: relpath.MustParse("a.esp")}

func entry(m game.DeploymentMethod) deployment.Entry {
	return deployment.Entry{Location: loc, Kind: deployment.KindLink, Mod: "m1", Installation: "i", Source: relpath.MustParse("a.esp"), Method: m,
		Evidence: deployment.Evidence{FileID: "v:1", Size: 10, Hash: "h"}}
}

func obs(fileID string, size int64, hash string) deployment.Observation {
	return deployment.Observation{Exists: true, Evidence: deployment.Evidence{FileID: fileID, Size: size, Hash: hash}}
}

func TestClassify(t *testing.T) {
	recorded := mod.File{Size: 10, Hash: "h"}
	cases := []struct {
		name string
		obs  deployment.Observation
		want Kind
	}{
		{"missing", deployment.Observation{}, KindMissing},
		{"unreadable is never absent", deployment.Observation{Unreadable: true}, KindPermission},
		{"other file at the location", obs("v:2", 10, "h"), KindReplaced},
		{"edited through the hardlink", obs("v:1", 12, "x"), KindModified},
	}
	for _, c := range cases {
		got, found := Classify(entry(game.MethodHardlink), c.obs, recorded)
		if !found || got.Kind != c.want || !got.Managed() {
			t.Errorf("%s: got %+v, want %s", c.name, got, c.want)
		}
	}
	if _, found := Classify(entry(game.MethodHardlink), obs("v:1", 10, "h"), recorded); found {
		t.Fatal("matching evidence is not a change")
	}
}

func TestDecisions(t *testing.T) {
	c, _ := Classify(entry(game.MethodHardlink), obs("v:1", 12, ""), mod.File{Size: 10})
	if a := Allowed(c.Kind, game.MethodHardlink); a[0] != ActionKeepChange {
		t.Fatalf("hardlink edit suggests keeping it: %v", a)
	}
	if err := (Decision{Change: c, Action: ActionCapture}).Validate(); !errors.Is(err, ErrInvalid) {
		t.Fatal("capture is not offered for a modified managed file")
	}
	u, err := Unexpected(loc, obs("v:9", 1, ""))
	if err != nil || u.Managed() {
		t.Fatalf("unexpected: %v", err)
	}
	if err := (Decision{Change: u, Action: ActionCapture, CaptureInto: "gen"}).Validate(); err != nil {
		t.Fatal(err)
	}
	for _, a := range Allowed(KindUnexpected, "") {
		if a == ActionRevert || a == ActionRestore {
			t.Fatal("generated files can never be removed by a decision (INV-EXT-03)")
		}
	}
}
