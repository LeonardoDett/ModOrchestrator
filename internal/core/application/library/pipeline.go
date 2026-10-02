package library

import (
	"context"
	"errors"
	"fmt"
	"io"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/fomod"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/installer"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/profile"
	"modorchestrator/internal/core/domain/relpath"
)

// suspiciousRatio is the extracted/compressed ratio that needs the user's
// confirmation (core/02 §2).
const suspiciousRatio = 1000

// pipeline is the state of one import/install/reinstall (core/02 §3).
type pipeline struct {
	s   *Service
	j   *job
	t   *operations.Tracker
	env env

	source       string // file or folder read by the extractor
	format       string
	size         int64
	hash         string
	originalName string
	meta         installer.Metadata

	archive    *mod.Archive
	newArchive bool
	m          *mod.Mod
	variantOf  mod.ID
	label      string
	prev       *mod.Installation
	firstInst  bool

	entries []installer.Entry
	sel     installer.Selection
	plan    *installer.Plan
	// requirements are the FOMOD requirements the user confirmed.
	requirements []FomodRequirement

	began, placed, swapped, committed bool
	tmp, staged                       string
}

func (s *Service) runJob(ctx context.Context, j *job) error {
	p := &pipeline{s: s, j: j, t: j.tracker}
	err := p.run(ctx)
	if err != nil {
		p.abort(context.WithoutCancel(ctx), err)
	}
	return err
}

func (p *pipeline) run(ctx context.Context) error {
	if err := p.step(ctx, StepValidate, p.validate); err != nil {
		return err
	}
	if p.j.kind == KindImport {
		for _, st := range []struct {
			name string
			fn   func(context.Context) error
		}{{StepHash, p.hashSource}, {StepDedupe, p.dedupe}, {StepRetain, p.retain}} {
			if err := p.step(ctx, st.name, st.fn); err != nil {
				return err
			}
		}
	} else {
		for _, name := range []string{StepHash, StepDedupe, StepRetain} {
			if err := p.t.SkipStep(ctx, name); err != nil {
				return err
			}
		}
	}
	for _, st := range []struct {
		name string
		fn   func(context.Context) error
	}{
		{StepInspect, p.inspect}, {StepSelectInstaller, p.selectInstaller}, {StepExtract, p.extract},
		{StepPlanInstall, p.planInstall}, {StepStage, p.stage}, {StepCommit, p.commit}, {StepPost, p.post},
	} {
		if err := p.step(ctx, st.name, st.fn); err != nil {
			return err
		}
	}
	return nil
}

func (p *pipeline) step(ctx context.Context, name string, fn func(context.Context) error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := p.t.BeginStep(ctx, name); err != nil {
		return err
	}
	if err := fn(ctx); err != nil {
		return err
	}
	return p.t.CompleteStep(ctx, name)
}

// --- validate ---

func (p *pipeline) validate(ctx context.Context) error {
	e, err := p.s.env(ctx, p.j.instance)
	if err != nil {
		return err
	}
	p.env = e
	if info, err := p.s.FS.Stat(ctx, e.inst.Staging); err != nil || !info.Exists || !info.IsDir ||
		!p.s.ownsFolder(ctx, e.inst.Staging, game.StagingMarker, e.inst.ID) {
		return fail(CodeStagingUnavail, err, "folder", e.inst.Staging)
	}
	if p.j.kind == KindImport {
		p.source = p.j.source
		p.originalName = baseName(p.source)
		info, err := p.s.FS.Stat(ctx, p.source)
		if err != nil || !info.Exists {
			return fail(CodeSourceMissing, err, "name", p.originalName)
		}
		p.size = info.Size
		format, err := p.s.Extractor.Detect(ctx, p.source)
		if err != nil {
			return fail(CodeUnsupportedFormat, err, "name", p.originalName)
		}
		p.format = format
		p.meta = installer.NameFromArchive(p.originalName)
		return nil
	}
	m, err := p.s.Mods.Get(ctx, p.j.mod)
	if err != nil {
		return err
	}
	want := mod.StateInstalled
	if p.j.kind == KindInstall {
		want = mod.StateImported
	}
	if m.State != want {
		return fail(CodeModBusy, nil, "mod", m.DisplayName())
	}
	a, err := p.s.archiveOf(ctx, m)
	if err != nil || !a.Retained() {
		return fail(CodeArchiveMissing, err, "mod", m.DisplayName())
	}
	p.archive, p.m = a, m
	p.source, p.format, p.size, p.originalName = e.archivePath(a), string(a.Kind), a.Size, a.OriginalName
	if info, err := p.s.FS.Stat(ctx, p.source); err != nil || !info.Exists {
		return fail(CodeArchiveMissing, err, "mod", m.DisplayName())
	}
	p.meta = installer.NameFromArchive(p.originalName)
	if m.Installation != "" {
		if p.prev, err = p.s.Installations.Get(ctx, m.Installation); err != nil {
			return err
		}
	}
	return p.begin(ctx, nil)
}

