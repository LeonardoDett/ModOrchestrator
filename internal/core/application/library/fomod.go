package library

import (
	"context"
	"errors"
	"io"
	"path"
	"slices"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/fomod"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/installer"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/core/domain/relpath"
	"modorchestrator/internal/core/domain/rules"
)

// eventRuleCreated is the event the rules module records for a new rule;
// the library emits it for requirements confirmed in the FOMOD summary.
const eventRuleCreated event.Type = "rule.created"

// maxFomodImage bounds an image served to the wizard.
const maxFomodImage = 16 << 20

// FomodDecision describes the wizard of a pending fomod decision (DLG-06).
// The steps themselves are read with FomodState, which evaluates every
// selection in the backend (anti-pattern 1).
type FomodDecision struct {
	Module   string
	HasImage bool
	// Previous is the selection of the previous installation, preselected
	// on reinstall (D030); empty otherwise.
	Previous []fomod.Choice
	Warnings []installer.Warning
}

// FomodView is the wizard evaluated for a selection.
type FomodView struct {
	Steps []fomod.StepState
	// Selection is the selection the state shows (defaults included), by
	// group of each visible step.
	Selection []fomod.Choice
	Problems  []fomod.GroupKey
	// Summary is the plan of the selection; nil with PlanError when the
	// selection cannot be installed (a group is invalid, nothing to
	// install).
	Summary   *FomodSummary
	PlanError string
}

// FomodSummary is the last page of the wizard: files by destination,
// warnings and the requirements the module declares.
type FomodSummary struct {
	Files        int
	Size         int64
	Folders      []FolderCount
	Warnings     []installer.Warning
	Requirements []FomodRequirement
}

// FolderCount is the number of files below a top-level folder ("" is the
// mod root).
type FolderCount struct {
	Folder string
	Files  int
}

// FomodRequirement is a file the module requires and the installed mod
// that provides it, when there is one (only those can become rules).
type FomodRequirement struct {
	File    string
	Mod     mod.ID
	ModName string
}

// FomodImage is an image of the installer, served as data (core/03 §7).
type FomodImage struct {
	Mime string
	Data []byte
}

// fomodSession is the wizard of a job waiting for a fomod decision. It
// lives in memory like the decision itself (D064).
type fomodSession struct {
	pkg      *installer.FomodPackage
	entries  []installer.Entry
	ictx     installer.Context
	tmp      string
	instance game.InstanceID
	self     mod.ID
	target   game.TargetID
	// providers maps a file key to the installed mod providing it, loaded
	// on the first summary.
	providers map[string]FomodRequirement
}

// FomodState evaluates a selection of the wizard of operation id: steps
// with visibility, option types and selection, group problems and the
// summary of the resulting plan.
func (s *Service) FomodState(ctx context.Context, id operation.ID, sel fomod.Selection) (FomodView, error) {
	sess, err := s.fomodSession(id)
	if err != nil {
		return FomodView{}, err
	}
	plan, st, perr := installer.FomodPlan(sess.pkg, sess.entries, sess.ictx, sel)
	v := FomodView{Steps: st.Steps, Selection: fomod.Choices(sess.pkg.Module, st.Effective()), Problems: st.Problems()}
	if v.Problems == nil {
		v.Problems = []fomod.GroupKey{}
	}
	switch {
	case errors.Is(perr, installer.ErrInvalidSelection):
		v.PlanError = CodeFomodInvalidSelection
	case errors.Is(perr, installer.ErrNoInstallableFiles):
		v.PlanError = CodeNoInstallable
	case errors.Is(perr, installer.ErrModuleDependencies):
		v.PlanError = CodeFomodModuleDeps
	case perr != nil:
		v.PlanError = CodeInstallerFailed
	default:
		v.Summary = s.fomodSummary(ctx, sess, plan)
	}
	return v, nil
}

