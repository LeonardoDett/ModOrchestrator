package deployment

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strconv"
	"strings"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/deployplan"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/externalchange"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/relpath"
)

// Library is what the triage of external changes asks the mod library
// (core/09 §4–5): installations are the library's, the staging writes and
// the moves out of the game are the engine's.
type Library interface {
	// UpdateInstalledFiles records new content of files already in the
	// staging of m (kept edit, file saved to the mod).
	UpdateInstalledFiles(ctx context.Context, instance game.InstanceID, m mod.ID, files []mod.File) (mod.InstallationID, error)
	// RegisterCapture records generated files moved into the staging of m:
	// a new mod with name, type and category, or a new installation of an
	// existing one (D046).
	RegisterCapture(ctx context.Context, instance game.InstanceID, m mod.ID, name string, typ game.ModTypeID, category string, files []mod.File) (mod.InstallationID, error)
	// ReinstallMods reinstalls from the retained archives (revert of a
	// hardlink edit).
	ReinstallMods(ctx context.Context, instance game.InstanceID, ids []mod.ID) ([]operation.ID, error)
}

// Exclusions hides locations from a mod (FileExclusion, accepted removal).
type Exclusions interface {
	SetFileExclusions(ctx context.Context, instance game.InstanceID, m mod.ID, locs []game.Location, hidden bool) error
}

// Event types of the triage (core/09).
const (
	EventExternalDecided      event.Type = "deployment.external_changes_decided"
	EventExternalAutoRestored event.Type = "deployment.external_missing_restored"
)

// DecisionInput is the user's choice for one row of DLG-15.
type DecisionInput struct {
	Location game.Location
	Action   externalchange.Action
	// CaptureInto is the existing mod receiving a captured file; empty
	// means a new mod named CaptureName in category CaptureCategory (the
	// UI proposes "Arquivos gerados — <data>" and "Gerados").
	CaptureInto     mod.ID
	CaptureName     string
	CaptureCategory string
}

// FileFacts are the size and time shown before/after in DLG-15.
type FileFacts struct {
	Size    int64
	ModTime time.Time
}

// ChangeView is one row of DLG-15 (and of the untouched list of DLG-14).
type ChangeView struct {
	Location game.Location
	Kind     externalchange.Kind
	Mod      mod.ID
	ModName  string
	Method   game.DeploymentMethod
	Wanted   bool
	// Actions are the choices offered (core/09 §4); Suggested is the one
	// pre-selected ("" for generated files: nothing is pre-selected).
	Actions   []externalchange.Action
	Suggested externalchange.Action
	// Before is what the manifest recorded; After what the scan saw.
	Before, After *FileFacts
}

// ChangesView is the result of a scan outside a deploy ("Verificar
// implantação", DLG-15 review).
type ChangesView struct {
	Instance     game.InstanceID
	Changes      []ChangeView
	ChangeCount  int
	NewFileCount int
}

func (s *Service) changeView(c externalchange.Change, in *inputs) ChangeView {
	v := ChangeView{Location: c.Location, Kind: c.Kind, Method: c.Method(), Wanted: c.Wanted,
		Actions: externalchange.Actions(c), Suggested: externalchange.Suggested(c)}
	if c.Expected != nil {
		v.Mod = c.Expected.Mod
		v.Before = &FileFacts{Size: c.Expected.Evidence.Size, ModTime: c.Expected.Evidence.ModTime}
		if in != nil {
			if m, ok := in.mods[c.Expected.Mod]; ok {
				v.ModName = m.DisplayName()
			}
		}
	}
	if c.Observed.Exists && !c.Observed.IsDir {
		v.After = &FileFacts{Size: c.Observed.Evidence.Size, ModTime: c.Observed.Evidence.ModTime}
	}
	return v
}

// views turns changes into rows, managed ones first, bounded per kind of
// list (counts stay complete).
func (s *Service) views(managed, unexpected []externalchange.Change, in *inputs) []ChangeView {
	out := make([]ChangeView, 0, min(len(managed), viewLimit)+min(len(unexpected), viewLimit))
	for i, c := range managed {
		if i == viewLimit {
			break
		}
		out = append(out, s.changeView(c, in))
	}
	for i, c := range unexpected {
		if i == viewLimit {
			break
		}
		out = append(out, s.changeView(c, in))
	}
	return out
}

// --- Detection ---

// baselineKey stores, per instance, when the current deployment started:
// generated files are the unmanaged files created after it (core/09 §2).
func baselineKey(instance game.InstanceID) string { return "deployment.baseline." + string(instance) }

func (s *Service) baseline(ctx context.Context, instance game.InstanceID, m *deployment.Manifest) time.Time {
	if raw, err := s.State.Get(ctx, baselineKey(instance)); err == nil {
		if t, err := time.Parse(time.RFC3339Nano, raw); err == nil {
			return t
		}
	}
	return m.AppliedAt
}

