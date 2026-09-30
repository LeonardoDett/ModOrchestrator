// Package deploystate derives the deployment status of an instance (core/04
// §7). State category: calculated; it is never persisted. The status
// compares the desired fingerprint of the active profile with the manifest,
// and accounts for interrupted deploys, blocking diagnostics and failures.
package deploystate

import "modorchestrator/internal/core/domain/deployment"

// Kind is the status shown in the topbar.
type Kind string

const (
	NeverDeployed Kind = "never_deployed"
	InSync        Kind = "in_sync"
	Pending       Kind = "pending"
	Blocked       Kind = "blocked"
	Failed        Kind = "failed"
	Unknown       Kind = "unknown"
)

// Reason refines the kind.
type Reason string

const (
	ReasonUpToDate           Reason = "up_to_date"
	ReasonNoManifest         Reason = "no_manifest"
	ReasonPurged             Reason = "purged"
	ReasonProfileChanged     Reason = "profile_changed"
	ReasonDesiredChanged     Reason = "desired_changed"
	ReasonJournalPending     Reason = "journal_pending"
	ReasonNotVerified        Reason = "not_verified"
	ReasonBlockingDiagnostic Reason = "blocking_diagnostic"
	ReasonLastDeployFailed   Reason = "last_deploy_failed"
)

// Input gathers the facts the status depends on.
type Input struct {
	ActiveProfile deployment.ProfileID
	Desired       deployment.Fingerprint
	// Applied is nil when the instance was never deployed.
	Applied *deployment.Manifest
	// JournalPending: a deploy/purge journal exists (interrupted, D035).
	JournalPending bool
	// Verified is false after restoring a database backup until a scan runs.
	Verified bool
	// BlockedByDiagnostic: a diagnostic blocks the deploy operation.
	BlockedByDiagnostic bool
	// LastDeployFailed: the last deploy ended with failed locations.
	LastDeployFailed bool
}

// Status is the derived status. AppliedProfile differs from the active one
// while a profile switch is not deployed ("Implantado: A · Ativo: B").
type Status struct {
	Kind           Kind
	Reason         Reason
	AppliedProfile deployment.ProfileID
}

// Compute derives the status; the order of checks is the precedence.
func Compute(in Input) Status {
	s := Status{}
	if in.Applied != nil {
		s.AppliedProfile = in.Applied.Profile
	}
	switch {
	case in.JournalPending:
		s.Kind, s.Reason = Unknown, ReasonJournalPending
	case !in.Verified && in.Applied != nil:
		s.Kind, s.Reason = Unknown, ReasonNotVerified
	case in.BlockedByDiagnostic:
		s.Kind, s.Reason = Blocked, ReasonBlockingDiagnostic
	case in.LastDeployFailed:
		s.Kind, s.Reason = Failed, ReasonLastDeployFailed
	case in.Applied == nil:
		s.Kind, s.Reason = NeverDeployed, ReasonNoManifest
	case in.Applied.Purged():
		s.Kind, s.Reason = NeverDeployed, ReasonPurged
	case in.Applied.Profile != in.ActiveProfile:
		s.Kind, s.Reason = Pending, ReasonProfileChanged
	case in.Applied.Fingerprint != in.Desired:
		s.Kind, s.Reason = Pending, ReasonDesiredChanged
	default:
		s.Kind, s.Reason = InSync, ReasonUpToDate
	}
	return s
}
