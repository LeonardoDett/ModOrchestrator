// Package instancelock is the per-instance lock of mutating operations
// (D038, D065, INV-OPS-02), shared by every application service so that an
// import, a deploy or a relocation never run together on one instance.
// Reads never take it.
package instancelock

import (
	"sync"

	"modorchestrator/internal/core/domain/game"
)

// CodeBusy is the stable error code of a refused operation.
const CodeBusy = "instance_busy"

// BusyError refuses a second mutating operation; it is never queued
// implicitly (anti-pattern 39).
type BusyError struct {
	Instance game.InstanceID
	// Holder names the kind of work holding the lock (e.g. "import").
	Holder string
}

func (e *BusyError) Error() string {
	return "instance " + string(e.Instance) + " is busy with " + e.Holder
}

// Code and Params make the error translatable by the UI (D053).
func (e *BusyError) Code() string { return CodeBusy }
func (e *BusyError) Params() map[string]string {
	return map[string]string{"instance": string(e.Instance), "holder": e.Holder}
}

// Locks holds the lock of every instance.
type Locks struct {
	mu   sync.Mutex
	held map[game.InstanceID]string
	// frozen names app-wide work (the app update) that refuses every new
	// operation on every instance while it runs.
	frozen string
}

// New returns an empty lock table.
func New() *Locks { return &Locks{held: map[game.InstanceID]string{}} }

// Acquire takes the lock of id for holder, or refuses with *BusyError.
func (l *Locks) Acquire(id game.InstanceID, holder string) (release func(), err error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if h, busy := l.held[id]; busy {
		return nil, &BusyError{Instance: id, Holder: h}
	}
	if l.frozen != "" {
		return nil, &BusyError{Instance: id, Holder: l.frozen}
	}
	l.held[id] = holder
	var once sync.Once
	return func() {
		once.Do(func() {
			l.mu.Lock()
			delete(l.held, id)
			l.mu.Unlock()
		})
	}, nil
}

// Holder reports who holds the lock of id.
func (l *Locks) Holder(id game.InstanceID) (string, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	h, ok := l.held[id]
	return h, ok
}

// Freeze takes every instance at once for app-wide work: it is refused
// while any instance is busy (the holder is reported), and while it is held
// every Acquire is refused with holder as the reason. It is never queued.
func (l *Locks) Freeze(holder string) (release func(), err error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for id, h := range l.held {
		return nil, &BusyError{Instance: id, Holder: h}
	}
	if l.frozen != "" {
		return nil, &BusyError{Holder: l.frozen}
	}
	l.frozen = holder
	var once sync.Once
	return func() {
		once.Do(func() {
			l.mu.Lock()
			l.frozen = ""
			l.mu.Unlock()
		})
	}, nil
}
