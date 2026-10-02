// Package games is the application service behind the Games screen and the
// workspace navigation: discovery, the "manage game" assistant, instance
// upkeep and the detection of deployments by other managers. It decides by
// capability and by adapter contract, never by game identity (D011).
package games

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"sync"

	"modorchestrator/internal/core/application/instancelock"
	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
)

// Keys of ports.AppState used by this module.
const (
	stateActiveInstance = "games.activeInstance"
	stateHiddenGames    = "games.hidden"
)

// Deps are the ports the service needs.
type Deps struct {
	Registry    *Registry
	Instances   ports.GameInstances
	Profiles    ports.Profiles
	State       ports.AppState
	Deployments ports.DeploymentState
	FS          ports.FileSystem
	Drives      ports.DriveLister
	Versions    ports.VersionReader
	Stores      ports.StoreScanner
	// Processes tells whether the game runs (nil: never running).
	Processes ports.ProcessProbe
	Ops         *operations.Service
	// Locks is the per-instance lock shared with every mutating service
	// (D065); a nil value gets a private table (tests).
	Locks *instancelock.Locks
	IDs   operations.IDGenerator
	Clock operations.Clock
}

// Service implements the games use cases.
type Service struct {
	Deps

	mu       sync.Mutex // guards found, scanned, cancels
	found    []ports.Candidate
	scanned  bool
	cancels  map[string]context.CancelFunc
	manageMu sync.Mutex // serializes instance creation
}

// NewService wires the service.
func NewService(d Deps) *Service {
	if d.Locks == nil {
		d.Locks = instancelock.New()
	}
	return &Service{Deps: d, cancels: map[string]context.CancelFunc{}}
}

// Managed is a managed instance with everything the UI shows about it.
type Managed struct {
	Instance   game.Instance
	Definition game.Definition
	// Unavailable means the adapter that created the instance is not
	// registered in this build.
	Unavailable bool
	// RootMissing means the game folder no longer exists.
	RootMissing bool
	Version     string
	Active      bool
	// Foreign are the deployments by other managers found now (INV-DEP-08).
	// They are calculated on every read, never stored (anti-pattern 13).
	Foreign []Finding
	// Deployed tells whether the manager has files deployed in the game.
	Deployed bool
}

// Discovered is an installation found but not managed.
type Discovered struct {
	Candidate  ports.Candidate
	Definition game.Definition
	Hidden     bool
}

// Supported is a game the app supports whose installation was not found.
type Supported struct {
	Definition game.Definition
	Hidden     bool
}

// View is the content of the Games screen.
type View struct {
	Managed    []Managed
	Discovered []Discovered
	Supported  []Supported
	// Scanned is false until the first search finished.
	Scanned bool
	// HiddenCount counts the entries left out because they are hidden.
	HiddenCount int
}

// View builds the Games screen. Hidden entries are included only when
// showHidden is set.
func (s *Service) View(ctx context.Context, showHidden bool) (View, error) {
	instances, err := s.Instances.List(ctx)
	if err != nil {
		return View{}, err
	}
	hidden, err := s.hiddenGames(ctx)
	if err != nil {
		return View{}, err
	}
	active, _ := s.Active(ctx)

	var v View
	managedGames := map[game.ID]bool{}
	managedRoots := map[string]bool{}
	for _, inst := range instances {
		managedGames[inst.Game] = true
		managedRoots[game.CleanAbs(inst.Root)] = true
		m := s.describe(ctx, inst)
		m.Active = inst.ID == active
		if inst.Hidden && !showHidden {
			v.HiddenCount++
			continue
		}
		v.Managed = append(v.Managed, m)
	}

	s.mu.Lock()
	found := slices.Clone(s.found)
	v.Scanned = s.scanned
	s.mu.Unlock()

	discoveredGames := map[game.ID]bool{}
	for _, c := range found {
		def, ok := s.Registry.Definition(c.Game)
		if !ok || managedRoots[game.CleanAbs(c.Root)] {
			continue
		}
		discoveredGames[c.Game] = true
		isHidden := hidden[c.Game]
		if isHidden && !showHidden {
			v.HiddenCount++
			continue
		}
		v.Discovered = append(v.Discovered, Discovered{Candidate: c, Definition: def, Hidden: isHidden})
	}
	for _, def := range s.Registry.Definitions() {
		if def.CustomTargets || managedGames[def.ID] || discoveredGames[def.ID] {
			continue
		}
		isHidden := hidden[def.ID]
		if isHidden && !showHidden {
			v.HiddenCount++
			continue
		}
		v.Supported = append(v.Supported, Supported{Definition: def, Hidden: isHidden})
	}
	return v, nil
}

// Details returns one managed instance.
func (s *Service) Details(ctx context.Context, id game.InstanceID) (Managed, error) {
	inst, err := s.Instances.Get(ctx, id)
	if err != nil {
		return Managed{}, err
	}
	m := s.describe(ctx, inst)
	active, _ := s.Active(ctx)
	m.Active = active == id
	return m, nil
}

// describe gathers the calculated facts about an instance. A failure to
// inspect something leaves that fact empty instead of failing the screen.
func (s *Service) describe(ctx context.Context, inst game.Instance) Managed {
	m := Managed{Instance: inst}
	adapter, ok := s.Registry.ByName(inst.Adapter)
	if !ok {
		m.Unavailable = true
		return m
	}
	def, err := adapter.InstanceDefinition(inst.Game, inst.Targets)
	if err != nil {
		m.Unavailable = true
		return m
	}
	m.Definition = def
	if info, err := s.FS.Stat(ctx, inst.Root); err == nil && !info.Exists {
		m.RootMissing = true
	}
	m.Version = s.version(ctx, adapter, inst.Game, inst.Root)
	m.Foreign, _ = s.CheckForeign(ctx, inst)
	m.Deployed, _ = s.Deployments.Deployed(ctx, inst.ID)
	return m
}

