package eventbus

import (
	"testing"

	"modorchestrator/internal/core/domain/event"
)

func TestPublishFansOutAndUnsubscribes(t *testing.T) {
	b := New()
	var a, c []event.Type
	unsubA := b.Subscribe(func(e event.Event) { a = append(a, e.Type) })
	b.Subscribe(func(e event.Event) { c = append(c, e.Type) })

	b.Publish(event.Event{Type: "x"}, event.Event{Type: "y"})
	unsubA()
	b.Publish(event.Event{Type: "z"})

	if len(a) != 2 || a[0] != "x" || a[1] != "y" {
		t.Fatalf("a = %v", a)
	}
	if len(c) != 3 || c[2] != "z" {
		t.Fatalf("c = %v", c)
	}
}
