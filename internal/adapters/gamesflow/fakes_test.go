package gamesflow_test

import (
	"context"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"modorchestrator/internal/adapters/generic"
	"modorchestrator/internal/adapters/skyrimse"
	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/profile"
	"modorchestrator/internal/testutil/memfs"
)

type instances struct {
	mu   sync.Mutex
	byID map[game.InstanceID]game.Instance
}

func (r *instances) Get(_ context.Context, id game.InstanceID) (game.Instance, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	i, ok := r.byID[id]
	if !ok {
		return game.Instance{}, ports.ErrNotFound
	}
	return i, nil
}

func (r *instances) List(context.Context) ([]game.Instance, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []game.Instance
	for _, i := range r.byID {
		out = append(out, i)
	}
	sort.Slice(out, func(a, b int) bool { return out[a].ID < out[b].ID })
	return out, nil
}

func (r *instances) Save(_ context.Context, i game.Instance) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.byID[i.ID] = i
	return nil
}

func (r *instances) Delete(_ context.Context, id game.InstanceID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.byID, id)
	return nil
}

type profiles struct {
	byID   map[profile.ID]*profile.Profile
	active map[game.InstanceID]profile.ID
}

func (p *profiles) Get(_ context.Context, id profile.ID) (*profile.Profile, error) {
	if v, ok := p.byID[id]; ok {
		return v, nil
	}
	return nil, ports.ErrNotFound
}

func (p *profiles) ListByInstance(_ context.Context, in game.InstanceID) ([]*profile.Profile, error) {
	var out []*profile.Profile
	for _, v := range p.byID {
		if v.Instance() == in {
			out = append(out, v)
		}
	}
	return out, nil
}
func (p *profiles) Save(_ context.Context, v *profile.Profile) error { p.byID[v.ID()] = v; return nil }
func (p *profiles) Delete(_ context.Context, id profile.ID) error    { delete(p.byID, id); return nil }
func (p *profiles) Active(_ context.Context, in game.InstanceID) (profile.ID, error) {
	if id, ok := p.active[in]; ok {
		return id, nil
	}
	return "", ports.ErrNotFound
}
func (p *profiles) SetActive(_ context.Context, in game.InstanceID, id profile.ID) error {
	p.active[in] = id
	return nil
}
func (p *profiles) SaveSnapshot(context.Context, profile.Snapshot) error { return nil }
func (p *profiles) Snapshots(context.Context, profile.ID) ([]profile.Snapshot, error) {
	return nil, nil
}
func (p *profiles) DeleteSnapshot(context.Context, profile.SnapshotID) error { return nil }

type state map[string]string

func (s state) Get(_ context.Context, k string) (string, error) {
	if v, ok := s[k]; ok {
		return v, nil
	}
	return "", ports.ErrNotFound
}
func (s state) Set(_ context.Context, k, v string) error { s[k] = v; return nil }
func (s state) Delete(_ context.Context, k string) error { delete(s, k); return nil }

type deployments map[game.InstanceID]bool

func (d deployments) Deployed(_ context.Context, id game.InstanceID) (bool, error) { return d[id], nil }

type versions map[string]string

func (v versions) FileVersion(_ context.Context, path string) (string, error) {
	return v[strings.ToLower(path)], nil
}

type stores struct{ installs []ports.StoreInstall }

func (s *stores) Scan(context.Context, []ports.RegistryHint) ([]ports.StoreInstall, error) {
	return s.installs, nil
}

type opsRepo struct {
	mu     sync.Mutex
	ops    map[operation.ID]*operation.Operation
	events []event.Event
}

func (r *opsRepo) Save(_ context.Context, op *operation.Operation, evs []event.Event) ([]event.Event, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	cp := *op
	r.ops[op.ID] = &cp
	for i := range evs {
		evs[i].Sequence = int64(len(r.events) + 1)
		r.events = append(r.events, evs[i])
	}
	return evs, nil
}
func (r *opsRepo) Get(_ context.Context, id operation.ID) (*operation.Operation, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if op, ok := r.ops[id]; ok {
		return op, nil
	}
	return nil, operations.ErrNotFound
}
func (r *opsRepo) ListRecent(context.Context, int) ([]*operation.Operation, error) { return nil, nil }
func (r *opsRepo) ListByStatus(context.Context, ...operation.Status) ([]*operation.Operation, error) {
	return nil, nil
}
func (r *opsRepo) Events(context.Context, operation.ID) ([]event.Event, error) { return nil, nil }

type nopPub struct{}

func (nopPub) Publish(...event.Event) {}

type seqIDs struct {
	mu sync.Mutex
	n  int
}

func (s *seqIDs) NewID() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.n++
	return "id-" + strconv.Itoa(s.n)
}

type clock struct{}

func (clock) Now() time.Time { return time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC) }

// env is a wired service over fakes.
type env struct {
	svc       *games.Service
	fs        *memfs.FS
	instances *instances
	profiles  *profiles
	state     state
	deployed  deployments
	versions  versions
	stores    *stores
	ops       *opsRepo
	deps      games.Deps
}

func newEnv() *env {
	reg, err := games.NewRegistry(generic.Adapter{}, skyrimse.Adapter{})
	if err != nil {
		panic(err)
	}
	e := &env{
		fs:        memfs.New(`C:`, `D:`),
		instances: &instances{byID: map[game.InstanceID]game.Instance{}},
		profiles:  &profiles{byID: map[profile.ID]*profile.Profile{}, active: map[game.InstanceID]profile.ID{}},
		state:     state{},
		deployed:  deployments{},
		versions:  versions{},
		stores:    &stores{},
		ops:       &opsRepo{ops: map[operation.ID]*operation.Operation{}},
	}
	ids := &seqIDs{}
	e.deps = games.Deps{
		Registry: reg, Instances: e.instances, Profiles: e.profiles, State: e.state, Deployments: e.deployed,
		FS: e.fs, Drives: e.fs, Versions: e.versions, Stores: e.stores,
		Ops: operations.NewService(e.ops, nopPub{}, ids, clock{}), IDs: ids, Clock: clock{},
	}
	e.svc = games.NewService(e.deps)
	return e
}

// skyrim adds a Skyrim SE installation and returns its root.
func (e *env) skyrim(root string) string {
	e.fs.AddFile(root+`\SkyrimSE.exe`, "")
	e.fs.AddDir(root + `\Data`)
	return root
}

func waitOperation(t *testing.T, e *env, id string) {
	t.Helper()
	for i := 0; i < 400; i++ {
		e.ops.mu.Lock()
		op := e.ops.ops[operation.ID(id)]
		var status operation.Status
		if op != nil {
			status = op.Status
		}
		e.ops.mu.Unlock()
		if status.IsTerminal() {
			if status != operation.StatusSucceeded {
				t.Fatalf("operation ended %s", status)
			}
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("operation did not finish")
}
