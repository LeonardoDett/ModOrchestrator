package library

import (
	"errors"
	"fmt"
	"maps"
	"slices"
	"strings"

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
		return fmt.Sprintf("library: %s: %v", e.code, e.cause)
	}
	return "library: " + e.code
}

func (e *Error) Unwrap() error             { return e.cause }
func (e *Error) Code() string              { return e.code }
func (e *Error) Params() map[string]string { return e.params }

// Error codes of the library (core/02 §11, core/03 §8, D065).
const (
	CodeUnsupportedFormat = "import_unsupported_format"
	CodeArchiveCorrupt    = "archive_corrupt"
	CodeArchiveUnsafe     = "archive_unsafe_path"
	CodeArchiveTooLarge   = "archive_too_large"
	CodeDiskFull          = "disk_full"
	CodeStagingUnavail    = "staging_unavailable"
	CodeInstallerUnsupp   = "installer_unsupported"
	CodeInstallerFailed   = "installer_failed"
	CodeNoInstallable     = "no_installable_files"
	CodeArchiveMissing    = "reinstall_archive_missing"
	CodeModBusy           = "mod_busy"
	CodeNotCancellable    = "operation_not_cancellable"
	CodeNoDecision        = "decision_not_pending"
	CodeCategoryInvalid   = "category_invalid"
	CodeModTypeUnknown    = "mod_type_unknown"
	CodeNameEmpty         = "name_empty"
	CodeSourceMissing     = "import_source_missing"
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

// opError turns any failure into the structured error of the operation. A
// coded error keeps its code; the rest is "internal".
func opError(err error) *operation.Error {
	var oe *operation.Error
	if errors.As(err, &oe) {
		return oe
	}
	var coded interface {
		Code() string
		Params() map[string]string
	}
	if errors.As(err, &coded) {
		var parts []string
		for _, k := range slices.Sorted(maps.Keys(coded.Params())) {
			parts = append(parts, k+"="+coded.Params()[k])
		}
		detail := strings.Join(parts, " ")
		return &operation.Error{Code: coded.Code(), Message: err.Error(), Detail: detail, Params: coded.Params()}
	}
	return &operation.Error{Code: "internal", Message: err.Error()}
}
