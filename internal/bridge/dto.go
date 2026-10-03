package bridge

import (
	"time"

	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/infrastructure/logging"
)

// DTOs are the transport contract with the frontend. They carry data only;
// the frontend must not derive business decisions from them.

type AppInfo struct {
	Name                  string `json:"name"`
	Version               string `json:"version"`
	DataDir               string `json:"dataDir"`
	SchemaVersion         int    `json:"schemaVersion"`
	InterruptedOperations int    `json:"interruptedOperations"`
	LogsDir               string `json:"logsDir"`
	// CustomTitleBar tells the UI whether it draws the window controls.
	CustomTitleBar bool `json:"customTitleBar"`
}

// SettingDTO is one catalog setting with its effective value.
type SettingDTO struct {
	Key             string   `json:"key"`
	Tab             string   `json:"tab"`
	Type            string   `json:"type"`
	Value           string   `json:"value"`
	Default         string   `json:"default"`
	IsDefault       bool     `json:"isDefault"`
	Options         []string `json:"options,omitempty"`
	Min             int      `json:"min,omitempty"`
	Max             int      `json:"max,omitempty"`
	Advanced        bool     `json:"advanced"`
	RestartRequired bool     `json:"restartRequired"`
}

type LogFilterDTO struct {
	Levels    []string `json:"levels"`
	Operation string   `json:"operation"`
	Text      string   `json:"text"`
	Limit     int      `json:"limit"`
}

type LogEntryDTO struct {
	Time      string         `json:"time"`
	Level     string         `json:"level"`
	Message   string         `json:"message"`
	Operation string         `json:"operation,omitempty"`
	Step      string         `json:"step,omitempty"`
	Error     string         `json:"error,omitempty"`
	Fields    map[string]any `json:"fields,omitempty"`
}

func toSettingDTO(e appsettings.Effective) SettingDTO {
	return SettingDTO{
		Key: e.Def.Key, Tab: string(e.Def.Tab), Type: string(e.Def.Type),
		Value: e.Value, Default: e.Default, IsDefault: e.IsDefault,
		Options: e.Def.Options, Min: e.Def.Min, Max: e.Def.Max,
		Advanced: e.Def.Advanced, RestartRequired: e.Def.RestartRequired,
	}
}

func toLogEntryDTO(e logging.Entry) LogEntryDTO {
	dto := LogEntryDTO{Level: e.Level, Message: e.Message, Operation: e.Operation, Step: e.Step, Error: e.Error, Fields: e.Fields}
	if !e.Time.IsZero() {
		dto.Time = formatTime(e.Time)
	}
	return dto
}

type EntityRefDTO struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
}

type StepDTO struct {
	Name       string  `json:"name"`
	Status     string  `json:"status"`
	StartedAt  *string `json:"startedAt,omitempty"`
	FinishedAt *string `json:"finishedAt,omitempty"`
}

type ProgressDTO struct {
	Current int64 `json:"current"`
	Total   int64 `json:"total"`
}

type ErrorDTO struct {
	Code      string            `json:"code"`
	Message   string            `json:"message"`
	Step      string            `json:"step,omitempty"`
	Detail    string            `json:"detail,omitempty"`
	Retryable bool              `json:"retryable"`
	Params    map[string]string `json:"params,omitempty"`
}

type OperationDTO struct {
	ID          string        `json:"id"`
	Kind        string        `json:"kind"`
	Status      string        `json:"status"`
	Subject     *EntityRefDTO `json:"subject,omitempty"`
	Steps       []StepDTO     `json:"steps"`
	CurrentStep string        `json:"currentStep,omitempty"`
	Progress    ProgressDTO   `json:"progress"`
	Error       *ErrorDTO     `json:"error,omitempty"`
	CreatedAt   string        `json:"createdAt"`
	StartedAt   *string       `json:"startedAt,omitempty"`
	FinishedAt  *string       `json:"finishedAt,omitempty"`
	UpdatedAt   string        `json:"updatedAt"`
}

type EventDTO struct {
	ID          string        `json:"id"`
	Sequence    int64         `json:"sequence"`
	Type        string        `json:"type"`
	OccurredAt  string        `json:"occurredAt"`
	OperationID string        `json:"operationId,omitempty"`
	Subject     *EntityRefDTO `json:"subject,omitempty"`
	Status      string        `json:"status,omitempty"`
	Step        string        `json:"step,omitempty"`
	Progress    *ProgressDTO  `json:"progress,omitempty"`
	Error       *ErrorDTO     `json:"error,omitempty"`
	// Data carries the parameters of a delivery signal (notification id,
	// desktop flag), never domain state.
	Data map[string]string `json:"data,omitempty"`
}

func toOperationDTO(op *operation.Operation) OperationDTO {
	steps := make([]StepDTO, len(op.Steps))
	for i, s := range op.Steps {
		steps[i] = StepDTO{Name: s.Name, Status: string(s.Status), StartedAt: timePtr(s.StartedAt), FinishedAt: timePtr(s.FinishedAt)}
	}
	return OperationDTO{
		ID:          string(op.ID),
		Kind:        string(op.Kind),
		Status:      string(op.Status),
		Subject:     refDTO(op.Subject),
		Steps:       steps,
		CurrentStep: op.CurrentStep,
		Progress:    ProgressDTO{Current: op.Progress.Current, Total: op.Progress.Total},
		Error:       errorDTO(op.Error),
		CreatedAt:   formatTime(op.CreatedAt),
		StartedAt:   timePtr(op.StartedAt),
		FinishedAt:  timePtr(op.FinishedAt),
		UpdatedAt:   formatTime(op.UpdatedAt),
	}
}

func toEventDTO(e event.Event) EventDTO {
	dto := EventDTO{
		ID:          e.ID,
		Sequence:    e.Sequence,
		Type:        string(e.Type),
		OccurredAt:  formatTime(e.OccurredAt),
		OperationID: e.OperationID,
		Subject:     refDTO(e.Subject),
	}
	if m, ok := e.Payload.(map[string]string); ok && isSignal(e.Type) {
		dto.Data = m
	}
	if p, ok := e.Payload.(operation.EventPayload); ok {
		dto.Status = string(p.Status)
		dto.Step = p.Step
		dto.Error = errorDTO(p.Error)
		if p.Progress != nil {
			dto.Progress = &ProgressDTO{Current: p.Progress.Current, Total: p.Progress.Total}
		}
	}
	return dto
}

func refDTO(r event.EntityRef) *EntityRefDTO {
	if r.IsZero() {
		return nil
	}
	return &EntityRefDTO{Kind: r.Kind, ID: r.ID}
}

func errorDTO(e *operation.Error) *ErrorDTO {
	if e == nil {
		return nil
	}
	return &ErrorDTO{Code: e.Code, Message: e.Message, Step: e.Step, Detail: e.Detail, Retryable: e.Retryable, Params: e.Params}
}

func formatTime(t time.Time) string { return t.UTC().Format(time.RFC3339Nano) }

func timePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := formatTime(*t)
	return &s
}

// optTime formats a time, "" for the zero time.
func optTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return formatTime(t)
}