func (s *Service) version(ctx context.Context, a ports.GameAdapter, id game.ID, root string) string {
	file := a.VersionFile(id)
	if file == "" {
		return ""
	}
	v, err := s.Versions.FileVersion(ctx, game.JoinPath(root, file))
	if err != nil {
		return ""
	}
	return v
}

// Active returns the active instance, or "" when none is selected or the
// stored one no longer exists.
func (s *Service) Active(ctx context.Context) (game.InstanceID, error) {
	v, err := s.State.Get(ctx, stateActiveInstance)
	if errors.Is(err, ports.ErrNotFound) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	id := game.InstanceID(v)
	if _, err := s.Instances.Get(ctx, id); err != nil {
		if errors.Is(err, ports.ErrNotFound) {
			return "", nil
		}
		return "", err
	}
	return id, nil
}

// SetActive selects the instance the workspace shows.
func (s *Service) SetActive(ctx context.Context, id game.InstanceID) error {
	if _, err := s.Instances.Get(ctx, id); err != nil {
		return err
	}
	return s.State.Set(ctx, stateActiveInstance, string(id))
}

// Rename changes the display name; names are unique per game.
func (s *Service) Rename(ctx context.Context, id game.InstanceID, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fail(CodeNameEmpty, nil)
	}
	inst, err := s.Instances.Get(ctx, id)
	if err != nil {
		return err
	}
	if err := s.checkNameFree(ctx, inst.Game, name, id); err != nil {
		return err
	}
	inst.DisplayName = name
	return s.Instances.Save(ctx, inst)
}

// SetInstanceHidden hides or shows a managed instance.
func (s *Service) SetInstanceHidden(ctx context.Context, id game.InstanceID, hidden bool) error {
	inst, err := s.Instances.Get(ctx, id)
	if err != nil {
		return err
	}
	inst.Hidden = hidden
	return s.Instances.Save(ctx, inst)
}

// SetGameHidden hides or shows a discovered or supported game.
func (s *Service) SetGameHidden(ctx context.Context, id game.ID, hidden bool) error {
	if _, ok := s.Registry.Definition(id); !ok {
		return fail(CodeGameUnknown, nil, "game", string(id))
	}
	set, err := s.hiddenGames(ctx)
	if err != nil {
		return err
	}
	if hidden {
		set[id] = true
	} else {
		delete(set, id)
	}
	ids := make([]string, 0, len(set))
	for g := range set {
		ids = append(ids, string(g))
	}
	slices.Sort(ids)
	b, _ := json.Marshal(ids)
	return s.State.Set(ctx, stateHiddenGames, string(b))
}

func (s *Service) hiddenGames(ctx context.Context) (map[game.ID]bool, error) {
	out := map[game.ID]bool{}
	v, err := s.State.Get(ctx, stateHiddenGames)
	if errors.Is(err, ports.ErrNotFound) {
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	var ids []string
	if json.Unmarshal([]byte(v), &ids) != nil {
		return out, nil // a corrupt value means nothing is hidden
	}
	for _, id := range ids {
		out[game.ID(id)] = true
	}
	return out, nil
}

// Folder names accepted by FolderPath.
const (
	FolderGame     = "game"
	FolderStaging  = "staging"
	FolderArchives = "archives"
	FolderBackups  = "backups"
)

// FolderPath returns one of the folders of an instance for "open folder".
// The path is never taken from the caller, so only folders the instance
// owns can be opened.
func (s *Service) FolderPath(ctx context.Context, id game.InstanceID, which string) (string, error) {
	inst, err := s.Instances.Get(ctx, id)
	if err != nil {
		return "", err
	}
	var path string
	switch which {
	case FolderGame:
		path = inst.Root
	case FolderStaging:
		path = inst.Staging
	case FolderArchives:
		path = inst.ArchiveStore
	case FolderBackups:
		path = inst.BackupStore
	default:
		return "", fail(CodeFolderUnknown, nil, "folder", which)
	}
	if info, err := s.FS.Stat(ctx, path); err != nil || !info.Exists || !info.IsDir {
		return "", fail(CodeFolderMissing, err, "folder", which)
	}
	return path, nil
}

// lock marks an instance busy; a second mutating operation is refused, not
// queued (D038, anti-pattern 39).
func (s *Service) lock(id game.InstanceID) (func(), error) {
	return s.Locks.Acquire(id, "games")
}

func (s *Service) checkNameFree(ctx context.Context, g game.ID, name string, self game.InstanceID) error {
	all, err := s.Instances.List(ctx)
	if err != nil {
		return err
	}
	for _, o := range all {
		if o.ID != self && o.Game == g && strings.EqualFold(strings.TrimSpace(o.DisplayName), name) {
			return fail(CodeNameTaken, nil, "name", name)
		}
	}
	return nil
}

// definitionOf is the effective definition of an instance (adapter plus the
// targets of the instance).
func definitionOf(a ports.GameAdapter, inst game.Instance) (game.Definition, bool) {
	d, err := a.InstanceDefinition(inst.Game, inst.Targets)
	return d, err == nil
}
