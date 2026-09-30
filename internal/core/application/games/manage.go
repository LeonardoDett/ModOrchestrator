package games

import (
	"context"
	"errors"
	"io"
	"slices"
	"strconv"
	"strings"

	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/profile"
	"modorchestrator/internal/core/domain/relpath"
)

// DefaultProfileName is the name of the profile every instance is born with.
const DefaultProfileName = "Default"

// Setup is what the "manage game" assistant collects (core/11 §4). Generic
// games also carry their targets and optional executable.
type Setup struct {
	Game  game.ID
	Name  string
	Root  string
	Store string
	// Targets and Executable are used by games with CustomTargets.
	Targets    []game.TargetSpec
	Executable string
	Folders
	Method game.DeploymentMethod
}

// Folders are the three folders the manager owns for an instance.
type Folders struct {
	Staging      string
	ArchiveStore string
	BackupStore  string
}

// MethodStatus says whether a deployment method can work with this setup and
// why not. Symlink is not offered yet: proving it needs a real attempt, which
// belongs to the deploy engine (F7).
type MethodStatus struct {
	Method    game.DeploymentMethod
	Available bool
	Reason    string
}

// Verification is the result of the assistant's verification step. It is
// read-only and recomputed each time (nothing is persisted).
type Verification struct {
	Name    string
	Root    string
	Version string
	Targets []game.Target
	Folders Folders
	Methods []MethodStatus
	// Foreign are deployments by other managers: they do not stop the
	// assistant, but the new instance is blocked until resolved (D035).
	Foreign []Finding
	// Problems stop the assistant; Warnings do not.
	Problems []Problem
	Warnings []Problem
}

// Result is what Manage returns.
type Result struct {
	Instance  game.InstanceID
	Operation operation.ID
}