// FomodImage returns an image the installer of operation id references
// (module image for "", or an option image). Any other path is refused: images are data,
// never arbitrary files (core/03 §7).
func (s *Service) FomodImage(ctx context.Context, id operation.ID, image string) (FomodImage, error) {
	sess, err := s.fomodSession(id)
	if err != nil {
		return FomodImage{}, err
	}
	m := sess.pkg.Module
	if image == "" {
		image = m.Image
	}
	known := image != "" && (image == m.Image || slices.ContainsFunc(m.Steps, func(st fomod.Step) bool {
		return slices.ContainsFunc(st.Groups, func(g fomod.Group) bool {
			return slices.ContainsFunc(g.Options, func(o fomod.Option) bool { return o.Image == image })
		})
	}))
	mime := imageMime(image)
	p, ok := sess.pkg.ImagePath(sess.entries, image)
	if !known || !ok || mime == "" {
		return FomodImage{}, fail(CodeFomodImage, nil, "image", image)
	}
	r, err := s.FS.Open(ctx, game.JoinPath(sess.tmp, p.String()))
	if err != nil {
		return FomodImage{}, fail(CodeFomodImage, err, "image", image)
	}
	defer r.Close()
	data, err := io.ReadAll(io.LimitReader(r, maxFomodImage+1))
	if err != nil || len(data) > maxFomodImage {
		return FomodImage{}, fail(CodeFomodImage, err, "image", image)
	}
	return FomodImage{Mime: mime, Data: data}, nil
}

func imageMime(p string) string {
	switch strings.ToLower(path.Ext(p)) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".bmp":
		return "image/bmp"
	case ".webp":
		return "image/webp"
	}
	return ""
}

func (s *Service) fomodSession(id operation.ID) (*fomodSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	j := s.findJob(id)
	if j == nil || j.fomod == nil {
		return nil, fail(CodeNoDecision, nil, "operation", string(id))
	}
	return j.fomod, nil
}

// fomodSummary groups the plan by top-level folder and resolves the
// requirements to installed mods.
func (s *Service) fomodSummary(ctx context.Context, sess *fomodSession, plan *installer.Plan) *FomodSummary {
	sum := &FomodSummary{Warnings: plan.Warnings, Requirements: []FomodRequirement{}, Folders: []FolderCount{}}
	if sum.Warnings == nil {
		sum.Warnings = []installer.Warning{}
	}
	counts := map[string]int{}
	for _, f := range plan.Files {
		sum.Files++
		sum.Size += f.Size
		top, _, nested := strings.Cut(f.Dest.String(), "/")
		if !nested {
			top = ""
		}
		counts[strings.ToLower(top)]++
		if counts[strings.ToLower(top)] == 1 {
			sum.Folders = append(sum.Folders, FolderCount{Folder: top})
		}
	}
	for i := range sum.Folders {
		sum.Folders[i].Files = counts[strings.ToLower(sum.Folders[i].Folder)]
	}
	slices.SortFunc(sum.Folders, func(a, b FolderCount) int {
		return strings.Compare(strings.ToLower(a.Folder), strings.ToLower(b.Folder))
	})
	if len(plan.Requirements) > 0 {
		if sess.providers == nil {
			sess.providers = s.fileProviders(ctx, sess.instance, sess.self, sess.target)
		}
		for _, f := range plan.Requirements {
			r := FomodRequirement{File: f}
			if p, ok := sess.providers[fomod.FileKey(f)]; ok {
				r.Mod, r.ModName = p.Mod, p.ModName
			}
			sum.Requirements = append(sum.Requirements, r)
		}
	}
	return sum
}

// fileProviders maps every file of the plugin target provided by an
// installed mod (other than self) to that mod; the first mod in name order
// wins, so the answer is stable.
func (s *Service) fileProviders(ctx context.Context, instance game.InstanceID, self mod.ID, target game.TargetID) map[string]FomodRequirement {
	out := map[string]FomodRequirement{}
	mods, err := s.Mods.ListByInstance(ctx, instance)
	if err != nil {
		return out
	}
	slices.SortFunc(mods, func(a, b *mod.Mod) int { return strings.Compare(a.DisplayName(), b.DisplayName()) })
	for _, m := range mods {
		if m.ID == self || m.State != mod.StateInstalled || m.Installation == "" {
			continue
		}
		inst, err := s.Installations.Get(ctx, m.Installation)
		if err != nil {
			continue
		}
		for _, f := range inst.Files {
			if f.Dest.Target != target {
				continue
			}
			if _, seen := out[f.Dest.Path.Key()]; !seen {
				out[f.Dest.Path.Key()] = FomodRequirement{Mod: m.ID, ModName: m.DisplayName()}
			}
		}
	}
	return out
}

