package deployment

import (
	"errors"
	"fmt"
	"maps"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/operation"
)

// Error is a failure with a stable code and parameters for the translated
// message (D044, D053).
type Error struct {
	code   string
	params map[string]string
	cause  error
}

func (e *Error) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("deployment: %s: %v", e.code, e.cause)
	}
	return "deployment: " + e.code
}

func (e *Error) Unwrap() error             { return e.cause }
func (e *Error) Code() string              { return e.code }
func (e *Error) Params() map[string]string { return e.params }

// Error codes of the deploy engine (core/04 §12, D078).
const (
	CodeStagingMissing   = "staging_missing"
	CodeStagingForeign   = "staging_foreign"
	CodeTargetUnavail    = "target_unavailable"
	CodeForeign          = "foreign_deployment"
	CodeModsIncompatible = "mods_incompatible"
	CodeGameRunning      = "game_running"
	CodeInterrupted      = "deploy_interrupted"
	CodeNeedsDecision    = "deploy_needs_decision"
	CodeMethodUnavail    = "method_unavailable"
	CodeDiskFull         = "disk_full"
	CodePathTooLong      = "path_too_long"
	CodeFileLocked       = "file_locked"
	CodePermission       = "permission_denied"
	CodeVerifyFailed     = "verify_failed"
	CodeRuleCycle        = "rule_cycle"
	CodeDeployFailed     = "deploy_failed"
	CodeIOError          = "io_error"
	CodeRaced            = "external_change_raced"
	CodeNothingToPurge   = "nothing_to_purge"
	CodeDecisionGone     = "decision_not_pending"
	CodePurgeIncomplete  = "purge_incomplete"
	CodeFolderInvalid    = "folders_invalid"
	CodeFolderForeign    = "folder_foreign"
	CodeNoJournal        = "nothing_to_reconcile"
	CodeMethodSame       = "method_unchanged"
	CodeStagingSame      = "staging_unchanged"
	CodeArchivesSame     = "archives_unchanged"
	CodeInstanceNotFound = "not_found"
	// CodeDecisionInvalid: an action not offered for the change (core/09
	// §4), or a capture without destination.
	CodeDecisionInvalid = "external_decision_invalid"
	// CodeCaptureTarget: the chosen mod does not deploy to the target of
	// the generated file.
	CodeCaptureTarget = "capture_target_mismatch"
)

func fail(code string, cause error, kv ...string) *Error {
	e := &Error{code: code, cause: cause}
	if len(kv) > 0 {
		e.params = map[string]string{}
		for i := 0; i+1 < len(kv); i += 2 {
			e.params[kv[i]] = kv[i+1]
		}
	}
	return e
}

// fileErrorCode names the failure of one filesystem write.
func fileErrorCode(err error) string {
	switch {
	case errors.Is(err, ports.ErrFileLocked):
		return CodeFileLocked
	case errors.Is(err, ports.ErrDiskFull):
		return CodeDiskFull
	case errors.Is(err, ports.ErrPathTooLong):
		return CodePathTooLong
	case errors.Is(err, ports.ErrPermission):
		return CodePermission
	}
	return CodeIOError
}

// opError turns any error into the structured error of the operation.
func opError(err error) *operation.Error {
	var op *operation.Error
	if errors.As(err, &op) {
		return op
	}
	var coded interface {
		Code() string
		Params() map[string]string
	}
	if errors.As(err, &coded) {
		return &operation.Error{Code: coded.Code(), Message: err.Error(), Params: maps.Clone(coded.Params())}
	}
	return &operation.Error{Code: "internal", Message: err.Error()}
}