// begin marks the mod installing before anything is written to the staging
// (D064), saving the archive with it when this operation retained one.
func (p *pipeline) begin(ctx context.Context, archive *mod.Archive) error {
	now := p.s.Clock.Now()
	opID := p.t.ID()
	err := p.s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		if archive != nil {
			if err := tx.Archives().Save(ctx, archive); err != nil {
				return err
			}
			tx.Emit(p.s.newEvent(EventArchiveRetained, subjectArchive, string(archive.ID), opID,
				map[string]string{"name": archive.OriginalName, "retained": strconv.FormatBool(archive.Retained())}))
		}
		if p.m == nil {
			id := mod.ID(p.s.IDs.NewID())
			name := strings.TrimSpace(p.meta.Name)
			if name == "" {
				name = p.originalName
			}
			m, err := mod.New(id, p.env.inst.ID, name, mod.Source{Kind: mod.SourceManualFile, Ref: p.originalName}, now)
			if err != nil {
				return err
			}
			if err := m.SetSource(p.archive, now); err != nil {
				return err
			}
			m.Attributes.Version = p.meta.Version
			if p.variantOf != "" {
				if err := m.MarkVariant(p.variantOf, p.label, now); err != nil {
					return err
				}
			}
			p.m = m
			tx.Emit(p.s.newEvent(EventModImported, subjectMod, string(id), opID, map[string]string{"name": name, "archive": p.originalName}))
		} else if archive != nil {
			// replace (update): the new archive becomes the source.
			if err := p.m.SetSource(archive, now); err != nil {
				return err
			}
		}
		p.firstInst = p.m.Installation == ""
		if err := p.m.BeginInstall(now); err != nil {
			return fail(CodeModBusy, err, "mod", p.m.DisplayName())
		}
		return tx.Mods().Save(ctx, p.m)
	})
	if err != nil {
		return err
	}
	p.began = true
	return nil
}

// --- hash, dedupe, retain (import only) ---