// recordBaseline keeps the start of a deployment across deploys and forgets
// it after a complete purge.
func (s *Service) recordBaseline(ctx context.Context, instance game.InstanceID, prev, next *deployment.Manifest) {
	switch {
	case next == nil || next.Purged():
		_ = s.State.Delete(ctx, baselineKey(instance))
	case prev == nil || prev.Purged():
		_ = s.State.Set(ctx, baselineKey(instance), next.AppliedAt.UTC().Format(time.RFC3339Nano))
	default:
		if _, err := s.State.Get(ctx, baselineKey(instance)); errors.Is(err, ports.ErrNotFound) {
			_ = s.State.Set(ctx, baselineKey(instance), prev.AppliedAt.UTC().Format(time.RFC3339Nano))
		}
	}
}

// unexpectedLimit bounds the entries a search for generated files visits.
const unexpectedLimit = 200_000

// folder is a folder of a target searched for generated files.
type folder struct {
	target game.TargetID
	rel    string // "" is the target root
	deep   bool
}

// findUnexpected lists files in folders that hold managed files (direct
// children) or that the adapter declares as tool outputs (with subfolders),
// that the manager does not own, nobody decided to leave unmanaged, and
// that were created or changed after the deployment started (core/09 §2–3).
// Locations the desired state wants are left to the plan (D034 backup).
func (s *Service) findUnexpected(ctx context.Context, inst game.Instance, def game.Definition, m *deployment.Manifest, wanted map[string]bool) ([]externalchange.Change, error) {
	if m == nil || m.Purged() || len(m.Links()) == 0 {
		return nil, nil
	}
	since := s.baseline(ctx, inst.ID, m)
	known := map[string]bool{}
	var folders []folder
	seen := map[string]bool{}
	addFolder := func(f folder) {
		k := string(f.target) + "|" + relKey(f.rel)
		if seen[k] && !f.deep {
			return
		}
		seen[k] = true
		folders = append(folders, f)
	}
	for _, o := range def.ToolOutputs {
		addFolder(folder{target: o.Target, rel: o.Path.String(), deep: true})
	}
	for _, e := range m.Entries() {
		known[e.Location.Key()] = true
		if e.Kind == deployment.KindLink {
			addFolder(folder{target: e.Location.Target, rel: parentRel(e.Location.Path.String())})
		}
	}
	skip := map[string]bool{}
	if s.Decisions != nil {
		ds, err := s.Decisions.Unmanaged(ctx, inst.ID)
		if err != nil {
			return nil, err
		}
		for _, d := range ds {
			skip[d.Location.Key()] = true
		}
	}
	var out []externalchange.Change
	visited := map[string]bool{}
	budget := unexpectedLimit
	var walk func(f folder) error
	walk = func(f folder) error {
		vk := string(f.target) + "|" + relKey(f.rel)
		if visited[vk] && !f.deep {
			return nil
		}
		visited[vk] = true
		root := targetRoot(inst, f.target)
		if root == "" {
			return nil
		}
		dir := root
		if f.rel != "" {
			dir = game.JoinPath(root, f.rel)
		}
		entries, err := s.FS.ReadDir(ctx, dir)
		if err != nil {
			return nil // missing or unreadable folder: nothing to list
		}
		for _, de := range entries {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if budget--; budget <= 0 {
				return nil
			}
			rel := de.Name
			if f.rel != "" {
				rel = f.rel + "/" + de.Name
			}
			if de.IsDir {
				if f.deep {
					if err := walk(folder{target: f.target, rel: rel, deep: true}); err != nil {
						return err
					}
				}
				continue
			}
			if externalchange.IsOwnFile(de.Name) {
				continue
			}
			p, err := parseRel(rel)
			if err != nil {
				continue
			}
			loc := game.Location{Target: f.target, Path: p}
			k := loc.Key()
			if known[k] || wanted[k] || skip[k] {
				continue
			}
			fi, err := s.FS.Stat(ctx, game.JoinPath(dir, de.Name))
			if err != nil || !fi.Exists || fi.IsDir {
				continue
			}
			if !fi.ModTime.After(since) && !fi.Created.After(since) {
				continue // there before the deployment: someone else's
			}
			c, err := externalchange.Unexpected(loc, deployment.Observation{Exists: true, Evidence: deployment.Evidence{
				FileID: fi.FileID, Size: fi.Size, ModTime: fi.ModTime,
			}})
			if err != nil {
				continue
			}
			c.HintUnmanaged = def.HintsUnmanaged(loc)
			known[k] = true
			out = append(out, c)
		}
		return nil
	}
	for _, f := range folders {
		if err := walk(f); err != nil {
			return nil, err
		}
	}
	slices.SortFunc(out, func(a, b externalchange.Change) int { return compareKeys(a.Location.Key(), b.Location.Key()) })
	return out, nil
}

// enrich completes what classification cannot know alone: whether the
// archive of the mod is retained (revert of a hardlink edit) and whether a
// replaced location holds the original again (suggested revert).
func (s *Service) enrich(ctx context.Context, inst game.Instance, in *inputs, m *deployment.Manifest, changes []externalchange.Change) {
	for i := range changes {
		c := &changes[i]
		if c.Expected == nil {
			continue
		}
		if in != nil && s.Archives != nil {
			if md, ok := in.mods[c.Expected.Mod]; ok && md.Archive != "" {
				if a, err := s.Archives.Get(ctx, md.Archive); err == nil && a.Retained() {
					c.Retained = true
				}
			}
		}
		if c.Kind == externalchange.KindReplaced && m != nil {
			if b, ok := m.Backup(c.Location); ok {
				c.MatchesOriginal = s.sameContent(ctx, targetPath(inst, c.Location), backupFile(inst, b.BackupPath), c.Observed.Evidence.Size)
			}
		}
	}
}

