// Package operation models long-running, traceable executions (import,
// install, deploy, purge, sort, scan...). The model owns its lifecycle
// invariants; every state transition records a domain event.
package operation

import (
	"errors"
	"fmt"
	"time"

	"modorchestrator/internal/core/domain/event"
)

// ID is the unique, opaque identifier of an operation.
type ID string

// Kind names what the operation does. It is an open set: modules register
// their own kinds; the core does not enumerate them.
type Kind string

// Status is the lifecycle state of an operation.
type Status string

const (
	StatusPending   Status = "pending"
	StatusRunning   Status = "running"
	StatusSucceeded Status = "succeeded"
	StatusFailed    Status = "failed"
	StatusCancelled Status = "cancelled"
	// StatusInterrupted marks an operation that was pending/running when the
	// process stopped. It must be surfaced for recovery, never treated as done.
	StatusInterrupted Status = "interrupted"
)

// IsTerminal reports whether no further transition is allowed.
func (s Status) IsTerminal() bool {
	switch s {
	case StatusSucceeded, StatusFailed, StatusCancelled, StatusInterrupted:
		return true
	}
	return false
}

// StepStatus is the state of a single step.
type StepStatus string

const (
	StepPending   StepStatus = "pending"
	StepRunning   StepStatus = "running"
	StepCompleted StepStatus = "completed"
	StepFailed    StepStatus = "failed"
	StepSkipped   StepStatus = "skipped"
)

// Step is a named stage of an operation, declared up front so progress and
// interruption points are explicit.
type Step struct {
	Name       string
	Status     StepStatus
	StartedAt  *time.Time
	FinishedAt *time.Time
}

// Progress of the running step. Total == 0 means indeterminate.
type Progress struct {
	Current int64
	Total   int64
}

// Error is the structured failure of an operation.
type Error struct {
	Code      string
	Message   string
	Step      string
	Detail    string
	Retryable bool
}

