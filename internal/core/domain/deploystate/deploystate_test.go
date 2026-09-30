package deploystate

import (
	"testing"
	"time"

	"modorchestrator/internal/core/domain/deployment"
)

func manifest(t *testing.T, prof deployment.ProfileID, fp deployment.Fingerprint) *deployment.Manifest {
	t.Helper()
	m, err := deployment.NewManifest("i1", prof, fp, "op", time.Time{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func TestCompute(t *testing.T) {
	purged, _ := deployment.NewPurged("i1", "op", time.Time{})
	applied := manifest(t, "p1", "fp1")
	cases := []struct {
		name string
		in   Input
		want Kind
		why  Reason
	}{
		{"never", Input{ActiveProfile: "p1", Desired: "fp1", Verified: true}, NeverDeployed, ReasonNoManifest},
		{"purged", Input{ActiveProfile: "p1", Desired: "fp1", Applied: purged, Verified: true}, NeverDeployed, ReasonPurged},
		{"in sync", Input{ActiveProfile: "p1", Desired: "fp1", Applied: applied, Verified: true}, InSync, ReasonUpToDate},
		{"desired changed", Input{ActiveProfile: "p1", Desired: "fp2", Applied: applied, Verified: true}, Pending, ReasonDesiredChanged},
		{"profile switched", Input{ActiveProfile: "p2", Desired: "fp1", Applied: applied, Verified: true}, Pending, ReasonProfileChanged},
		{"interrupted wins over all", Input{ActiveProfile: "p1", Desired: "fp1", Applied: applied, Verified: true, JournalPending: true, BlockedByDiagnostic: true}, Unknown, ReasonJournalPending},
		{"restored backup", Input{ActiveProfile: "p1", Desired: "fp1", Applied: applied}, Unknown, ReasonNotVerified},
		{"blocked", Input{ActiveProfile: "p1", Desired: "fp2", Applied: applied, Verified: true, BlockedByDiagnostic: true}, Blocked, ReasonBlockingDiagnostic},
		{"failed", Input{ActiveProfile: "p1", Desired: "fp1", Applied: applied, Verified: true, LastDeployFailed: true}, Failed, ReasonLastDeployFailed},
	}
	for _, c := range cases {
		got := Compute(c.in)
		if got.Kind != c.want || got.Reason != c.why {
			t.Errorf("%s: got %s/%s, want %s/%s", c.name, got.Kind, got.Reason, c.want, c.why)
		}
	}
	if s := Compute(Input{ActiveProfile: "p2", Desired: "fp1", Applied: applied, Verified: true}); s.AppliedProfile != "p1" {
		t.Fatal("applied profile is reported for the topbar")
	}
}