// sameContent compares two files by size and hash.
func (s *Service) sameContent(ctx context.Context, a, b string, size int64) bool {
	if s.Hasher == nil {
		return false
	}
	ob := s.observe(ctx, b)
	if !ob.Exists || ob.IsDir || ob.Evidence.Size != size {
		return false
	}
	ha, err := s.hashFile(ctx, a)
	if err != nil {
		return false
	}
	hb, err := s.hashFile(ctx, b)
	return err == nil && ha == hb
}

func (s *Service) hashFile(ctx context.Context, path string) (string, error) {
	if s.Hasher == nil {
		return "", nil
	}
	rc, err := s.FS.Open(ctx, path)
	if err != nil {
		return "", err
	}
	defer rc.Close()
	return s.Hasher.Hash(ctx, rc)
}

// --- Scans outside a deploy ---

// focusBudget bounds the scan made when the window gets the focus
// (core/09 §3): the rest of the manifest is checked on the next focus.
const focusBudget = 250 * time.Millisecond

// found is what the latest scan of an instance saw.
type found struct {
	managed    map[string]externalchange.Change
	unexpected []externalchange.Change
	cursor     int
}

// classifyLinks checks the links of the manifest, from the cursor on, until
// the deadline (zero: all).
func (s *Service) classifyLinks(ctx context.Context, inst game.Instance, links []deployment.Entry, wanted map[string]bool, from int, deadline time.Time) (map[string]externalchange.Change, []string, int) {
	out := map[string]externalchange.Change{}
	var checked []string
	n := len(links)
	i := 0
	for ; i < n; i++ {
		if ctx.Err() != nil || (!deadline.IsZero() && i > 0 && time.Now().After(deadline)) {
			break
		}
		e := links[(from+i)%n]
		k := e.Location.Key()
		checked = append(checked, k)
		obs := s.observe(ctx, targetPath(inst, e.Location))
		c, changed := externalchange.Classify(e, obs)
		if !changed {
			continue
		}
		c.Wanted = wanted[k]
		if c.Kind == externalchange.KindMissing && !c.Wanted {
			continue // the next deploy drops it; nothing to decide
		}
		out[k] = c
	}
	return out, checked, (from + i) % max(n, 1)
}

// wantedKeys is the set of locations the desired state deploys.
func (s *Service) wantedKeys(ctx context.Context, inst game.Instance, in *inputs) (map[string]bool, error) {
	avail := s.availability(ctx, inst, inst.Staging, false)
	d, err := s.desired(ctx, in, avail)
	if err != nil {
		return nil, err
	}
	out := make(map[string]bool, len(d.Files))
	for _, f := range d.Files {
		out[f.Location.Key()] = true
	}
	return out, nil
}

// Verify scans every deployed file and the folders around them, on demand
// ("Verificar implantação") and when the user opens the review of external
// changes outside a deploy (DLG-15). It only reads.
func (s *Service) Verify(ctx context.Context, instance game.InstanceID) (ChangesView, error) {
	v, err := s.scanChanges(ctx, instance, time.Time{})
	if err == nil {
		s.markVerified(ctx, instance)
	}
	return v, err
}

// stateUnverified marks an instance whose manifest came from a restored
// database backup: the status is unknown until a full scan compares it
// with the disk (core/14 §4, core/04 §7 "banco restaurado sem scan").
const stateUnverified = "deployment.unverified."