func (p *pipeline) hashSource(ctx context.Context) error {
	if p.format != "folder" {
		r, err := p.s.FS.Open(ctx, p.source)
		if err != nil {
			return fail(CodeSourceMissing, err, "name", p.originalName)
		}
		defer r.Close()
		h, err := p.s.Hasher.Hash(ctx, r)
		if err != nil {
			return err
		}
		p.hash = h
		return nil
	}
	// A folder is identified by a canonical manifest of its files (D063).
	raw, err := p.s.Extractor.List(ctx, p.source)
	if err != nil {
		return mapArchiveErr(err, p.originalName)
	}
	slices.SortFunc(raw, func(a, b ports.ArchiveEntry) int {
		return strings.Compare(strings.ToLower(a.Path), strings.ToLower(b.Path))
	})
	var manifest strings.Builder
	var total int64
	for i, e := range raw {
		if e.IsDir || e.IsLink {
			continue
		}
		r, err := p.s.FS.Open(ctx, game.JoinPath(p.source, e.Path))
		if err != nil {
			return fail(CodeSourceMissing, err, "name", p.originalName)
		}
		h, err := p.s.Hasher.Hash(ctx, r)
		r.Close()
		if err != nil {
			return err
		}
		fmt.Fprintf(&manifest, "%s\t%d\t%s\n", strings.ToLower(strings.ReplaceAll(e.Path, `\`, "/")), e.Size, h)
		total += e.Size
		_ = p.t.Progress(ctx, int64(i+1), int64(len(raw)))
	}
	h, err := p.s.Hasher.Hash(ctx, strings.NewReader(manifest.String()))
	if err != nil {
		return err
	}
	p.hash, p.size = h, total
	return nil
}

func (p *pipeline) dedupe(ctx context.Context) error {
	archives, err := p.s.Archives.ByHash(ctx, p.env.inst.ID, p.hash)
	if err != nil {
		return err
	}
	mods, err := p.s.Mods.ListByInstance(ctx, p.env.inst.ID)
	if err != nil {
		return err
	}
	live := slices.DeleteFunc(mods, func(m *mod.Mod) bool { return m.State == mod.StateRemoved })
	byArchive := map[mod.ArchiveID]*mod.Archive{}
	for _, a := range archives {
		byArchive[a.ID] = a
	}
	var sameHash, sameName []DuplicateMod
	for _, m := range live {
		d := DuplicateMod{ID: m.ID, Name: m.DisplayName(), Version: m.Attributes.Version}
		switch {
		case byArchive[m.Archive] != nil:
			sameHash = append(sameHash, d)
		case strings.EqualFold(strings.TrimSpace(m.Name), strings.TrimSpace(p.meta.Name)):
			sameName = append(sameName, d)
		}
	}
	label := p.meta.Version
	if label == "" {
		label = p.originalName
	}
	var d *Decision
	switch {
	case len(sameHash) > 0:
		d = &Decision{Kind: DecisionDuplicateArchive, Duplicates: sameHash, SuggestedLabel: label}
	case len(sameName) > 0:
		d = &Decision{Kind: DecisionDuplicateName, Duplicates: sameName, SuggestedLabel: label}
	}
	// An identical archive that is still retained is reused instead of
	// being stored twice.
	for _, a := range archives {
		if a.Retained() {
			p.archive = a
			break
		}
	}
	if d == nil {
		return nil
	}
	a, err := p.s.ask(ctx, p.j, *d)
	if err != nil {
		return err
	}
	target := func() (*mod.Mod, error) {
		id := a.Mod
		if id == "" {
			id = d.Duplicates[0].ID
		}
		if !slices.ContainsFunc(d.Duplicates, func(x DuplicateMod) bool { return x.ID == id }) {
			return nil, fail(CodeNoDecision, nil, "mod", string(id))
		}
		return p.s.Mods.Get(ctx, id)
	}
	switch a.Choice {
	case ChoiceReinstall, ChoiceReplace:
		m, err := target()
		if err != nil {
			return err
		}
		if m.State == mod.StateInstalling {
			return fail(CodeModBusy, nil, "mod", m.DisplayName())
		}
		p.m = m
		if a.Choice == ChoiceReplace {
			p.archive = nil // the new archive becomes the source
		}
		if m.Installation != "" {
			if p.prev, err = p.s.Installations.Get(ctx, m.Installation); err != nil {
				return err
			}
		}
	case ChoiceVariant:
		m, err := target()
		if err != nil {
			return err
		}
		p.variantOf = m.ID
		if p.label = strings.TrimSpace(a.Label); p.label == "" {
			p.label = d.SuggestedLabel
		}
	}
	return nil
}

func (p *pipeline) retain(ctx context.Context) error {
	if p.archive != nil && p.archive.Retained() {
		// Same content already in the ArchiveStore.
		p.source, p.format = p.env.archivePath(p.archive), string(p.archive.Kind)
		return p.begin(ctx, nil)
	}
	id := mod.ArchiveID(p.t.ID()) // provable ownership on recovery (D064)
	name := storedName(p.originalName)
	var stored relpath.Path
	if p.s.stringSetting(ctx, "mods.importRetention", "copy") != "none" {
		free, err := p.s.FS.FreeSpace(ctx, p.env.inst.ArchiveStore)
		if err == nil && free < p.size {
			return fail(CodeDiskFull, nil, "folder", p.env.inst.ArchiveStore)
		}
		partial := game.JoinPath(p.env.inst.ArchiveStore, string(id)+".partial")
		final := game.JoinPath(p.env.inst.ArchiveStore, string(id))
		if err := p.s.FS.MkdirAll(ctx, partial); err != nil {
			return err
		}
		dst := game.JoinPath(partial, name)
		if p.format == "folder" {
			if err := p.s.FS.MkdirAll(ctx, dst); err != nil {
				return err
			}
			if err := p.s.Extractor.Extract(ctx, p.source, dst, ports.ExtractOptions{}); err != nil {
				return mapArchiveErr(err, p.originalName)
			}
		} else if err := p.s.FS.Copy(ctx, p.source, dst); err != nil {
			return err
		}
		if err := p.s.FS.Rename(ctx, partial, final); err != nil {
			return err
		}
		stored = relpath.MustParse(string(id) + "/" + name)
	}
	a, err := mod.NewArchive(id, p.env.inst.ID, p.originalName, mod.ArchiveKind(p.format), p.size, p.hash, stored, p.s.Clock.Now())
	if err != nil {
		return err
	}
	p.archive, p.newArchive = a, true
	if a.Retained() {
		p.source = p.env.archivePath(a)
	}
	return p.begin(ctx, a)
}

// storedName keeps the original file name when it is a valid path segment.
func storedName(name string) string {
	if p, err := relpath.Parse(name); err == nil && !strings.Contains(p.String(), "/") {
		return p.String()
	}
	return "archive"
}

// --- inspect, select, extract, plan ---

func (p *pipeline) inspect(ctx context.Context) error {
	raw, err := p.s.Extractor.List(ctx, p.source)
	if err != nil {
		return mapArchiveErr(err, p.originalName)
	}
	in := make([]installer.RawEntry, len(raw))
	for i, e := range raw {
		in[i] = installer.RawEntry{Path: e.Path, Size: e.Size, Dir: e.IsDir, Link: e.IsLink}
	}
	entries, unsafe := installer.Inspect(in)
	if len(unsafe) > 0 {
		var list []string
		for _, u := range unsafe {
			list = append(list, u.Raw)
		}
		return fail(CodeArchiveUnsafe, nil, "name", p.originalName, "entries", strings.Join(list, "\n"), "count", strconv.Itoa(len(list)))
	}
	if files, _ := installer.Totals(entries); files == 0 {
		return fail(CodeArchiveCorrupt, nil, "name", p.originalName, "reason", "empty")
	}
	limits := p.limits(ctx)
	compressed := p.size
	if p.format == "folder" {
		compressed = 0
	}
	suspicious, err := limits.Check(entries, compressed)
	var le *installer.LimitError
	if errors.As(err, &le) {
		return fail(CodeArchiveTooLarge, err, "name", p.originalName, "limit", le.Limit, "value", strconv.FormatInt(le.Value, 10), "max", strconv.FormatInt(le.Max, 10))
	}
	if suspicious {
		_, total := installer.Totals(entries)
		if _, err := p.s.ask(ctx, p.j, Decision{Kind: DecisionSuspiciousRatio, Ratio: total / max(compressed, 1)}); err != nil {
			return err
		}
	}
	p.entries = entries
	return nil
}

func (p *pipeline) limits(ctx context.Context) installer.Limits {
	return installer.Limits{
		MaxEntries:      int(p.s.intSetting(ctx, "import.maxEntries", 500000)),
		MaxSize:         p.s.intSetting(ctx, "import.maxExtractedSizeGB", 64) << 30,
		SuspiciousRatio: suspiciousRatio,
	}
}

func (p *pipeline) selectInstaller(context.Context) error {
	ictx, stack := p.env.installContext()
	sel, err := installer.Select(stack, p.entries, ictx, "")
	if err != nil {
		return fail(CodeInstallerUnsupp, err, "name", p.originalName)
	}
	p.sel = sel
	return nil
}

func (p *pipeline) extract(ctx context.Context) error {
	p.tmp = game.JoinPath(p.env.tmpRoot(), string(p.t.ID()))
	_ = p.s.FS.RemoveAll(ctx, p.tmp)
	if err := p.s.FS.MkdirAll(ctx, p.tmp); err != nil {
		return err
	}
	_, total := installer.Totals(p.entries)
	if free, err := p.s.FS.FreeSpace(ctx, p.env.inst.Staging); err == nil && free < total {
		return fail(CodeDiskFull, nil, "folder", p.env.inst.Staging)
	}
	report := throttle(func(n int64) { _ = p.t.Progress(ctx, min(n, total), total) })
	err := p.s.Extractor.Extract(ctx, p.source, p.tmp, ports.ExtractOptions{MaxBytes: p.limits(ctx).MaxSize, Progress: report})
	if err != nil {
		return mapArchiveErr(err, p.originalName)
	}
	return nil
}

func (p *pipeline) planInstall(ctx context.Context) error {
	ictx, _ := p.env.installContext()
	ictx.Content = p.content(ctx)
	fomodInst := p.sel.Installer.ID() == installer.FomodID
	if fomodInst {
		pkg, err := installer.LoadFomod(p.entries, ictx)
		if err != nil {
			return fail(CodeFomodInvalidXML, err, "name", p.originalName)
		}
		if pkg != nil {
			ictx.Fomod = p.s.fomodEnv(ctx, p.env, pkg.Module, p.m.ID)
		}
	}
	opts := p.previousOptions(fomodInst)
	for {
		res, err := p.sel.Installer.Plan(p.entries, ictx, opts)
		var deps *installer.ModuleDependenciesError
		switch {
		case errors.Is(err, installer.ErrInvalidOption):
			opts = nil // the recorded root or choices no longer apply: ask again
			continue
		case errors.Is(err, installer.ErrNoInstallableFiles):
			return fail(CodeNoInstallable, err, "name", p.originalName)
		case errors.As(err, &deps):
			return fail(CodeFomodModuleDeps, err, "name", p.originalName, "unmet", unmetNames(deps.Unmet))
		case errors.Is(err, installer.ErrInvalidFomod):
			return fail(CodeFomodInvalidXML, err, "name", p.originalName)
		case errors.Is(err, installer.ErrInvalidSelection):
			return fail(CodeFomodInvalidSelection, err, "name", p.originalName)
		case err != nil:
			return fail(CodeInstallerFailed, err, "name", p.originalName)
		}
		if res.Decision != nil && res.Decision.Kind == installer.DecisionFomod {
			a, sess, err := p.askFomod(ctx, ictx, res.Decision.Fomod)
			if err != nil {
				return err
			}
			opts = installer.Options{installer.OptionFomod: fomod.Encode(sess.pkg.Module, a.Fomod)}
			p.requirements = p.confirmedRequirements(ctx, sess, a.Requirements)
			continue
		}
		if res.Decision != nil {
			a, err := p.s.ask(ctx, p.j, Decision{Kind: string(res.Decision.Kind), Candidates: res.Decision.Candidates, Folders: res.Decision.Folders})
			if err != nil {
				return err
			}
			opts = installer.Options{installer.OptionRoot: strings.Trim(strings.ReplaceAll(a.Root, `\`, "/"), "/")}
			continue
		}
		p.plan = res.Plan
		break
	}
	if rel, ok := installer.InfoXMLPath(p.entries); ok {
		if r, err := p.s.FS.Open(ctx, game.JoinPath(p.tmp, rel)); err == nil {
			data, _ := io.ReadAll(io.LimitReader(r, installer.MaxInfoXMLSize+1))
			r.Close()
			if info, err := installer.ParseInfoXML(data); err == nil {
				p.meta = info.Merge(p.meta)
			}
		}
	}
	return nil
}

// unmetNames turns the failing terms ("file:SkyUI_SE.esp:Active",
// "game:1.6.640") into the names the message shows.
func unmetNames(unmet []string) string {
	out := make([]string, 0, len(unmet))
	for _, u := range unmet {
		parts := strings.SplitN(u, ":", 3)
		if len(parts) >= 2 {
			u = parts[1]
		}
		out = append(out, u)
	}
	return strings.Join(out, ", ")
}

// content reads extracted files for installers (FOMOD XML), bounded by the
// XML size limit (core/03 §7).
func (p *pipeline) content(ctx context.Context) func(relpath.Path) ([]byte, error) {
	return func(rp relpath.Path) ([]byte, error) {
		r, err := p.s.FS.Open(ctx, game.JoinPath(p.tmp, rp.String()))
		if err != nil {
			return nil, err
		}
		defer r.Close()
		return io.ReadAll(io.LimitReader(r, fomod.MaxXMLSize+1))
	}
}

// previousOptions are the recorded options of a reinstall. FOMOD choices
// are not applied silently: they preselect the wizard (D030). An
// installation made before the FOMOD installer existed (a folder chosen by
// hand) also goes through the wizard.
func (p *pipeline) previousOptions(fomodInst bool) installer.Options {
	if p.prev == nil {
		return nil
	}
	if v, ok := p.prev.Options[installer.OptionFomod]; ok && fomodInst {
		return installer.Options{installer.OptionFomodPrevious: v}
	}
	if fomodInst && p.prev.Installer != installer.FomodID && installer.HasModuleConfig(p.entries) {
		return nil
	}
	return installer.Options(p.prev.Options)
}

// askFomod opens the wizard (DLG-06) and waits for the selection. The
// session lives while the decision is pending.
func (p *pipeline) askFomod(ctx context.Context, ictx installer.Context, req *installer.FomodRequest) (Answer, *fomodSession, error) {
	sess := &fomodSession{
		pkg: req.Package, entries: p.entries, ictx: ictx, tmp: p.tmp,
		instance: p.env.inst.ID, self: p.m.ID, target: p.env.pluginTarget(),
	}
	_, hasImage := req.Package.ImagePath(p.entries, req.Package.Module.Image)
	d := &FomodDecision{Module: req.Package.Module.Name, HasImage: hasImage, Previous: []fomod.Choice{}, Warnings: req.Warnings}
	if req.Previous != nil {
		d.Previous = fomod.Choices(req.Package.Module, req.Previous)
	}
	if d.Warnings == nil {
		d.Warnings = []installer.Warning{}
	}
	p.s.mu.Lock()
	p.j.fomod = sess
	p.s.mu.Unlock()
	defer func() {
		p.s.mu.Lock()
		p.j.fomod = nil
		p.s.mu.Unlock()
	}()
	a, err := p.s.ask(ctx, p.j, Decision{Kind: string(installer.DecisionFomod), Fomod: d})
	return a, sess, err
}

// confirmedRequirements keeps the requirements the user ticked that an
// installed mod provides.
func (p *pipeline) confirmedRequirements(ctx context.Context, sess *fomodSession, files []string) []FomodRequirement {
	if len(files) == 0 {
		return nil
	}
	if sess.providers == nil {
		sess.providers = p.s.fileProviders(ctx, sess.instance, sess.self, sess.target)
	}
	var out []FomodRequirement
	for _, f := range files {
		if r, ok := sess.providers[fomod.FileKey(f)]; ok {
			r.File = f
			out = append(out, r)
		}
	}
	return out
}

// --- stage, commit, post ---

func (p *pipeline) stage(ctx context.Context) error {
	p.s.setCancellable(p.j, false)
	folder := p.env.modFolder(p.m.ID)
	p.staged = folder + ".installing"
	_ = p.s.FS.RemoveAll(ctx, p.staged)
	if err := p.s.FS.MkdirAll(ctx, p.staged); err != nil {
		return err
	}
	used := map[string]string{}
	for i, f := range p.plan.Files {
		dst := game.JoinPath(p.staged, f.Dest.String())
		if err := p.s.FS.MkdirAll(ctx, parentDir(dst)); err != nil {
			return err
		}
		if first, dup := used[f.Source.Key()]; dup {
			if err := p.s.FS.Copy(ctx, first, dst); err != nil {
				return err
			}
		} else {
			if err := p.s.FS.Rename(ctx, game.JoinPath(p.tmp, f.Source.String()), dst); err != nil {
				return err
			}
			used[f.Source.Key()] = dst
		}
		if i%200 == 0 {
			_ = p.t.Progress(ctx, int64(i+1), int64(len(p.plan.Files)))
		}
	}
	for _, f := range p.plan.Files {
		info, err := p.s.FS.Stat(ctx, game.JoinPath(p.staged, f.Dest.String()))
		if err != nil || !info.Exists || info.IsDir || info.Size != f.Size {
			return fail(CodeInstallerFailed, err, "name", p.originalName, "file", f.Dest.String())
		}
	}
	if info, err := p.s.FS.Stat(ctx, folder); err != nil {
		return err
	} else if info.Exists {
		if err := p.s.FS.Rename(ctx, folder, folder+".replaced"); err != nil {
			return err
		}
		p.swapped = true
	}
	if err := p.s.FS.Rename(ctx, p.staged, folder); err != nil {
		return err
	}
	p.placed = true
	return nil
}

func (p *pipeline) commit(ctx context.Context) error {
	now := p.s.Clock.Now()
	opID := p.t.ID()
	typ := p.m.Type
	if p.firstInst {
		typ = p.plan.ModType
	}
	mt, ok := p.env.def.ModType(typ)
	if !ok {
		mt, _ = p.env.def.ModType(game.DefaultModType)
	}
	files := make([]mod.File, len(p.plan.Files))
	for i, f := range p.plan.Files {
		files[i] = mod.File{Source: f.Dest, Dest: game.Location{Target: mt.Target, Path: f.Dest}, Size: f.Size}
	}
	inst, err := mod.NewInstallation(mod.InstallationID(p.s.IDs.NewID()), p.m.ID, p.env.inst.ID, p.plan.Installer, p.plan.Options, files, now)
	if err != nil {
		return fail(CodeInstallerFailed, err, "name", p.originalName)
	}
	enable := p.s.boolSetting(ctx, p.env.inst.ID, "automation.enableOnInstall", true)
	active, _ := p.s.Profiles.Active(ctx, p.env.inst.ID)
	edges := p.s.orderEdges(ctx, p.env.inst.ID)
	err = p.s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		m, err := tx.Mods().Get(ctx, p.m.ID)
		if err != nil {
			return err
		}
		if err := m.SetType(mt.ID, now); err != nil {
			return err
		}
		if p.firstInst && strings.TrimSpace(p.meta.Name) != "" && m.VariantOf == "" {
			m.Name = strings.TrimSpace(p.meta.Name)
		}
		if m.Attributes.Version == "" {
			m.Attributes.Version = p.meta.Version
		}
		if m.Attributes.Author == "" {
			m.Attributes.Author = p.meta.Author
		}
		if m.Attributes.Description == "" {
			m.Attributes.Description = p.meta.Description
		}
		m.Content = p.env.adapter.ContentFlags(p.env.inst.Game, inst.Footprint())
		if err := m.CompleteInstall(inst, now); err != nil {
			return err
		}
		if err := tx.Installations().Save(ctx, inst); err != nil {
			return err
		}
		if p.prev != nil {
			if err := tx.Installations().Delete(ctx, p.prev.ID); err != nil {
				return err
			}
		}
		if err := tx.Mods().Save(ctx, m); err != nil {
			return err
		}
		if err := addToProfiles(ctx, tx, m, active, enable, edges, now); err != nil {
			return err
		}
		if err := p.s.addRequirements(ctx, tx, m, p.requirements, opID); err != nil {
			return err
		}
		evType := EventModInstalled
		if !p.firstInst {
			evType = EventModReinstalled
		}
		tx.Emit(p.s.newEvent(evType, subjectMod, string(m.ID), opID, map[string]string{
			"name": m.DisplayName(), "installer": inst.Installer, "installation": string(inst.ID),
			"files": strconv.Itoa(len(inst.Files)), "type": string(m.Type),
		}))
		p.m = m
		return nil
	})
	if err != nil {
		return err
	}
	p.committed = true
	return nil
}

// addToProfiles gives an installed mod its entry in every profile of the
// instance: at the end of the ModOrder (a variant right below its
// original), enabled only in the active profile when "enable on install" is
// on (core/02 §8, D066).
func addToProfiles(ctx context.Context, tx ports.Tx, m *mod.Mod, active profile.ID, enable bool, edges []orderEdge, now time.Time) error {
	profiles, err := tx.Profiles().ListByInstance(ctx, m.Instance)
	if err != nil {
		return err
	}
	for _, pr := range profiles {
		if _, ok := pr.ModState(m.ID); ok {
			continue
		}
		if err := pr.AddMod(m.ID, enable && pr.ID() == active, now); err != nil {
			return err
		}
		if m.VariantOf != "" {
			if i := slices.IndexFunc(pr.Order(), func(e profile.Entry) bool { return e.Mod == m.VariantOf }); i >= 0 {
				// A position that breaks an order rule is refused and the
				// mod stays at the end; the rule wins (D025).
				_ = pr.Move([]profile.Entry{{Mod: m.ID}}, i+1, edges, now)
			}
		}
		// The engine places the new mod where the order rules require, moving
		// the minimum (core/05 §4, INV-ORD-03). A cycle can only come from
		// metadata and is a blocking diagnostic (F9); the order is kept.
		if _, err := pr.Reorder(edges, now); err != nil && !errors.Is(err, ordering.ErrCycle) {
			return err
		}
		if err := tx.Profiles().Save(ctx, pr); err != nil {
			return err
		}
	}
	return nil
}

func (p *pipeline) post(ctx context.Context) error {
	_ = p.s.FS.RemoveAll(ctx, p.tmp)
	_ = p.s.FS.RemoveEmptyDir(ctx, p.env.tmpRoot())
	if p.swapped {
		_ = p.s.FS.RemoveAll(ctx, p.env.modFolder(p.m.ID)+".replaced")
	}
	if p.newArchive && p.archive.Retained() && p.format != "folder" && p.s.stringSetting(ctx, "mods.importRetention", "copy") == "move" {
		// "move" removes the original only now, after the commit, so a crash
		// never loses the user's file (D064).
		_ = p.s.FS.Remove(ctx, p.j.source)
	}
	return nil
}

// abort brings everything back to the last consistent state (INV-LIB-01):
// temporary folders go away, a swapped folder comes back, and the mod
// returns to installed (previous installation) or imported.
func (p *pipeline) abort(ctx context.Context, cause error) {
	if p.committed {
		return
	}
	if p.tmp != "" {
		_ = p.s.FS.RemoveAll(ctx, p.tmp)
		_ = p.s.FS.RemoveEmptyDir(ctx, p.env.tmpRoot())
	}
	if p.m != nil {
		folder := p.env.modFolder(p.m.ID)
		if p.placed {
			_ = p.s.FS.RemoveAll(ctx, folder)
		}
		if p.swapped {
			_ = p.s.FS.Rename(ctx, folder+".replaced", folder)
		}
	}
	if p.staged != "" {
		_ = p.s.FS.RemoveAll(ctx, p.staged)
	}
	if !p.began {
		return
	}
	reason := opError(cause).Code
	if errors.Is(cause, context.Canceled) {
		reason = "cancelled"
	}
	_ = p.s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		m, err := tx.Mods().Get(ctx, p.m.ID)
		if err != nil {
			return err
		}
		if err := m.AbortInstall(p.s.Clock.Now()); err != nil {
			return err
		}
		tx.Emit(p.s.newEvent(EventModInstallAborted, subjectMod, string(m.ID), p.t.ID(), map[string]string{"name": m.DisplayName(), "reason": reason}))
		return tx.Mods().Save(ctx, m)
	})
}

// --- helpers ---

func (s *Service) archiveOf(ctx context.Context, m *mod.Mod) (*mod.Archive, error) {
	if m.Archive == "" {
		return nil, ports.ErrNotFound
	}
	return s.Archives.Get(ctx, m.Archive)
}

// mapArchiveErr turns extractor errors into the stable codes of core/02 §11.
func mapArchiveErr(err error, name string) error {
	switch {
	case errors.Is(err, context.Canceled):
		return err
	case errors.Is(err, ports.ErrArchiveUnsupported):
		return fail(CodeUnsupportedFormat, err, "name", name)
	case errors.Is(err, ports.ErrArchiveEncrypted):
		return fail(CodeArchiveCorrupt, err, "name", name, "reason", "encrypted")
	case errors.Is(err, ports.ErrArchiveUnsafe):
		return fail(CodeArchiveUnsafe, err, "name", name, "entries", "", "count", "1")
	case errors.Is(err, ports.ErrArchiveTooLarge):
		return fail(CodeArchiveTooLarge, err, "name", name, "limit", "size")
	case errors.Is(err, ports.ErrArchiveCorrupt):
		return fail(CodeArchiveCorrupt, err, "name", name, "reason", "damaged")
	}
	return err
}

func parentDir(p string) string {
	i := strings.LastIndexAny(p, `\/`)
	if i <= 0 {
		return p
	}
	return p[:i]
}

// throttle limits progress events (each one is persisted) to a few per
// second.
func throttle(fn func(int64)) func(int64) {
	var mu sync.Mutex
	var last time.Time
	return func(n int64) {
		mu.Lock()
		defer mu.Unlock()
		if now := time.Now(); now.Sub(last) >= 250*time.Millisecond {
			last = now
			fn(n)
		}
	}
}
