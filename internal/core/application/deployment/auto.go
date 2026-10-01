package deployment

import (
	"context"
	"errors"
	"strconv"
	"sync"
	"time"

	"modorchestrator/internal/core/application/instancelock"
	"modorchestrator/internal/core/domain/deploystate"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/profile"
)

// triggers are the committed events that change the desired state (core/04
// §8): enabling, order, rules, overrides, installs, profile switch, mod
// type.
var triggers = map[event.Type]bool{
	"mod.enabled": true, "mod.disabled": true, "order.changed": true,
	"rule.created": true, "rule.removed": true, "rule.disabled": true, "rule.enabled": true,
	"override.set": true, "override.cleared": true, "exclusion.set": true, "exclusion.cleared": true,
	"mod.installed": true, "mod.reinstalled": true, "mod.removed": true, "mod.type_changed": true,
	"profile.activated": true, "profile.transferred": true, "snapshot.restored": true,
}

// AutoDeployer runs a deploy shortly after the desired state changed, if the
// instance setting automation.deployOnChange is on (D036). Changes close in
// time are coalesced (automation.deployDelayMs, default 1.5 s); a busy
// instance is retried after the delay; a plan that needs a decision stops
// before writing (INV-DEP-06).
type AutoDeployer struct {
	svc *Service

	mu      sync.Mutex
	pending map[string]bool // subject refs ("kind:id") waiting for the timer
	timer   *time.Timer
	wg      sync.WaitGroup
	closed  bool
}

// NewAutoDeployer returns a deployer bound to the engine.
func NewAutoDeployer(svc *Service) *AutoDeployer {
	return &AutoDeployer{svc: svc, pending: map[string]bool{}}
}

// Handle receives every committed event (bus subscriber). It never blocks
// and never reads the database: the instance is resolved when the timer
// fires.
func (a *AutoDeployer) Handle(e event.Event) {
	if !triggers[e.Type] {
		return
	}
	ref := e.Subject.Kind + ":" + e.Subject.ID
	if p, ok := e.Payload.(map[string]string); ok && p["profile"] != "" {
		ref = "profile:" + p["profile"]
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.closed {
		return
	}
	a.pending[ref] = true
	a.schedule()
}

func (a *AutoDeployer) delay() time.Duration {
	ms := 1500
	if v, err := a.svc.Settings.AppValue(context.Background(), "automation.deployDelayMs"); err == nil {
		if n, err := strconv.Atoi(v.Value); err == nil && n >= 0 {
			ms = n
		}
	}
	return time.Duration(ms) * time.Millisecond
}

// schedule (re)starts the coalescing timer; a.mu is held.
func (a *AutoDeployer) schedule() {
	if a.timer != nil && a.timer.Stop() {
		a.wg.Done() // a stopped timer never runs its function
	}
	a.wg.Add(1)
	var t *time.Timer
	t = time.AfterFunc(a.delay(), func() {
		defer a.wg.Done()
		a.mu.Lock()
		if a.timer != t {
			a.mu.Unlock()
			return // superseded by a later change
		}
		refs := a.pending
		a.pending = map[string]bool{}
		a.timer = nil
		a.mu.Unlock()
		a.fire(refs)
	})
	a.timer = t
}

// fire resolves the instances and deploys those out of sync.
func (a *AutoDeployer) fire(refs map[string]bool) {
	ctx := context.Background()
	instances := map[game.InstanceID]bool{}
	for ref := range refs {
		if id, ok := a.instanceOf(ctx, ref); ok {
			instances[id] = true
		}
	}
	retry := false
	for id := range instances {
		if !a.svc.boolSetting(ctx, id, "automation.deployOnChange", true) {
			continue
		}
		v, err := a.svc.Status(ctx, id)
		if err != nil {
			continue
		}
		switch v.Status.Kind {
		case deploystate.InSync, deploystate.Unknown:
			continue // nothing to do, or an interruption the user must reconcile
		case deploystate.Blocked:
			if v.Status.Reason != deploystate.ReasonNeedsDecision && v.Status.Reason != deploystate.ReasonExternalChanges {
				continue // a precondition fails: the deploy would only fail
			}
		}
		if _, err := a.svc.AutoDeploy(ctx, id); err != nil {
			var busy *instancelock.BusyError
			if errors.As(err, &busy) {
				a.mu.Lock()
				a.pending["instance:"+string(id)] = true
				a.mu.Unlock()
				retry = true
			}
		}
	}
	if retry {
		a.mu.Lock()
		if !a.closed {
			a.schedule()
		}
		a.mu.Unlock()
	}
}

func (a *AutoDeployer) instanceOf(ctx context.Context, ref string) (game.InstanceID, bool) {
	kind, id := splitRef(ref)
	switch kind {
	case "instance":
		return game.InstanceID(id), true
	case "profile":
		p, err := a.svc.Profiles.Get(ctx, profile.ID(id))
		if err != nil {
			return "", false
		}
		return p.Instance(), true
	case "mod":
		m, err := a.svc.Mods.Get(ctx, mod.ID(id))
		if err != nil {
			return "", false
		}
		return m.Instance, true
	}
	return "", false
}

func splitRef(ref string) (string, string) {
	for i := 0; i < len(ref); i++ {
		if ref[i] == ':' {
			return ref[:i], ref[i+1:]
		}
	}
	return ref, ""
}

// Close stops scheduling and waits for a firing in progress.
func (a *AutoDeployer) Close() {
	a.mu.Lock()
	a.closed = true
	if a.timer != nil && a.timer.Stop() {
		a.wg.Done()
	}
	a.timer = nil
	a.mu.Unlock()
	a.wg.Wait()
}

// Flush fires pending changes now and waits for the deploys they start
// (tests).
func (a *AutoDeployer) Flush() {
	a.mu.Lock()
	if a.timer != nil && a.timer.Stop() {
		a.wg.Done()
	}
	a.timer = nil
	refs := a.pending
	a.pending = map[string]bool{}
	a.mu.Unlock()
	a.fire(refs)
	a.svc.Wait()
}
