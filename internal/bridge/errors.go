package bridge

import (
	"encoding/json"
	"errors"

	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/settings"
)

// Error codes the bridge can reject a call with (D044, INV-OPS-05). The UI
// translates them; the catalog lives in core/00 §6.
const (
	CodeInternal       = "internal"
	CodeNotFound       = "not_found"
	CodeSettingUnknown = "setting_unknown"
	CodeSettingInvalid = "setting_invalid"
)

// Error is what reaches the UI when a call fails: a stable code, parameters
// for the translated message and a technical detail for "Details". Wails
// rejects the promise with Error(), so it serializes itself as JSON.
type Error struct {
	Code   string            `json:"code"`
	Params map[string]string `json:"params,omitempty"`
	Detail string            `json:"detail,omitempty"`
}

func (e *Error) Error() string {
	b, _ := json.Marshal(e)
	return string(b)
}

// uiError maps core errors to coded bridge errors; params identify the
// subject the UI needs to phrase the message.
func uiError(err error, params map[string]string) error {
	if err == nil {
		return nil
	}
	var coded *Error
	if errors.As(err, &coded) {
		return coded
	}
	// Errors of the games module already carry their own code and params.
	if code, own, ok := games.CodeOf(err); ok {
		merged := map[string]string{}
		for k, v := range params {
			merged[k] = v
		}
		for k, v := range own {
			merged[k] = v
		}
		return &Error{Code: code, Params: merged, Detail: err.Error()}
	}
	code := CodeInternal
	switch {
	case errors.Is(err, appsettings.ErrUnknown):
		code = CodeSettingUnknown
	case errors.Is(err, settings.ErrInvalid):
		code = CodeSettingInvalid
	case errors.Is(err, ports.ErrNotFound), errors.Is(err, operations.ErrNotFound):
		code = CodeNotFound
	}
	return &Error{Code: code, Params: params, Detail: err.Error()}
}