// MarkUnverified is called at startup after a restore was applied.
func (s *Service) MarkUnverified(ctx context.Context) error {
	list, err := s.Instances.List(ctx)
	if err != nil {
		return err
	}
	for _, inst := range list {
		if err := s.State.Set(ctx, stateUnverified+string(inst.ID), "1"); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) verified(ctx context.Context, instance game.InstanceID) bool {
	_, err := s.State.Get(ctx, stateUnverified+string(instance))
	return err != nil
}

func (s *Service) markVerified(ctx context.Context, instance game.InstanceID) {
	if !s.verified(ctx, instance) {
		_ = s.State.Delete(ctx, stateUnverified+string(instance))
	}
}

// ScanOnFocus is the limited scan made when the app window gets the focus
// (core/09 §3, setting deploy.verifyOnFocus): manifest locations within a
// time budget, continued on the next focus; the folders around them once a
// full round of the manifest is done. Busy instances are left alone.
func (s *Service) ScanOnFocus(ctx context.Context, instance game.InstanceID) error {
	if v, err := s.Settings.AppValue(ctx, "deploy.verifyOnFocus"); err == nil && v.Value == "false" {
		return nil
	}
	if _, busy := s.Locks.Holder(instance); busy {
		return nil
	}
	_, err := s.scanChanges(ctx, instance, time.Now().Add(focusBudget))
	return err
}

func (s *Service) scanChanges(ctx context.Context, instance game.InstanceID, deadline time.Time) (ChangesView, error) {
	inst, err := s.instance(ctx, instance)
	if err != nil {
		return ChangesView{}, err
	}
	v := ChangesView{Instance: instance}
	m, err := s.current(ctx, instance)
	if err != nil {
		return v, err
	}
	if m == nil || m.Purged() {
		s.setFound(ctx, instance, &found{})
		return v, nil
	}
	in, err := s.loadInputs(ctx, instance)
	if err != nil {
		return v, err
	}
	wanted, err := s.wantedKeys(ctx, inst, in)
	if err != nil {
		return v, err
	}
	links := m.Links()
	s.mu.Lock()
	prev := s.found[instance]
	s.mu.Unlock()
	next := &found{managed: map[string]externalchange.Change{}}
	from := 0
	if !deadline.IsZero() && prev != nil {
		from = prev.cursor
		for k, c := range prev.managed {
			next.managed[k] = c
		}
		next.unexpected = prev.unexpected
	}
	got, checked, cursor := s.classifyLinks(ctx, inst, links, wanted, from, deadline)
	for _, k := range checked {
		delete(next.managed, k)
	}
	for k, c := range got {
		next.managed[k] = c
	}
	next.cursor = cursor
	full := len(checked) >= len(links)
	if deadline.IsZero() || full || cursor < from || cursor == 0 {
		if next.unexpected, err = s.findUnexpected(ctx, inst, in.def, m, wanted); err != nil {
			return v, err
		}
	}
	managed := sortedChanges(next.managed)
	s.enrich(ctx, inst, in, m, managed)
	for _, c := range managed {
		next.managed[c.Location.Key()] = c
	}
	s.setFound(ctx, instance, next)
	v.Changes = s.views(managed, next.unexpected, in)
	v.ChangeCount, v.NewFileCount = len(managed), len(next.unexpected)
	return v, nil
}

// setFound stores the latest scan and signals the UI when the counts
// changed (the UI rereads the status, D021).
func (s *Service) setFound(ctx context.Context, instance game.InstanceID, f *found) {
	s.mu.Lock()
	before, beforeNew := s.changes[instance], s.newFiles[instance]
	s.found[instance] = f
	s.changes[instance] = len(f.managed)
	s.newFiles[instance] = len(f.unexpected)
	s.mu.Unlock()
	if before == len(f.managed) && beforeNew == len(f.unexpected) {
		return
	}
	_ = s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		tx.Emit(s.newEvent(EventExternalChanges, instance, "", map[string]string{
			"count": strconv.Itoa(len(f.managed)), "newFiles": strconv.Itoa(len(f.unexpected)),
		}))
		return nil
	})
}

func sortedChanges(m map[string]externalchange.Change) []externalchange.Change {
	out := make([]externalchange.Change, 0, len(m))
	for _, c := range m {
		out = append(out, c)
	}
	slices.SortFunc(out, func(a, b externalchange.Change) int { return compareKeys(a.Location.Key(), b.Location.Key()) })
	return out
}

// ResolveChanges applies decisions taken in the review of external changes
// outside a deploy (DLG-15 "Aplicar decisões"). The deploy engine is the
// only writer to the game, so the decisions run as a deploy that applies
// them first; a decision still missing stops it at await_decision as
// usual (D080).
func (s *Service) ResolveChanges(ctx context.Context, instance game.InstanceID, decisions []DecisionInput) (operation.ID, error) {
	return s.startWith(ctx, instance, KindDeploy, startOptions{pre: decisions})
}

// --- Applying decisions ---

// effects is what a set of decisions asks for, by kind of side effect.
type effects struct {
	ignore     map[string]bool
	resolve    map[string]deployplan.Resolution
	adopt      map[string]bool
	unmanaged  []game.Location
	exclusions map[mod.ID][]game.Location
	saves      []externalchange.Change // observed file copied into the staging
	keeps      []externalchange.Change // hardlink edit already in the staging
	reinstall  map[mod.ID]bool
	captures   []capture
	retry      bool
	counts     map[externalchange.Action]int
}

type capture struct {
	into     mod.ID
	name     string
	category string
	target   game.TargetID
	changes  []externalchange.Change
}

func (x *effects) add(c externalchange.Change, d DecisionInput) {
	k := c.Location.Key()
	x.counts[d.Action]++
	switch d.Action {
	case externalchange.ActionIgnoreNow:
		x.ignore[k] = true
	case externalchange.ActionRetry:
		x.retry = true
	case externalchange.ActionRestore:
		x.resolve[k] = deployplan.Resolution{Kind: deployplan.ResolveForget}
	case externalchange.ActionAcceptRemoval:
		x.resolve[k] = deployplan.Resolution{Kind: deployplan.ResolveForget}
		x.exclusions[c.Expected.Mod] = append(x.exclusions[c.Expected.Mod], c.Location)
	case externalchange.ActionKeepChange:
		x.adopt[k] = true
		x.keeps = append(x.keeps, c)
	case externalchange.ActionRevert:
		switch {
		case c.Kind == externalchange.KindReplaced:
			x.resolve[k] = deployplan.Resolution{Kind: deployplan.ResolveSetAside}
		case c.Method() == game.MethodHardlink:
			// The staging is the edited file: the archive gives the
			// original back by reinstalling; meanwhile the edit is the
			// mod's content.
			x.adopt[k] = true
			x.reinstall[c.Expected.Mod] = true
		default:
			x.adopt[k] = true
			x.resolve[k] = deployplan.Resolution{Kind: deployplan.ResolveAdopt, Relink: true}
		}
	case externalchange.ActionSaveToMod:
		x.adopt[k] = true
		x.saves = append(x.saves, c)
		if c.Kind == externalchange.KindReplaced {
			x.resolve[k] = deployplan.Resolution{Kind: deployplan.ResolveAdopt, Relink: true}
		}
	case externalchange.ActionLeaveUnmanaged:
		x.unmanaged = append(x.unmanaged, c.Location)
	case externalchange.ActionCapture:
		name := d.CaptureName
		if d.CaptureInto != "" {
			name = ""
		}
		for i := range x.captures {
			g := &x.captures[i]
			if g.into == d.CaptureInto && g.name == name && g.target == c.Location.Target {
				g.changes = append(g.changes, c)
				return
			}
		}
		x.captures = append(x.captures, capture{into: d.CaptureInto, name: name, category: d.CaptureCategory, target: c.Location.Target, changes: []externalchange.Change{c}})
	}
}

