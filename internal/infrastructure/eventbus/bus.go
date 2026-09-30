// Package eventbus is an in-process fan-out of committed domain events.
package eventbus

import (
	"sync"

	"modorchestrator/internal/core/domain/event"
)

// Bus delivers events synchronously to every subscriber, in publish order.
// Subscribers must be fast and must not publish re-entrantly.
type Bus struct {
	mu     sync.RWMutex
	nextID int
	subs   map[int]func(event.Event)
}

// New returns an empty bus.
func New() *Bus { return &Bus{subs: map[int]func(event.Event){}} }

// Subscribe registers fn and returns a function that removes it.
func (b *Bus) Subscribe(fn func(event.Event)) (unsubscribe func()) {
	b.mu.Lock()
	defer b.mu.Unlock()
	id := b.nextID
	b.nextID++
	b.subs[id] = fn
	return func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		delete(b.subs, id)
	}
}

// Publish implements operations.Publisher.
func (b *Bus) Publish(events ...event.Event) {
	b.mu.RLock()
	subs := make([]func(event.Event), 0, len(b.subs))
	for _, fn := range b.subs {
		subs = append(subs, fn)
	}
	b.mu.RUnlock()
	for _, e := range events {
		for _, fn := range subs {
			fn(e)
		}
	}
}