// pluginTarget is the target conditions' files are relative to: the target
// of the default mod type.
func (e env) pluginTarget() game.TargetID {
	if mt, ok := e.def.ModType(game.DefaultModType); ok {
		return mt.Target
	}
	if len(e.def.Targets) > 0 {
		return e.def.Targets[0]
	}
	return ""
}

// fomodEnv computes what the conditions of m read (core/03 §4): a file is
// present when an enabled mod of the active profile provides it (desired
// state) or it exists in the target (observed); a present plugin the
// profile records as disabled is Inactive, any other present file Active
// (D086). Versions come from the game executable and the app.
func (s *Service) fomodEnv(ctx context.Context, e env, m *fomod.Module, self mod.ID) fomod.Env {
	out := fomod.Env{Files: map[string]fomod.FileState{}, ManagerVersion: s.AppVersion}
	if s.Versions != nil {
		if file := e.adapter.VersionFile(e.inst.Game); file != "" {
			if v, err := s.Versions.FileVersion(ctx, game.JoinPath(e.inst.Root, file)); err == nil {
				out.GameVersion = v
			}
		}
	}
	files := m.FileConditions()
	if len(files) == 0 {
		return out
	}
	target := e.pluginTarget()
	targetDir := ""
	for _, t := range e.inst.Targets {
		if t.ID == target {
			targetDir = t.Path
		}
	}
	desired := map[string]bool{}
	pid, perr := s.Profiles.Active(ctx, e.inst.ID)
	pr, err := s.Profiles.Get(ctx, pid)
	if perr == nil && err == nil {
		for _, id := range pr.EnabledMods() {
			if id == self {
				continue
			}
			mm, err := s.Mods.Get(ctx, id)
			if err != nil || mm.State != mod.StateInstalled || mm.Installation == "" {
				continue
			}
			inst, err := s.Installations.Get(ctx, mm.Installation)
			if err != nil {
				continue
			}
			for _, f := range inst.Files {
				if f.Dest.Target == target {
					desired[f.Dest.Path.Key()] = true
				}
			}
		}
	}
	for _, f := range files {
		key := fomod.FileKey(f)
		present := desired[key]
		if !present && targetDir != "" {
			if rp, err := relpath.Parse(f); err == nil {
				info, err := s.FS.Stat(ctx, game.JoinPath(targetDir, rp.String()))
				present = err == nil && info.Exists && !info.IsDir
			}
		}
		if !present {
			continue
		}
		out.Files[key] = fomod.FileActive
		if pr != nil {
			if enabled, known := pr.PluginEnabled(plugin.Name(f)); known && !enabled {
				out.Files[key] = fomod.FileInactive
			}
		}
	}
	return out
}

// addRequirements records the requirements confirmed in the summary as
// DependencyRules with source metadata (core/03 §2), in the install
// transaction.
func (s *Service) addRequirements(ctx context.Context, tx ports.Tx, m *mod.Mod, reqs []FomodRequirement, op operation.ID) error {
	if len(reqs) == 0 {
		return nil
	}
	set, err := tx.Rules().Get(ctx, m.Instance)
	if errors.Is(err, ports.ErrNotFound) {
		set, err = rules.New(m.Instance)
	}
	if err != nil {
		return err
	}
	for _, r := range reqs {
		if r.Mod == "" || r.Mod == m.ID || slices.ContainsFunc(set.DependencyRules(), func(d rules.DependencyRule) bool {
			return d.Mod == m.ID && d.Target == r.Mod && d.Kind == rules.Requires
		}) {
			continue
		}
		id := rules.ID(s.IDs.NewID())
		if err := set.AddDependency(rules.DependencyRule{
			ID: id, Mod: m.ID, Target: r.Mod, Kind: rules.Requires, Source: rules.SourceMetadata,
			Note: r.File, CreatedAt: s.Clock.Now(),
		}); err != nil {
			return err
		}
		tx.Emit(s.newEvent(eventRuleCreated, subjectInstance, string(m.Instance), op, map[string]string{
			"rule": string(id), "kind": string(rules.Requires), "mod": string(m.ID), "target": string(r.Mod), "source": string(rules.SourceMetadata),
		}))
	}
	return tx.Rules().Save(ctx, set)
}