// applyDecisions runs the decisions of DLG-15 inside a deploy or purge
// (core/09 §4): persisted decisions and library changes first, then the
// locations are planned again with the resolutions. With final, everything
// that still needs a decision is left untouched in this run (blocked
// locations, refused fallbacks, undecided changes).
func (s *Service) applyDecisions(ctx context.Context, r *run, decisions []DecisionInput, final bool, source string) error {
	byKey := map[string]externalchange.Change{}
	for _, c := range r.plan.Changes {
		byKey[c.Location.Key()] = c
	}
	for _, c := range r.unexpected {
		byKey[c.Location.Key()] = c
	}
	x := &effects{ignore: map[string]bool{}, resolve: map[string]deployplan.Resolution{}, adopt: map[string]bool{},
		exclusions: map[mod.ID][]game.Location{}, reinstall: map[mod.ID]bool{}, counts: map[externalchange.Action]int{}}
	for _, d := range decisions {
		c, ok := byKey[d.Location.Key()]
		if !ok {
			continue // no longer diverges
		}
		if err := (externalchange.Decision{Change: c, Action: d.Action, CaptureInto: d.CaptureInto}).Validate(); err != nil {
			return fail(CodeDecisionInvalid, err, "path", c.Location.String(), "action", string(d.Action))
		}
		if d.Action == externalchange.ActionCapture && d.CaptureInto == "" && d.CaptureName == "" {
			return fail(CodeDecisionInvalid, nil, "path", c.Location.String(), "action", string(d.Action))
		}
		x.add(c, d)
		delete(byKey, d.Location.Key())
	}
	reload, err := s.applyEffects(ctx, r, x)
	if err != nil {
		return err
	}
	if len(x.counts) > 0 {
		payload := map[string]string{"source": source}
		for a, n := range x.counts {
			payload[string(a)] = strconv.Itoa(n)
		}
		evType := EventExternalDecided
		if source == "auto" {
			evType = EventExternalAutoRestored
		}
		if err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
			tx.Emit(s.newEvent(evType, r.inst.ID, r.t.ID(), payload))
			return nil
		}); err != nil {
			return err
		}
	}
	if r.skip == nil {
		r.skip = map[string]bool{}
	}
	if r.resolve == nil {
		r.resolve = map[string]deployplan.Resolution{}
	}
	for k := range x.ignore {
		r.skip[k] = true
	}
	for k, res := range x.resolve {
		r.resolve[k] = res
	}
	ignoredManaged := 0
	for _, c := range r.plan.Changes {
		if x.ignore[c.Location.Key()] {
			ignoredManaged++
		}
	}
	if final {
		for _, b := range r.plan.Blocked {
			r.skip[b.Location.Key()] = true
		}
		for _, f := range r.plan.Fallbacks {
			if !r.accepted[f.Key()] {
				for _, l := range f.Locations {
					r.skip[l.Key()] = true
				}
			}
		}
	}
	if reload || x.retry {
		if err := s.reload(ctx, r); err != nil {
			return err
		}
	}
	r.plan = deployplan.Build(s.planInput(ctx, r))
	if final && len(r.plan.Changes) > 0 {
		for _, c := range r.plan.Changes {
			r.skip[c.Location.Key()] = true
		}
		ignoredManaged += len(r.plan.Changes)
		r.plan = deployplan.Build(s.planInput(ctx, r))
	}
	r.untouched += ignoredManaged
	s.enrich(ctx, r.inst, r.in, r.applied, r.plan.Changes)
	return nil
}

// reload reads the inputs again after decisions changed them (new
// installations, exclusions, captured mods) and observes again.
func (s *Service) reload(ctx context.Context, r *run) error {
	in, err := s.loadInputs(ctx, r.inst.ID)
	if err != nil {
		return err
	}
	r.in = in
	return s.scanStep(ctx, r)
}

