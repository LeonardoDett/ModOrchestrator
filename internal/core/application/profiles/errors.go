package profiles

import (
	"errors"
	"fmt"

	"modorchestrator/internal/core/domain/rules"
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
		return fmt.Sprintf("profiles: %s: %v", e.code, e.cause)
	}
	return "profiles: " + e.code
}

func (e *Error) Unwrap() error             { return e.cause }
func (e *Error) Code() string              { return e.code }
func (e *Error) Params() map[string]string { return e.params }

// Error codes (core/07 §8, core/05 §7, D069).
const (
	CodeProfileNameTaken = "profile_name_taken"
	CodeProfileIsActive  = "profile_is_active"
	CodeProfileLast      = "profile_last"
	CodeProfileNotFound  = "profile_not_found"
	CodeNameEmpty        = "name_empty"
	CodeOrderViolates    = "order_violates_rules"
	CodeRuleCycle        = "rule_would_create_cycle"
	CodeRuleDuplicate    = "rule_duplicate"
	CodeRuleSelf         = "rule_self_reference"
	CodeRuleNotRemovable = "rule_not_removable"
	CodeRuleNotFound     = "rule_not_found"
	CodeModNotFound      = "mod_not_found"
	CodeSnapshotNotFound = "snapshot_not_found"
	CodeHistoryStale     = "order_history_stale"
	CodeNothingToUndo    = "order_nothing_to_undo"
	CodeSeparatorUnknown = "separator_not_found"
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

// ruleError maps domain rule errors to coded ones.
func ruleError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, rules.ErrCycle):
		return fail(CodeRuleCycle, err)
	case errors.Is(err, rules.ErrDuplicate):
		return fail(CodeRuleDuplicate, err)
	case errors.Is(err, rules.ErrNotRemovable):
		return fail(CodeRuleNotRemovable, err)
	case errors.Is(err, rules.ErrNotFound):
		return fail(CodeRuleNotFound, err)
	}
	return err
}
