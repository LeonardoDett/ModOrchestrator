package games

import (
	"errors"
	"fmt"

	"modorchestrator/internal/core/domain/game"
)

// Error is a failure with a stable code and parameters for the translated
// message (D044, D053). The bridge reports it as is; it never carries text
// for the user.
type Error struct {
	code   string
	params map[string]string
	cause  error
}

func (e *Error) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("games: %s: %v", e.code, e.cause)
	}
	return "games: " + e.code
}

func (e *Error) Unwrap() error             { return e.cause }
func (e *Error) Code() string              { return e.code }
func (e *Error) Params() map[string]string { return e.params }

// Error codes of the games module (core/04 §12, core/11).
const (
	CodeGameUnknown      = "game_unknown"
	CodeInstanceBusy     = "instance_busy"
	CodeInstanceDeployed = "instance_deployed"
	CodeNameEmpty        = "name_empty"
	CodeNameTaken        = "name_taken"
	CodeRootInvalid      = "root_invalid"
	CodeRootInUse        = "root_in_use"
	CodeTargetsInvalid   = "targets_invalid"
	CodeFoldersInvalid   = "folders_invalid"
	CodeStagingForeign   = "staging_foreign"
	CodeFolderForeign    = "folder_foreign"
	CodeMethodUnavail    = "method_unavailable"
	CodeExecutableBad    = "executable_invalid"
	CodeConfirmName      = "confirm_name_mismatch"
	CodeFolderUnknown    = "folder_unknown"
	CodeFolderMissing    = "folder_missing"
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

// CodeOf returns the code and parameters of err when it comes from this
// package (or is a game.RootError), and ok=false otherwise.
func CodeOf(err error) (code string, params map[string]string, ok bool) {
	var e *Error
	if errors.As(err, &e) {
		return e.code, e.params, true
	}
	var re *game.RootError
	if errors.As(err, &re) {
		p := map[string]string{"reason": string(re.Reason)}
		if re.Marker != "" {
			p["marker"] = re.Marker
		}
		return CodeRootInvalid, p, true
	}
	return "", nil, false
}

// Problem is a blocking or advisory finding of the setup verification, in
// the same shape as an error so the UI translates both the same way.
type Problem struct {
	Code   string
	Params map[string]string
}

func problem(code string, kv ...string) Problem {
	p := Problem{Code: code}
	if len(kv) > 0 {
		p.Params = map[string]string{}
		for i := 0; i+1 < len(kv); i += 2 {
			p.Params[kv[i]] = kv[i+1]
		}
	}
	return p
}

// asError turns the first blocking problem into an error.
func (p Problem) asError() *Error { return &Error{code: p.Code, params: p.Params} }