// applyEffects performs the side effects of decisions that are not writes
// to the game: persisted decisions, staging copies and library records,
// exclusions, captures (their moves out of the game are recorded first,
// see capture). It returns whether the inputs changed.
func (s *Service) applyEffects(ctx context.Context, r *run, x *effects) (bool, error) {
	inst := r.inst.ID
	if len(x.unmanaged) > 0 {
		now := s.Clock.Now()
		var ds []externalchange.Unmanaged
		for _, l := range x.unmanaged {
			d, err := externalchange.NewUnmanaged(inst, l, now)
			if err != nil {
				return false, err
			}
			ds = append(ds, d)
		}
		if err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
			return tx.ExternalDecisions().SaveUnmanaged(ctx, ds...)
		}); err != nil {
			return false, err
		}
	}
	reload := false
	// Files whose content becomes the mod's: kept hardlink edits (the
	// staging already is the file) and files saved into the staging.
	updates := map[mod.ID][]mod.File{}
	hashes := map[string]string{}
	for _, c := range x.keeps {
		h, _ := s.hashFile(ctx, targetPath(r.inst, c.Location))
		hashes[c.Location.Key()] = h
		updates[c.Expected.Mod] = append(updates[c.Expected.Mod], mod.File{Source: c.Expected.Source, Dest: c.Location, Size: c.Observed.Evidence.Size, Hash: h})
	}
	for _, c := range x.saves {
		src := targetPath(r.inst, c.Location)
		dst := sourcePath(r.inst, *c.Expected)
		if err := s.replaceStaged(ctx, src, dst); err != nil {
			r.failures = append(r.failures, Failure{Location: c.Location, Code: fileErrorCode(err), Detail: err.Error()})
			delete(x.adopt, c.Location.Key())
			delete(x.resolve, c.Location.Key())
			x.ignore[c.Location.Key()] = true
			continue
		}
		h, _ := s.hashFile(ctx, dst)
		hashes[c.Location.Key()] = h
		updates[c.Expected.Mod] = append(updates[c.Expected.Mod], mod.File{Source: c.Expected.Source, Dest: c.Location, Size: c.Observed.Evidence.Size, Hash: h})
	}
	remap := map[mod.InstallationID]mod.InstallationID{}
	for _, id := range sortedModIDs(updates) {
		old := r.in.mods[id]
		newID, err := s.Library.UpdateInstalledFiles(ctx, inst, id, updates[id])
		if err != nil {
			return false, err
		}
		if old != nil {
			remap[old.Installation] = newID
		}
		s.forgetInstallation(old)
		reload = true
	}
	if len(x.adopt) > 0 || len(remap) > 0 {
		if err := s.adopt(r, x.adopt, hashes, remap); err != nil {
			return false, err
		}
	}
	for _, id := range sortedModIDs(x.exclusions) {
		if err := s.Exclusions.SetFileExclusions(ctx, inst, id, x.exclusions[id], true); err != nil {
			return false, err
		}
		reload = true
	}
	for _, g := range x.captures {
		if err := s.capture(ctx, r, g); err != nil {
			return false, err
		}
		reload = true
	}
	if len(x.reinstall) > 0 {
		ids := make([]mod.ID, 0, len(x.reinstall))
		for id := range x.reinstall {
			ids = append(ids, id)
		}
		slices.Sort(ids)
		r.later = append(r.later, func(ctx context.Context) { _, _ = s.Library.ReinstallMods(ctx, inst, ids) })
	}
	return reload, nil
}

func (s *Service) forgetInstallation(m *mod.Mod) {
	if m == nil {
		return
	}
	s.mu.Lock()
	delete(s.installations, m.Installation)
	s.mu.Unlock()
}

// adopt rewrites the applied state in memory: decided locations take the
// observed evidence (the file there is the manager's as it is now), and
// links of mods with a new installation point to it (same staging files).
// The commit of the run persists it (INV-DEP-05: what was observed).
func (s *Service) adopt(r *run, keys map[string]bool, hashes map[string]string, remap map[mod.InstallationID]mod.InstallationID) error {
	if r.applied == nil {
		return nil
	}
	entries := r.applied.Entries()
	for i, e := range entries {
		if e.Kind != deployment.KindLink {
			continue
		}
		if n, ok := remap[e.Installation]; ok {
			entries[i].Installation = n
		}
		k := e.Location.Key()
		if !keys[k] {
			continue
		}
		obs, ok := r.scanned.files[k]
		if !ok || !obs.Exists || obs.IsDir {
			continue
		}
		ev := obs.Evidence
		ev.Hash = hashes[k]
		entries[i].Evidence = ev
	}
	m, err := deployment.NewManifest(r.applied.Instance, profileOr(r.applied.Profile, r.desired.Profile), fingerprintOr(r.applied.Fingerprint), r.applied.Operation, r.applied.AppliedAt, entries)
	if err != nil {
		return err
	}
	r.applied = m
	r.dirty = true
	return nil
}

func profileOr(p, def deployment.ProfileID) deployment.ProfileID {
	if p != "" {
		return p
	}
	if def != "" {
		return def
	}
	return "unknown"
}

func fingerprintOr(fp deployment.Fingerprint) deployment.Fingerprint {
	if fp == "" {
		return deployment.Partial("purge")
	}
	return fp
}