// SuggestFolders proposes the folders of a new instance on the volume of the
// game, so hardlinks are possible (core/11 §4).
func (s *Service) SuggestFolders(ctx context.Context, id game.ID, root, name string) (Folders, error) {
	def, ok := s.Registry.Definition(id)
	if !ok {
		return Folders{}, fail(CodeGameUnknown, nil, "game", string(id))
	}
	if strings.TrimSpace(name) == "" {
		name = def.Name
	}
	all, err := s.Instances.List(ctx)
	if err != nil {
		return Folders{}, err
	}
	vol := game.Volume(root)
	if vol == "" {
		vol = "C:"
	}
	base := safeFolderName(name)
	for n := 1; ; n++ {
		label := base
		if n > 1 {
			label = base + " (" + strconv.Itoa(n) + ")"
		}
		dir := game.JoinPath(vol+`\`, "ModOrchestrator", label)
		f := Folders{
			Staging:      game.JoinPath(dir, "staging"),
			ArchiveStore: game.JoinPath(dir, "archives"),
			BackupStore:  game.JoinPath(dir, "backups"),
		}
		if !slices.ContainsFunc(all, func(i game.Instance) bool { return game.Overlaps(i.Staging, dir) }) || n > 50 {
			return f, nil
		}
	}
}

// Verify runs the read-only checks of the assistant: installation, folders,
// available methods and deployments by other managers (core/11 §4).
func (s *Service) Verify(ctx context.Context, su Setup) (Verification, error) {
	adapter, def, err := s.lookup(su.Game)
	if err != nil {
		return Verification{}, err
	}
	var v Verification
	name := strings.TrimSpace(su.Name)
	if name == "" {
		if def.CustomTargets {
			v.Problems = append(v.Problems, problem(CodeNameEmpty))
		} else {
			name = def.Name
		}
	}
	v.Name = name

	root := cleanRoot(su.Root)
	v.Root = root
	if game.Volume(root) == "" {
		v.Problems = append(v.Problems, problem(CodeRootInvalid, "reason", string(game.RootNotAbsolute)))
		return v, nil
	}
	if err := adapter.ValidateRoot(ctx, s.FS, su.Game, root); err != nil {
		code, params, _ := CodeOf(err)
		if code == "" {
			return v, err
		}
		v.Problems = append(v.Problems, Problem{Code: code, Params: params})
		return v, nil
	}
	all, err := s.Instances.List(ctx)
	if err != nil {
		return v, err
	}
	for _, o := range all {
		if game.SamePath(o.Root, root) {
			v.Problems = append(v.Problems, problem(CodeRootInUse, "instance", o.DisplayName))
		}
		if name != "" && o.Game == su.Game && strings.EqualFold(strings.TrimSpace(o.DisplayName), name) {
			v.Problems = append(v.Problems, problem(CodeNameTaken, "name", name))
		}
	}

	targets, err := adapter.Targets(su.Game, root, su.Targets)
	if err != nil {
		v.Problems = append(v.Problems, problem(CodeTargetsInvalid, "detail", err.Error()))
		return v, nil
	}
	v.Targets = targets
	if def.CustomTargets && strings.TrimSpace(su.Executable) != "" {
		if p := s.checkExecutable(ctx, root, su.Executable); p != nil {
			v.Problems = append(v.Problems, *p)
		}
	}
	v.Version = s.version(ctx, adapter, su.Game, root)

	v.Folders = su.Folders
	if v.Folders.Staging == "" || v.Folders.ArchiveStore == "" || v.Folders.BackupStore == "" {
		sug, err := s.SuggestFolders(ctx, su.Game, root, name)
		if err != nil {
			return v, err
		}
		if v.Folders.Staging == "" {
			v.Folders.Staging = sug.Staging
		}
		if v.Folders.ArchiveStore == "" {
			v.Folders.ArchiveStore = sug.ArchiveStore
		}
		if v.Folders.BackupStore == "" {
			v.Folders.BackupStore = sug.BackupStore
		}
	}
	candidate := s.newInstance("", su, adapter, root, name, targets, v.Folders, game.MethodCopy)
	candidate.ID = "verification"
	if err := candidate.Validate(); err != nil {
		v.Problems = append(v.Problems, problem(CodeFoldersInvalid, "detail", err.Error()))
		return v, nil // the checks below assume a coherent placement
	}
	for _, o := range all {
		if foldersOverlap(v.Folders, o) {
			v.Problems = append(v.Problems, problem(CodeFoldersInvalid, "detail", "folders are in use by "+o.DisplayName))
		}
	}
	for _, f := range []struct {
		path, marker, code, label string
	}{
		{v.Folders.Staging, game.StagingMarker, CodeStagingForeign, FolderStaging},
		{v.Folders.ArchiveStore, game.ArchivesMarker, CodeFolderForeign, FolderArchives},
		{v.Folders.BackupStore, game.BackupsMarker, CodeFolderForeign, FolderBackups},
	} {
		p, err := s.checkFolder(ctx, f.path, f.marker, f.code, f.label)
		if err != nil {
			return v, err
		}
		if p != nil {
			v.Problems = append(v.Problems, *p)
		}
	}

	v.Methods = s.methods(ctx, v.Folders.Staging, targets)
	if !v.Methods[0].Available {
		v.Warnings = append(v.Warnings, problem("hardlink_unavailable", "reason", v.Methods[0].Reason))
	}
	if sameVol, err := s.sameVolumeAll(ctx, v.Folders.BackupStore, targets); err == nil && !sameVol {
		v.Warnings = append(v.Warnings, problem("backup_other_volume"))
	}
	v.Foreign, _ = s.CheckForeign(ctx, game.Instance{Root: root, Targets: targets})
	return v, nil
}

// Manage creates the instance and its Default profile, prepares the folders
// with their markers and makes it the active instance. Nothing is managed
// without this explicit call (core/11 §3).
func (s *Service) Manage(ctx context.Context, su Setup) (Result, error) {
	s.manageMu.Lock()
	defer s.manageMu.Unlock()

	id := game.InstanceID(s.IDs.NewID())
	var res Result
	opID, err := s.run(ctx, operations.Spec{Kind: KindManage, Subject: subject(id), Steps: []string{stepValidate, stepFolders, stepRegister}},
		func(ctx context.Context, t *operations.Tracker) error {
			if err := t.BeginStep(ctx, stepValidate); err != nil {
				return err
			}
			v, err := s.Verify(ctx, su)
			if err != nil {
				return err
			}
			if len(v.Problems) > 0 {
				return v.Problems[0].asError()
			}
			method, err := chooseMethod(su.Method, v.Methods)
			if err != nil {
				return err
			}
			adapter, _, _ := s.lookup(su.Game)
			inst := s.newInstance(id, su, adapter, v.Root, v.Name, v.Targets, v.Folders, method)
			if err := inst.Validate(); err != nil {
				return fail(CodeFoldersInvalid, err, "detail", err.Error())
			}
			if err := t.CompleteStep(ctx, stepValidate); err != nil {
				return err
			}

			if err := t.BeginStep(ctx, stepFolders); err != nil {
				return err
			}
			prepared, err := s.prepareFolders(ctx, inst)
			if err != nil {
				s.undo(ctx, prepared)
				return err
			}
			if err := t.CompleteStep(ctx, stepFolders); err != nil {
				s.undo(ctx, prepared)
				return err
			}

			if err := t.BeginStep(ctx, stepRegister); err != nil {
				s.undo(ctx, prepared)
				return err
			}
			if err := s.register(ctx, inst); err != nil {
				s.undo(ctx, prepared)
				return err
			}
			res.Instance = id
			return t.CompleteStep(ctx, stepRegister)
		})
	res.Operation = opID
	if err != nil {
		return res, err
	}
	return res, nil
}

// register saves the instance, its Default profile and makes it active. If
// any part fails the instance is deleted (profiles go with it), so an
// instance never exists without an active profile (INV-ORD-01).
func (s *Service) register(ctx context.Context, inst game.Instance) (err error) {
	now := s.Clock.Now()
	p, err := profile.New(profile.ID(s.IDs.NewID()), inst.ID, DefaultProfileName, now)
	if err != nil {
		return err
	}
	if err := s.Instances.Save(ctx, inst); err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = s.Instances.Delete(context.WithoutCancel(ctx), inst.ID)
		}
	}()
	if err = s.Profiles.Save(ctx, p); err != nil {
		return err
	}
	if err = s.Profiles.SetActive(ctx, inst.ID, p.ID()); err != nil {
		return err
	}
	return s.State.Set(ctx, stateActiveInstance, string(inst.ID))
}

// prepared records what prepareFolders created so a failure can undo it.
type prepared struct {
	markers []string
	dirs    []string
}

func (s *Service) prepareFolders(ctx context.Context, inst game.Instance) (prepared, error) {
	var p prepared
	for _, f := range []struct{ path, marker, kind string }{
		{inst.Staging, game.StagingMarker, FolderStaging},
		{inst.ArchiveStore, game.ArchivesMarker, FolderArchives},
		{inst.BackupStore, game.BackupsMarker, FolderBackups},
	} {
		info, err := s.FS.Stat(ctx, f.path)
		if err != nil {
			return p, err
		}
		if !info.Exists {
			if err := s.FS.MkdirAll(ctx, f.path); err != nil {
				return p, err
			}
			p.dirs = append(p.dirs, f.path)
		}
		marker := game.JoinPath(f.path, f.marker)
		if err := s.FS.WriteFile(ctx, marker, game.NewFolderMarker(f.kind, inst.ID)); err != nil {
			return p, err
		}
		p.markers = append(p.markers, marker)
	}
	return p, nil
}

// undo removes what prepareFolders created: its markers and the folders it
// made, only if they are empty again.
func (s *Service) undo(ctx context.Context, p prepared) {
	ctx = context.WithoutCancel(ctx)
	for _, m := range p.markers {
		_ = s.FS.Remove(ctx, m)
	}
	for _, d := range slices.Backward(p.dirs) {
		_ = s.FS.RemoveEmptyDir(ctx, d)
	}
}

// UnmanageOptions are the explicit choices of "stop managing" (DLG-03).
type UnmanageOptions struct {
	// DeleteFiles also deletes staging, archives and backups. It requires
	// ConfirmName to equal the instance name.
	DeleteFiles bool
	ConfirmName string
}

// Unmanage stops managing an instance. Until the deploy engine exists (F7)
// only an instance with nothing deployed can be unmanaged, so the game is
// never left with deployed files (games.md §7); after F7 the purge step is
// added here. Folders are deleted only when their marker proves they belong
// to this instance.
func (s *Service) Unmanage(ctx context.Context, id game.InstanceID, opt UnmanageOptions) (operation.ID, error) {
	unlock, err := s.lock(id)
	if err != nil {
		return "", err
	}
	defer unlock()
	inst, err := s.Instances.Get(ctx, id)
	if err != nil {
		return "", err
	}
	if opt.DeleteFiles && strings.TrimSpace(opt.ConfirmName) != strings.TrimSpace(inst.DisplayName) {
		return "", fail(CodeConfirmName, nil)
	}
	deployed, err := s.Deployments.Deployed(ctx, id)
	if err != nil {
		return "", err
	}
	if deployed {
		return "", fail(CodeInstanceDeployed, nil, "instance", inst.DisplayName)
	}
	return s.run(ctx, operations.Spec{Kind: KindUnmanage, Subject: subject(id), Steps: []string{stepDeleteData, stepRegister}},
		func(ctx context.Context, t *operations.Tracker) error {
			if opt.DeleteFiles {
				if err := t.BeginStep(ctx, stepDeleteData); err != nil {
					return err
				}
				if err := s.deleteOwnedFolders(ctx, inst); err != nil {
					return err
				}
				if err := t.CompleteStep(ctx, stepDeleteData); err != nil {
					return err
				}
			} else if err := t.SkipStep(ctx, stepDeleteData); err != nil {
				return err
			}
			if err := t.BeginStep(ctx, stepRegister); err != nil {
				return err
			}
			if err := s.Instances.Delete(ctx, id); err != nil {
				return err
			}
			if active, _ := s.State.Get(ctx, stateActiveInstance); active == string(id) {
				if err := s.State.Delete(ctx, stateActiveInstance); err != nil {
					return err
				}
			}
			return t.CompleteStep(ctx, stepRegister)
		})
}

func (s *Service) deleteOwnedFolders(ctx context.Context, inst game.Instance) error {
	for _, f := range []struct{ path, marker string }{
		{inst.Staging, game.StagingMarker},
		{inst.ArchiveStore, game.ArchivesMarker},
		{inst.BackupStore, game.BackupsMarker},
	} {
		owner, ok := s.markerOwner(ctx, f.path, f.marker)
		if !ok || owner != inst.ID {
			continue // not provably ours: never deleted
		}
		if err := s.FS.RemoveAll(ctx, f.path); err != nil {
			return err
		}
	}
	return nil
}

// Relocate points an instance at a new game folder (core/11 §4). The new
// folder must be an installation of the same game. An instance with files
// deployed cannot move until the purge of the old place exists (F7).
func (s *Service) Relocate(ctx context.Context, id game.InstanceID, newRoot string) error {
	unlock, err := s.lock(id)
	if err != nil {
		return err
	}
	defer unlock()
	inst, err := s.Instances.Get(ctx, id)
	if err != nil {
		return err
	}
	adapter, def, err := s.lookupInstance(inst)
	if err != nil {
		return err
	}
	if deployed, err := s.Deployments.Deployed(ctx, id); err != nil {
		return err
	} else if deployed {
		return fail(CodeInstanceDeployed, nil, "instance", inst.DisplayName)
	}
	root := cleanRoot(newRoot)
	if game.Volume(root) == "" {
		return fail(CodeRootInvalid, nil, "reason", string(game.RootNotAbsolute))
	}
	_, err = s.run(ctx, operations.Spec{Kind: KindRelocate, Subject: subject(id), Steps: []string{stepValidate, stepSave}},
		func(ctx context.Context, t *operations.Tracker) error {
			if err := t.BeginStep(ctx, stepValidate); err != nil {
				return err
			}
			if err := adapter.ValidateRoot(ctx, s.FS, inst.Game, root); err != nil {
				return err
			}
			all, err := s.Instances.List(ctx)
			if err != nil {
				return err
			}
			for _, o := range all {
				if o.ID != id && game.SamePath(o.Root, root) {
					return fail(CodeRootInUse, nil, "instance", o.DisplayName)
				}
			}
			var custom []game.TargetSpec
			if def.CustomTargets {
				for _, t := range inst.Targets {
					rel, err := game.RelativeTo(inst.Root, t.Path)
					if err != nil {
						return fail(CodeTargetsInvalid, err, "detail", err.Error())
					}
					custom = append(custom, game.TargetSpec{ID: t.ID, Path: rel})
				}
			}
			targets, err := adapter.Targets(inst.Game, root, custom)
			if err != nil {
				return fail(CodeTargetsInvalid, err, "detail", err.Error())
			}
			moved := inst
			moved.Root, moved.Targets = root, targets
			if err := moved.Validate(); err != nil {
				return fail(CodeFoldersInvalid, err, "detail", err.Error())
			}
			if err := t.CompleteStep(ctx, stepValidate); err != nil {
				return err
			}
			if err := t.BeginStep(ctx, stepSave); err != nil {
				return err
			}
			if err := s.Instances.Save(ctx, moved); err != nil {
				return err
			}
			return t.CompleteStep(ctx, stepSave)
		})
	return err
}

// --- helpers ---

func (s *Service) lookup(id game.ID) (ports.GameAdapter, game.Definition, error) {
	a, ok := s.Registry.Adapter(id)
	if !ok {
		return nil, game.Definition{}, fail(CodeGameUnknown, nil, "game", string(id))
	}
	def, _ := s.Registry.Definition(id)
	return a, def, nil
}

func (s *Service) lookupInstance(inst game.Instance) (ports.GameAdapter, game.Definition, error) {
	a, ok := s.Registry.ByName(inst.Adapter)
	if !ok {
		return nil, game.Definition{}, fail(CodeGameUnknown, nil, "game", string(inst.Game))
	}
	def, ok := definitionOf(a, inst)
	if !ok {
		return nil, game.Definition{}, fail(CodeGameUnknown, nil, "game", string(inst.Game))
	}
	return a, def, nil
}

func (s *Service) newInstance(id game.InstanceID, su Setup, a ports.GameAdapter, root, name string, targets []game.Target, f Folders, m game.DeploymentMethod) game.Instance {
	store := su.Store
	if store == "" {
		store = "manual"
	}
	return game.Instance{
		ID: id, Game: su.Game, Adapter: a.Name(), AdapterVersion: a.Version(), DisplayName: name,
		Root: root, Staging: f.Staging, ArchiveStore: f.ArchiveStore, BackupStore: f.BackupStore,
		Targets: targets, PreferredMethod: m, Store: store, Executable: strings.TrimSpace(su.Executable),
	}
}

func (s *Service) run(ctx context.Context, spec operations.Spec, fn func(context.Context, *operations.Tracker) error) (operation.ID, error) {
	var inner error
	id, err := s.Ops.Run(ctx, spec, func(ctx context.Context, t *operations.Tracker) error {
		inner = fn(ctx, t)
		if inner == nil || errors.Is(inner, context.Canceled) {
			return inner
		}
		e := opError(inner)
		return &e
	})
	if inner != nil {
		return id, inner
	}
	return id, err
}

func (s *Service) checkExecutable(ctx context.Context, root, exe string) *Problem {
	rel, err := relpath.Parse(exe)
	if err != nil {
		p := problem(CodeExecutableBad, "reason", "invalid_path")
		return &p
	}
	info, err := s.FS.Stat(ctx, game.JoinPath(root, rel.String()))
	if err != nil || !info.Exists || info.IsDir {
		p := problem(CodeExecutableBad, "reason", "not_found")
		return &p
	}
	return nil
}

// checkFolder applies the marker rule of core/04 §10: a folder that exists
// must be empty or already marked as ours. A new instance has no marker of
// its own yet, so any existing marker is another instance's.
func (s *Service) checkFolder(ctx context.Context, path, marker, code, label string) (*Problem, error) {
	info, err := s.FS.Stat(ctx, path)
	if err != nil {
		return nil, err
	}
	if !info.Exists {
		return nil, nil
	}
	if !info.IsDir {
		p := problem(CodeFoldersInvalid, "detail", path+" is not a folder")
		return &p, nil
	}
	entries, err := s.FS.ReadDir(ctx, path)
	if err != nil {
		p := problem(code, "folder", label, "reason", "unreadable")
		return &p, nil
	}
	if slices.ContainsFunc(entries, func(e ports.DirEntry) bool { return strings.EqualFold(e.Name, marker) }) {
		p := problem(code, "folder", label, "reason", "other_instance")
		return &p, nil
	}
	if len(entries) > 0 {
		p := problem(code, "folder", label, "reason", "not_empty")
		return &p, nil
	}
	return nil, nil
}

// markerOwner reads the owner of a marker file in path.
func (s *Service) markerOwner(ctx context.Context, path, marker string) (game.InstanceID, bool) {
	r, err := s.FS.Open(ctx, game.JoinPath(path, marker))
	if err != nil {
		return "", false
	}
	defer r.Close()
	data, err := io.ReadAll(io.LimitReader(r, markerReadLimit))
	if err != nil {
		return "", false
	}
	owner, err := game.ParseMarker(data)
	return owner, err == nil
}

func (s *Service) methods(ctx context.Context, staging string, targets []game.Target) []MethodStatus {
	hard := MethodStatus{Method: game.MethodHardlink, Available: true}
	same, err := s.sameVolumeAll(ctx, staging, targets)
	switch {
	case err != nil:
		hard.Available, hard.Reason = false, "unknown"
	case !same:
		hard.Available, hard.Reason = false, "different_volume"
	}
	return []MethodStatus{hard, {Method: game.MethodCopy, Available: true}}
}

func (s *Service) sameVolumeAll(ctx context.Context, path string, targets []game.Target) (bool, error) {
	for _, t := range targets {
		same, err := s.FS.SameVolume(ctx, path, t.Path)
		if err != nil || !same {
			return false, err
		}
	}
	return true, nil
}

// chooseMethod honours the user's pick only if it is available. With no
// pick, hardlink is used when available; copy is never chosen implicitly
// (D033, game.MethodCopy).
func chooseMethod(want game.DeploymentMethod, methods []MethodStatus) (game.DeploymentMethod, error) {
	if want == "" {
		want = game.MethodHardlink
	}
	for _, m := range methods {
		if m.Method == want {
			if !m.Available {
				return "", fail(CodeMethodUnavail, nil, "method", string(want), "reason", m.Reason)
			}
			return want, nil
		}
	}
	return "", fail(CodeMethodUnavail, nil, "method", string(want), "reason", "unsupported")
}

func foldersOverlap(f Folders, o game.Instance) bool {
	mine := []string{f.Staging, f.ArchiveStore, f.BackupStore}
	theirs := []string{o.Staging, o.ArchiveStore, o.BackupStore}
	for _, a := range mine {
		for _, b := range theirs {
			if game.Overlaps(a, b) {
				return true
			}
		}
	}
	return false
}

// cleanRoot normalizes a folder typed or picked by the user: trimmed,
// backslashes, no trailing separator (except a bare drive root).
func cleanRoot(p string) string {
	p = strings.ReplaceAll(strings.TrimSpace(p), "/", `\`)
	trimmed := strings.TrimRight(p, `\`)
	if len(trimmed) == 2 && trimmed[1] == ':' {
		return trimmed + `\`
	}
	return trimmed
}

// safeFolderName makes a display name usable as a folder name.
func safeFolderName(name string) string {
	var b strings.Builder
	for _, r := range strings.TrimSpace(name) {
		if strings.ContainsRune(`<>:"/\|?*`, r) || r < 32 {
			b.WriteRune('_')
			continue
		}
		b.WriteRune(r)
	}
	out := strings.TrimRight(b.String(), ". ")
	if out == "" {
		return "game"
	}
	return out
}