func (e *Error) Error() string {
	if e.Step != "" {
		return fmt.Sprintf("%s (step %s): %s", e.Code, e.Step, e.Message)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// Event types emitted by operations.
const (
	EventCreated       event.Type = "operation.created"
	EventStarted       event.Type = "operation.started"
	EventStepStarted   event.Type = "operation.step_started"
	EventStepCompleted event.Type = "operation.step_completed"
	EventStepSkipped   event.Type = "operation.step_skipped"
	EventProgress      event.Type = "operation.progress"
	EventSucceeded     event.Type = "operation.succeeded"
	EventFailed        event.Type = "operation.failed"
	EventCancelled     event.Type = "operation.cancelled"
	EventInterrupted   event.Type = "operation.interrupted"
)

// EventPayload is the payload carried by every operation event: the status
// after the transition plus the fields relevant to it.
type EventPayload struct {
	Kind     Kind
	Status   Status
	Step     string
	Progress *Progress
	Error    *Error
}

// Transition errors.
var (
	ErrInvalidTransition = errors.New("operation: invalid state transition")
	ErrUnknownStep       = errors.New("operation: unknown step")
	ErrInvalidSpec       = errors.New("operation: invalid specification")
)

// Operation is the aggregate root for a tracked execution.
type Operation struct {
	ID          ID
	Kind        Kind
	Subject     event.EntityRef
	Status      Status
	Steps       []Step
	CurrentStep string
	Progress    Progress
	Error       *Error
	CreatedAt   time.Time
	StartedAt   *time.Time
	FinishedAt  *time.Time
	UpdatedAt   time.Time

	pending []event.Event
}

// New creates a pending operation with its declared steps.
func New(id ID, kind Kind, subject event.EntityRef, steps []string, now time.Time) (*Operation, error) {
	if id == "" {
		return nil, fmt.Errorf("%w: empty id", ErrInvalidSpec)
	}
	if kind == "" {
		return nil, fmt.Errorf("%w: empty kind", ErrInvalidSpec)
	}
	seen := make(map[string]struct{}, len(steps))
	declared := make([]Step, 0, len(steps))
	for _, name := range steps {
		if name == "" {
			return nil, fmt.Errorf("%w: empty step name", ErrInvalidSpec)
		}
		if _, dup := seen[name]; dup {
			return nil, fmt.Errorf("%w: duplicated step %q", ErrInvalidSpec, name)
		}
		seen[name] = struct{}{}
		declared = append(declared, Step{Name: name, Status: StepPending})
	}
	op := &Operation{
		ID:        id,
		Kind:      kind,
		Subject:   subject,
		Status:    StatusPending,
		Steps:     declared,
		CreatedAt: now,
		UpdatedAt: now,
	}
	op.record(EventCreated, now, EventPayload{})
	return op, nil
}

// Start moves a pending operation to running.
func (o *Operation) Start(now time.Time) error {
	if o.Status != StatusPending {
		return o.invalid("start")
	}
	o.Status = StatusRunning
	o.StartedAt = &now
	o.touch(now)
	o.record(EventStarted, now, EventPayload{})
	return nil
}

// BeginStep marks a declared step as running. Only one step runs at a time;
// beginning a new step while another runs is an invalid transition.
func (o *Operation) BeginStep(name string, now time.Time) error {
	if o.Status != StatusRunning {
		return o.invalid("begin step")
	}
	if o.CurrentStep != "" {
		return fmt.Errorf("%w: step %q still running", ErrInvalidTransition, o.CurrentStep)
	}
	step, err := o.step(name)
	if err != nil {
		return err
	}
	if step.Status != StepPending {
		return fmt.Errorf("%w: step %q is %s", ErrInvalidTransition, name, step.Status)
	}
	step.Status = StepRunning
	step.StartedAt = &now
	o.CurrentStep = name
	o.Progress = Progress{}
	o.touch(now)
	o.record(EventStepStarted, now, EventPayload{Step: name})
	return nil
}

// CompleteStep finishes the currently running step.
func (o *Operation) CompleteStep(name string, now time.Time) error {
	if o.Status != StatusRunning || o.CurrentStep != name {
		return o.invalid("complete step " + name)
	}
	step, err := o.step(name)
	if err != nil {
		return err
	}
	step.Status = StepCompleted
	step.FinishedAt = &now
	o.CurrentStep = ""
	o.touch(now)
	o.record(EventStepCompleted, now, EventPayload{Step: name})
	return nil
}

// SkipStep marks a pending step as intentionally not executed.
func (o *Operation) SkipStep(name string, now time.Time) error {
	if o.Status != StatusRunning {
		return o.invalid("skip step")
	}
	step, err := o.step(name)
	if err != nil {
		return err
	}
	if step.Status != StepPending {
		return fmt.Errorf("%w: step %q is %s", ErrInvalidTransition, name, step.Status)
	}
	step.Status = StepSkipped
	step.FinishedAt = &now
	o.touch(now)
	o.record(EventStepSkipped, now, EventPayload{Step: name})
	return nil
}

// ReportProgress updates progress of the running operation.
func (o *Operation) ReportProgress(p Progress, now time.Time) error {
	if o.Status != StatusRunning {
		return o.invalid("report progress")
	}
	if p.Current < 0 || p.Total < 0 || (p.Total > 0 && p.Current > p.Total) {
		return fmt.Errorf("%w: progress %d/%d", ErrInvalidSpec, p.Current, p.Total)
	}
	o.Progress = p
	o.touch(now)
	progress := p
	o.record(EventProgress, now, EventPayload{Step: o.CurrentStep, Progress: &progress})
	return nil
}

// Succeed finishes the operation successfully. Every declared step must be
// completed or skipped: an operation cannot claim success over work it did
// not do.
func (o *Operation) Succeed(now time.Time) error {
	if o.Status != StatusRunning || o.CurrentStep != "" {
		return o.invalid("succeed")
	}
	for _, s := range o.Steps {
		if s.Status != StepCompleted && s.Status != StepSkipped {
			return fmt.Errorf("%w: step %q is %s", ErrInvalidTransition, s.Name, s.Status)
		}
	}
	o.finish(StatusSucceeded, now)
	o.record(EventSucceeded, now, EventPayload{})
	return nil
}

// Fail finishes the operation with a structured error. The running step, if
// any, is marked failed and attributed in the error.
func (o *Operation) Fail(cause Error, now time.Time) error {
	if o.Status.IsTerminal() {
		return o.invalid("fail")
	}
	if cause.Code == "" {
		cause.Code = "unknown"
	}
	if o.CurrentStep != "" {
		if cause.Step == "" {
			cause.Step = o.CurrentStep
		}
		if step, err := o.step(o.CurrentStep); err == nil {
			step.Status = StepFailed
			step.FinishedAt = &now
		}
	}
	o.Error = &cause
	o.finish(StatusFailed, now)
	failure := cause
	o.record(EventFailed, now, EventPayload{Step: cause.Step, Error: &failure})
	return nil
}

// Cancel finishes a non-terminal operation at the user's request.
func (o *Operation) Cancel(now time.Time) error {
	if o.Status.IsTerminal() {
		return o.invalid("cancel")
	}
	step := o.CurrentStep
	o.finish(StatusCancelled, now)
	o.record(EventCancelled, now, EventPayload{Step: step})
	return nil
}

// MarkInterrupted records that the process stopped while the operation was
// pending or running. The step that was running is kept in CurrentStep so
// recovery knows where the work stopped.
func (o *Operation) MarkInterrupted(now time.Time) error {
	if o.Status.IsTerminal() {
		return o.invalid("mark interrupted")
	}
	step := o.CurrentStep
	o.Status = StatusInterrupted
	o.FinishedAt = &now
	o.touch(now)
	o.record(EventInterrupted, now, EventPayload{Step: step})
	return nil
}

// PullEvents returns and clears the events recorded since the last call.
func (o *Operation) PullEvents() []event.Event {
	out := o.pending
	o.pending = nil
	return out
}

func (o *Operation) finish(status Status, now time.Time) {
	o.Status = status
	o.CurrentStep = ""
	o.FinishedAt = &now
	o.touch(now)
}

func (o *Operation) touch(now time.Time) { o.UpdatedAt = now }

func (o *Operation) step(name string) (*Step, error) {
	for i := range o.Steps {
		if o.Steps[i].Name == name {
			return &o.Steps[i], nil
		}
	}
	return nil, fmt.Errorf("%w: %q", ErrUnknownStep, name)
}

func (o *Operation) invalid(action string) error {
	return fmt.Errorf("%w: cannot %s while %s", ErrInvalidTransition, action, o.Status)
}

func (o *Operation) record(t event.Type, now time.Time, payload EventPayload) {
	payload.Kind = o.Kind
	payload.Status = o.Status
	o.pending = append(o.pending, event.Event{
		Type:        t,
		OccurredAt:  now,
		OperationID: string(o.ID),
		Subject:     o.Subject,
		Payload:     payload,
	})
}