// replaceStaged copies the observed file over the staged one through a
// temporary name, so the staging never holds half a file.
func (s *Service) replaceStaged(ctx context.Context, src, dst string) error {
	tmp := tempPath(dst)
	_ = s.FS.Remove(ctx, tmp)
	if err := s.FS.Copy(ctx, src, tmp); err != nil {
		return err
	}
	if err := s.FS.Rename(ctx, tmp, dst); err != nil {
		_ = s.FS.Remove(ctx, tmp)
		return err
	}
	return nil
}

// autoRestore are the decisions taken without asking when the setting
// deploy.autoRestoreMissing is on: recreate missing files of enabled mods in
// a deploy the user started (core/09 §4, the only exception of INV-EXT-02).
func (s *Service) autoRestore(ctx context.Context, r *run) []DecisionInput {
	if r.auto || r.inline || r.kind == KindPurge || !s.boolSetting(ctx, r.inst.ID, "deploy.autoRestoreMissing", false) {
		return nil
	}
	var out []DecisionInput
	for _, c := range r.plan.Changes {
		if c.Kind == externalchange.KindMissing && c.Wanted {
			out = append(out, DecisionInput{Location: c.Location, Action: externalchange.ActionRestore})
		}
	}
	return out
}

// --- Capture (core/09 §5, D046) ---

// stateCaptures records captures in flight (app_state), the capture's
// journal: written before the first file leaves the game, removed once the
// library recorded the files. Recovery finishes them (the user decided).
const stateCaptures = "deployment.captures"

type captureRecord struct {
	Mod      string        `json:"mod"`
	Name     string        `json:"name,omitempty"`
	Type     string        `json:"type"`
	Category string        `json:"category,omitempty"`
	Files    []captureFile `json:"files"`
}

type captureFile struct {
	Target string `json:"target"`
	Path   string `json:"path"`
}

func (s *Service) captures(ctx context.Context) (map[string][]captureRecord, error) {
	raw, err := s.State.Get(ctx, stateCaptures)
	if errors.Is(err, ports.ErrNotFound) {
		return map[string][]captureRecord{}, nil
	}
	if err != nil {
		return nil, err
	}
	out := map[string][]captureRecord{}
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return map[string][]captureRecord{}, nil
	}
	return out, nil
}

func (s *Service) saveCaptures(ctx context.Context, all map[string][]captureRecord) error {
	for k, v := range all {
		if len(v) == 0 {
			delete(all, k)
		}
	}
	if len(all) == 0 {
		if err := s.State.Delete(ctx, stateCaptures); err != nil && !errors.Is(err, ports.ErrNotFound) {
			return err
		}
		return nil
	}
	body, _ := json.Marshal(all)
	return s.State.Set(ctx, stateCaptures, string(body))
}

// modTypeFor picks the mod type that deploys to target: the default type
// when it does, otherwise the one with the lowest detection priority.
func modTypeFor(def game.Definition, target game.TargetID) (game.ModType, bool) {
	if t, ok := def.ModType(game.DefaultModType); ok && t.Target == target {
		return t, true
	}
	var best game.ModType
	found := false
	for _, t := range def.ModTypes {
		if t.Target == target && (!found || t.Priority < best.Priority) {
			best, found = t, true
		}
	}
	return best, found
}

// capture moves generated files of one group into the staging of a mod and
// has the library record them. The record is written before any move; the
// moves keep the file (rename, or verified copy then removal of the
// original only after the copy is confirmed).
func (s *Service) capture(ctx context.Context, r *run, g capture) error {
	rec := captureRecord{Mod: string(g.into), Name: g.name, Category: g.category}
	if g.into != "" {
		m, ok := r.in.mods[g.into]
		if !ok {
			return fail(CodeDecisionInvalid, nil, "mod", string(g.into), "action", string(externalchange.ActionCapture))
		}
		mt, ok := r.in.def.ModType(m.Type)
		if !ok || mt.Target != g.target {
			return fail(CodeCaptureTarget, nil, "mod", m.DisplayName(), "target", string(g.target))
		}
		rec.Type = string(m.Type)
	} else {
		mt, ok := modTypeFor(r.in.def, g.target)
		if !ok {
			return fail(CodeCaptureTarget, nil, "mod", g.name, "target", string(g.target))
		}
		rec.Mod = s.IDs.NewID()
		rec.Type = string(mt.ID)
	}
	for _, c := range g.changes {
		rec.Files = append(rec.Files, captureFile{Target: string(c.Location.Target), Path: c.Location.Path.String()})
	}
	all, err := s.captures(ctx)
	if err != nil {
		return err
	}
	all[string(r.inst.ID)] = append(all[string(r.inst.ID)], rec)
	if err := s.saveCaptures(ctx, all); err != nil {
		return err
	}
	expected := map[string]deployment.Evidence{}
	for _, c := range g.changes {
		expected[c.Location.Key()] = c.Observed.Evidence
	}
	files, failures := s.moveCaptured(ctx, r.inst, rec, expected)
	r.failures = append(r.failures, failures...)
	if len(files) > 0 {
		if _, err := s.Library.RegisterCapture(ctx, r.inst.ID, mod.ID(rec.Mod), rec.Name, game.ModTypeID(rec.Type), rec.Category, files); err != nil {
			return err
		}
	}
	return s.dropCapture(ctx, r.inst.ID, rec.Mod)
}

