package plugins

import (
	"context"
	"errors"
	"strconv"
	"sync"
	"time"

	"modorchestrator/internal/core/application/instancelock"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
)

// syncTriggers are the committed events that change the plugin inventory
// of a profile (core/08 §3, VORTEX-13 §2): selection, installs, overrides,
// profile switch. The deploy arranges and writes in its own post step.
var syncTriggers = map[event.Type]bool{
	"mod.enabled": true, "mod.disabled": true, "order.changed": true,
	"mod.installed": true, "mod.reinstalled": true, "mod.removed": true, "mod.files_updated": true, "mod.captured": true,
	"override.set": true, "override.cleared": true, "exclusion.set": true, "exclusion.cleared": true,
	"profile.activated": true, "profile.transferred": true, "snapshot.restored": true,
	"rule.created": true, "rule.removed": true, "rule.disabled": true, "rule.enabled": true,
}

// background coalesces the sync after desired state changes, applies the
// load order automatically when automation.deployOnChange is on, and
// watches the game's load order file while the app is open (core/08 §7,
// paridade com deployWatcher/pluginSync).
type background struct {
	s *Service

	mu      sync.Mutex
	sync    bool
	apply   map[game.InstanceID]bool
	timer   *time.Timer
	closed  bool
	stop    chan struct{}
	wg      sync.WaitGroup
	delay   time.Duration
	started bool
}

func newBackground(s *Service) *background {
	return &background{s: s, apply: map[game.InstanceID]bool{}, stop: make(chan struct{}), delay: 400 * time.Millisecond}
}

// Handle receives every committed event (bus subscriber). It never blocks.
func (b *background) Handle(e event.Event) {
	if !syncTriggers[e.Type] {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.sync = true
	b.schedule()
}

// Handle is the bus subscriber of the service.
func (s *Service) Handle(e event.Event) { s.bg.Handle(e) }

// applyLater asks for the load order of an instance to be written soon,
// if the instance applies changes automatically.
func (b *background) applyLater(instance game.InstanceID) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.apply[instance] = true
	b.schedule()
}

// schedule (re)starts the coalescing timer; b.mu is held.
func (b *background) schedule() {
	if b.closed {
		return
	}
	if b.timer != nil {
		b.timer.Stop()
	}
	b.wg.Add(1)
	t := time.AfterFunc(b.delay, func() {
		defer b.wg.Done()
		b.run()
	})
	if b.timer != nil {
		b.wg.Done() // the stopped timer will never run
	}
	b.timer = t
}

func (b *background) run() {
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return
	}
	b.timer = nil
	doSync := b.sync
	b.sync = false
	apply := b.apply
	b.apply = map[game.InstanceID]bool{}
	b.mu.Unlock()
	ctx := context.Background()
	retry := false
	if doSync {
		list, err := b.s.Instances.List(ctx)
		if err == nil {
			for _, inst := range list {
				if !b.s.Supported(ctx, inst.ID) {
					continue
				}
				err := b.s.Sync(ctx, inst.ID)
				var busy *instancelock.BusyError
				if errors.As(err, &busy) {
					retry = true
				}
			}
		}
	}
	for id := range apply {
		if !b.s.boolSetting(ctx, id, "automation.deployOnChange", false) {
			continue
		}
		if err := b.s.autoApply(ctx, id); err != nil {
			var busy *instancelock.BusyError
			if errors.As(err, &busy) {
				b.mu.Lock()
				b.apply[id] = true
				b.mu.Unlock()
				retry = true
			}
		}
	}
	if retry {
		b.mu.Lock()
		if doSync {
			b.sync = true
		}
		b.schedule()
		b.mu.Unlock()
	}
}

// autoApply writes the load order without an operation of its own (it is
// the automatic counterpart of the deploy's post step; the event carries
// origin auto). An external change is left for the triage.
func (s *Service) autoApply(ctx context.Context, instance game.InstanceID) error {
	release, err := s.Locks.Acquire(instance, holderApply)
	if err != nil {
		return err
	}
	defer release()
	st, err := s.load(ctx, instance)
	if err != nil {
		return err
	}
	_, err = s.write(ports.WithEventTags(ctx, map[string]string{ports.TagOrigin: ports.OriginAuto}), st, "", false)
	if errors.Is(err, errExternal) {
		return nil
	}
	return err
}

func (b *background) close() {
	b.mu.Lock()
	b.closed = true
	if b.timer != nil && b.timer.Stop() {
		b.wg.Done()
	}
	b.timer = nil
	if b.started {
		close(b.stop)
	}
	b.mu.Unlock()
	b.wg.Wait()
}

func (b *background) wait() { b.wg.Wait() }

// fileSeen is the last observation of a load order file by the monitor.
type fileSeen struct {
	path     string
	size     int64
	modTime  time.Time
	hash     string
	external bool
	known    bool
}

// remember records a file the manager has just written.
func (s *Service) remember(instance game.InstanceID, path, hash string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.seen[instance] = fileSeen{path: path, hash: hash, known: true}
}

// StartMonitor watches the load order files every interval while the app
// is open: a change outside the app raises the diagnostic at once and is
// never overwritten (core/08 §7, INV-PLG-03).
func (s *Service) StartMonitor(interval time.Duration) {
	b := s.bg
	b.mu.Lock()
	if b.started || b.closed {
		b.mu.Unlock()
		return
	}
	b.started = true
	b.wg.Add(1)
	b.mu.Unlock()
	go func() {
		defer b.wg.Done()
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-b.stop:
				return
			case <-t.C:
				ctx := context.Background()
				list, err := s.Instances.List(ctx)
				if err != nil {
					continue
				}
				for _, inst := range list {
					_ = s.CheckFile(ctx, inst.ID)
				}
			}
		}
	}()
}

// CheckFile looks at the load order file of an instance; when it changed
// since the last look, it is compared with the last write and a change of
// the external state is signalled (diagnostics and screens read again).
func (s *Service) CheckFile(ctx context.Context, instance game.InstanceID) error {
	inst, err := s.Instances.Get(ctx, instance)
	if err != nil {
		return err
	}
	_, _, lo, err := s.support(inst)
	if err != nil || lo == nil {
		return nil
	}
	loc := lo.LoadOrderFile(inst)
	base, err := s.Folders.Folder(loc.Folder)
	if err != nil {
		return err
	}
	p := game.JoinPath(base, loc.Path)
	info, err := s.FS.Stat(ctx, p)
	if err != nil {
		return nil
	}
	s.mu.Lock()
	prev := s.seen[instance]
	s.mu.Unlock()
	if prev.known && prev.path == p && prev.size == info.Size && prev.modTime.Equal(info.ModTime) && prev.hash != "" == info.Exists {
		return nil
	}
	if s.Locks != nil {
		if _, busy := s.Locks.Holder(instance); busy {
			return nil // a deploy or a write is in flight; look again later
		}
	}
	st, err := s.load(ctx, instance)
	if err != nil {
		return err
	}
	fs, err := s.fileState(ctx, st, st.arrange(st.settings.autoSort).order)
	if err != nil {
		return err
	}
	next := fileSeen{path: p, size: info.Size, modTime: info.ModTime, hash: fs.obs.hash, external: fs.external, known: true}
	s.mu.Lock()
	s.seen[instance] = next
	s.mu.Unlock()
	if prev.known && prev.external == next.external {
		return nil
	}
	if !prev.known && !next.external {
		return nil
	}
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		tx.Emit(s.newEvent(EventExternalChange, subjectInstance, string(instance), map[string]string{
			"instance": string(instance), "external": strconv.FormatBool(next.external),
		}))
		return nil
	})
}