func (s *Service) dropCapture(ctx context.Context, instance game.InstanceID, modID string) error {
	all, err := s.captures(ctx)
	if err != nil {
		return err
	}
	all[string(instance)] = slices.DeleteFunc(all[string(instance)], func(c captureRecord) bool { return c.Mod == modID })
	return s.saveCaptures(ctx, all)
}

// moveCaptured moves the recorded files that are still in the game into the
// staging folder of the mod and returns the files the staging holds. With
// expected evidence (a live capture) a file that changed since the scan is
// left where it is (raced).
func (s *Service) moveCaptured(ctx context.Context, inst game.Instance, rec captureRecord, expected map[string]deployment.Evidence) ([]mod.File, []Failure) {
	var files []mod.File
	var failures []Failure
	folder := game.JoinPath(inst.Staging, rec.Mod)
	for _, f := range rec.Files {
		p, err := parseRel(f.Path)
		if err != nil {
			continue
		}
		loc := game.Location{Target: game.TargetID(f.Target), Path: p}
		src := targetPath(inst, loc)
		dst := game.JoinPath(folder, p.String())
		obs := s.observe(ctx, src)
		if obs.Exists && !obs.IsDir {
			if ev, ok := expected[loc.Key()]; ok && !ev.SameOriginal(obs.Evidence) {
				failures = append(failures, Failure{Location: loc, Code: CodeRaced})
				continue
			}
			if err := s.moveFile(ctx, src, dst, obs.Evidence.Size); err != nil {
				failures = append(failures, Failure{Location: loc, Code: fileErrorCode(err), Detail: err.Error()})
				continue
			}
		}
		staged := s.observe(ctx, dst)
		if !staged.Exists || staged.IsDir {
			continue
		}
		h, _ := s.hashFile(ctx, dst)
		files = append(files, mod.File{Source: p, Dest: loc, Size: staged.Evidence.Size, Hash: h})
	}
	return files, failures
}

// moveFile moves src to dst: a rename inside the volume, otherwise a copy
// confirmed by size before the original is removed.
func (s *Service) moveFile(ctx context.Context, src, dst string, size int64) error {
	if err := s.FS.MkdirAll(ctx, parentPath(dst)); err != nil {
		return err
	}
	if err := s.FS.Rename(ctx, src, dst); err == nil {
		return nil
	}
	tmp := tempPath(dst)
	_ = s.FS.Remove(ctx, tmp)
	if err := s.FS.Copy(ctx, src, tmp); err != nil {
		return err
	}
	if got := s.observe(ctx, tmp); !got.Exists || got.Evidence.Size != size {
		_ = s.FS.Remove(ctx, tmp)
		return fail(CodeVerifyFailed, nil, "path", dst)
	}
	if err := s.FS.Rename(ctx, tmp, dst); err != nil {
		_ = s.FS.Remove(ctx, tmp)
		return err
	}
	return s.FS.Remove(ctx, src)
}

// recoverCaptures finishes captures interrupted by a previous process: the
// files still in the game are moved, and the library records what the
// staging holds.
func (s *Service) recoverCaptures(ctx context.Context) error {
	all, err := s.captures(ctx)
	if err != nil {
		return err
	}
	ids := make([]string, 0, len(all))
	for id := range all {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	for _, id := range ids {
		inst, err := s.Instances.Get(ctx, game.InstanceID(id))
		if err != nil {
			delete(all, id)
			continue
		}
		for _, rec := range all[id] {
			files, _ := s.moveCaptured(ctx, inst, rec, nil)
			if len(files) > 0 && s.Library != nil {
				if _, err := s.Library.RegisterCapture(ctx, inst.ID, mod.ID(rec.Mod), rec.Name, game.ModTypeID(rec.Type), rec.Category, files); err != nil {
					return err
				}
			}
		}
		delete(all, id)
	}
	return s.saveCaptures(ctx, all)
}

// --- helpers ---

func relKey(rel string) string { return strings.ToLower(rel) }

// parentRel is the folder of a relative path ("" for the target root).
func parentRel(rel string) string {
	if i := strings.LastIndex(rel, "/"); i >= 0 {
		return rel[:i]
	}
	return ""
}

func parseRel(rel string) (relpath.Path, error) { return relpath.Parse(rel) }

// targetRoot is the folder of a target ("" for unknown targets).
func targetRoot(inst game.Instance, t game.TargetID) string {
	for _, tg := range inst.Targets {
		if tg.ID == t {
			return tg.Path
		}
	}
	return ""
}

func compareKeys(a, b string) int { return strings.Compare(a, b) }

func sortedModIDs[V any](m map[mod.ID]V) []mod.ID {
	out := make([]mod.ID, 0, len(m))
	for id := range m {
		out = append(out, id)
	}
	slices.Sort(out)
	return out
}

// LocationFolder is the folder holding a location of a target ("Abrir
// pasta" of DLG-15). It only resolves the path.
func (s *Service) LocationFolder(ctx context.Context, instance game.InstanceID, loc game.Location) (string, error) {
	inst, err := s.instance(ctx, instance)
	if err != nil {
		return "", err
	}
	p := targetPath(inst, loc)
	if p == "" {
		return "", fail(CodeTargetUnavail, nil, "target", string(loc.Target))
	}
	return parentPath(p), nil
}
