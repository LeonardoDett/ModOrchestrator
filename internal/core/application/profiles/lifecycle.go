package profiles

import (
	"context"
	"errors"
	"slices"
	"strconv"
	"strings"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/profile"
)

// Summary is one card of the Profiles screen (ui/telas/profiles.md §2).
// Deploy status and plugin counts arrive with F7 and F11.
type Summary struct {
	ID              profile.ID
	Name            string
	Notes           string
	Active          bool
	Enabled         int
	Mods            int
	Snapshots       int
	CreatedAt       time.Time
	UpdatedAt       time.Time
	LastActivatedAt time.Time
}

// List returns the profiles of an instance, by name.
func (s *Service) List(ctx context.Context, instance game.InstanceID) ([]Summary, error) {
	list, err := s.Profiles.ListByInstance(ctx, instance)
	if err != nil {
		return nil, err
	}
	active, _ := s.Profiles.Active(ctx, instance)
	out := make([]Summary, 0, len(list))
	for _, p := range list {
		snaps, err := s.Profiles.Snapshots(ctx, p.ID())
		if err != nil {
			return nil, err
		}
		d := p.Data()
		out = append(out, Summary{
			ID: p.ID(), Name: p.Name(), Notes: p.Notes(), Active: p.ID() == active,
			Enabled: len(p.EnabledMods()), Mods: len(p.Mods()), Snapshots: len(snaps),
			CreatedAt: d.CreatedAt, UpdatedAt: d.UpdatedAt, LastActivatedAt: d.LastActivatedAt,
		})
	}
	return out, nil
}

// checkName refuses an empty name or one another profile of the instance
// uses (case-insensitive).
func checkName(ctx context.Context, tx ports.Tx, instance game.InstanceID, self profile.ID, name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", fail(CodeNameEmpty, nil)
	}
	list, err := tx.Profiles().ListByInstance(ctx, instance)
	if err != nil {
		return "", err
	}
	for _, p := range list {
		if p.ID() != self && strings.EqualFold(p.Name(), name) {
			return "", fail(CodeProfileNameTaken, nil, "name", name)
		}
	}
	return name, nil
}

// Create adds a profile (core/07 §2). With from empty the profile starts
// with every mod disabled and the active profile's order (positions are
// preserved); with from set it is a clone of that profile (§3).
func (s *Service) Create(ctx context.Context, instance game.InstanceID, name string, from profile.ID) (profile.ID, error) {
	id := profile.ID(s.IDs.NewID())
	now := s.Clock.Now()
	err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		name, err := checkName(ctx, tx, instance, "", name)
		if err != nil {
			return err
		}
		var p *profile.Profile
		if from != "" {
			src, err := getProfile(ctx, tx.Profiles(), from)
			if err != nil {
				return err
			}
			if src.Instance() != instance {
				return fail(CodeProfileNotFound, nil, "profile", string(from))
			}
			if p, err = src.Clone(id, name, now); err != nil {
				return err
			}
			tx.Emit(s.newEvent(EventProfileCloned, subjectProfile, string(id), map[string]string{"name": name, "from": string(from), "fromName": src.Name()}))
		} else {
			base, err := activeProfile(ctx, tx, instance)
			if err != nil {
				return err
			}
			if p, err = profile.NewFromOrder(id, name, base, now); err != nil {
				return err
			}
			tx.Emit(s.newEvent(EventProfileCreated, subjectProfile, string(id), map[string]string{"name": name}))
		}
		return tx.Profiles().Save(ctx, p)
	})
	if err != nil {
		return "", err
	}
	return id, nil
}

// Rename changes the name of a profile.
func (s *Service) Rename(ctx context.Context, id profile.ID, name string) error {
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		p, err := getProfile(ctx, tx.Profiles(), id)
		if err != nil {
			return err
		}
		name, err := checkName(ctx, tx, p.Instance(), id, name)
		if err != nil {
			return err
		}
		old := p.Name()
		if err := p.Rename(name, s.Clock.Now()); err != nil {
			return err
		}
		tx.Emit(s.newEvent(EventProfileRenamed, subjectProfile, string(id), map[string]string{"from": old, "to": name}))
		return tx.Profiles().Save(ctx, p)
	})
}

// SetNotes replaces the notes of a profile.
func (s *Service) SetNotes(ctx context.Context, id profile.ID, notes string) error {
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		p, err := getProfile(ctx, tx.Profiles(), id)
		if err != nil {
			return err
		}
		p.SetNotes(notes, s.Clock.Now())
		tx.Emit(s.newEvent(EventProfileNotes, subjectProfile, string(id), nil))
		return tx.Profiles().Save(ctx, p)
	})
}

// Delete removes a profile and its snapshots. The active profile and the
// last one cannot be deleted (INV-ORD-01, D037).
func (s *Service) Delete(ctx context.Context, id profile.ID) error {
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		p, err := getProfile(ctx, tx.Profiles(), id)
		if err != nil {
			return err
		}
		active, err := tx.Profiles().Active(ctx, p.Instance())
		if err != nil {
			return err
		}
		if active == id {
			return fail(CodeProfileIsActive, nil, "name", p.Name())
		}
		list, err := tx.Profiles().ListByInstance(ctx, p.Instance())
		if err != nil {
			return err
		}
		if len(list) <= 1 {
			return fail(CodeProfileLast, nil, "name", p.Name())
		}
		tx.Emit(s.newEvent(EventProfileDeleted, subjectProfile, string(id), map[string]string{"name": p.Name(), "instance": string(p.Instance())}))
		return tx.Profiles().Delete(ctx, id) // snapshots cascade
	})
}

// Activate makes a profile the active one of its instance. It only changes
// the desired state: the deploy (by diff, never purge + deploy, D033) is
// pending until F7 runs it. Refused while another mutating operation holds
// the instance (core/07 §2).
func (s *Service) Activate(ctx context.Context, id profile.ID) error {
	p, err := getProfile(ctx, s.Profiles, id)
	if err != nil {
		return err
	}
	release, err := s.lock(p.Instance(), holderActivate)
	if err != nil {
		return err
	}
	defer release()
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		p, err := getProfile(ctx, tx.Profiles(), id)
		if err != nil {
			return err
		}
		previous, _ := tx.Profiles().Active(ctx, p.Instance())
		if previous == id {
			return nil
		}
		if err := tx.Profiles().SetActive(ctx, p.Instance(), id); err != nil {
			return err
		}
		p.MarkActivated(s.Clock.Now())
		tx.Emit(s.newEvent(EventProfileActivated, subjectProfile, string(id), map[string]string{
			"name": p.Name(), "previous": string(previous), "instance": string(p.Instance()),
		}))
		return tx.Profiles().Save(ctx, p)
	})
}

// NamedMod is a mod with its display name, for comparison and previews.
type NamedMod struct {
	ID   mod.ID
	Name string
}

// PriorityDiff is a mod enabled in both profiles at different priorities.
type PriorityDiff struct {
	NamedMod
	A, B int
}

// PluginDiff is a plugin whose position differs.
type PluginDiff struct {
	Plugin string
	A, B   int
}

// Comparison is the result of ProfileCompare (core/07 §5).
type Comparison struct {
	A, B             Summary
	OnlyA, OnlyB     []NamedMod
	PriorityChanged  []PriorityDiff
	PluginsOnlyA     []string
	PluginsOnlyB     []string
	LoadOrderChanged []PluginDiff
}

// Compare returns what differs between two profiles of one instance.
func (s *Service) Compare(ctx context.Context, a, b profile.ID) (Comparison, error) {
	pa, err := getProfile(ctx, s.Profiles, a)
	if err != nil {
		return Comparison{}, err
	}
	pb, err := getProfile(ctx, s.Profiles, b)
	if err != nil {
		return Comparison{}, err
	}
	if pa.Instance() != pb.Instance() {
		return Comparison{}, fail(CodeProfileNotFound, nil, "profile", string(b))
	}
	names, err := modNames(ctx, s.Mods, pa.Instance())
	if err != nil {
		return Comparison{}, err
	}
	summaries, err := s.List(ctx, pa.Instance())
	if err != nil {
		return Comparison{}, err
	}
	out := Comparison{}
	for _, sm := range summaries {
		switch sm.ID {
		case a:
			out.A = sm
		case b:
			out.B = sm
		}
	}
	named := func(ids []mod.ID) []NamedMod {
		res := make([]NamedMod, len(ids))
		for i, id := range ids {
			res[i] = NamedMod{ID: id, Name: names[id]}
		}
		return res
	}
	c := profile.Compare(pa, pb)
	out.OnlyA, out.OnlyB = named(c.OnlyA), named(c.OnlyB)
	for _, d := range c.PriorityChanged {
		out.PriorityChanged = append(out.PriorityChanged, PriorityDiff{NamedMod: NamedMod{ID: d.Mod, Name: names[d.Mod]}, A: d.A, B: d.B})
	}
	for _, n := range c.PluginsOnlyA {
		out.PluginsOnlyA = append(out.PluginsOnlyA, string(n))
	}
	for _, n := range c.PluginsOnlyB {
		out.PluginsOnlyB = append(out.PluginsOnlyB, string(n))
	}
	for _, d := range c.LoadOrderChanged {
		out.LoadOrderChanged = append(out.LoadOrderChanged, PluginDiff{Plugin: string(d.Plugin), A: d.A, B: d.B})
	}
	return out, nil
}

// TransferOptions says what is transferred besides the enabled mods.
type TransferOptions = profile.TransferOptions

// Transfer copies the selection of from into to (core/07 §2, Vortex
// TransferDialog), after a snapshot of to. The order rules are applied to
// the result so INV-ORD-03 holds.
func (s *Service) Transfer(ctx context.Context, from, to profile.ID, opts TransferOptions) error {
	if from == to {
		return nil
	}
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		src, err := getProfile(ctx, tx.Profiles(), from)
		if err != nil {
			return err
		}
		dst, err := getProfile(ctx, tx.Profiles(), to)
		if err != nil {
			return err
		}
		before := dst.Data()
		if _, err := s.snapshot(ctx, tx, before, profile.SnapshotTransfer); err != nil {
			return err
		}
		now := s.Clock.Now()
		if err := dst.TransferFrom(src, opts, now); err != nil {
			return err
		}
		if err := s.applyRules(ctx, tx, dst); err != nil {
			return err
		}
		tx.Emit(s.newEvent(EventProfileTransferred, subjectProfile, string(to), map[string]string{
			"from": string(from), "fromName": src.Name(), "order": strconv.FormatBool(opts.Order), "plugins": strconv.FormatBool(opts.Plugins),
		}))
		if err := s.recordOrder(ctx, tx, dst, before, ReasonTransfer, nil); err != nil {
			return err
		}
		return tx.Profiles().Save(ctx, dst)
	})
}

// applyRules runs the ordering engine over p with the enabled order rules
// of its instance (D025/D029).
func (s *Service) applyRules(ctx context.Context, tx ports.Tx, p *profile.Profile) error {
	set, err := ruleSet(ctx, tx.Rules(), p.Instance())
	if err != nil {
		return err
	}
	_, err = p.Reorder(set.OrderEdges(), s.Clock.Now())
	return err
}

// SnapshotSummary is one row of the restore points table.
type SnapshotSummary struct {
	ID        profile.SnapshotID
	Reason    profile.SnapshotReason
	CreatedAt time.Time
	Enabled   int
	Mods      int
}

// Snapshots lists the restore points of a profile, newest first.
func (s *Service) Snapshots(ctx context.Context, id profile.ID) ([]SnapshotSummary, error) {
	list, err := s.Profiles.Snapshots(ctx, id)
	if err != nil {
		return nil, err
	}
	out := make([]SnapshotSummary, len(list))
	for i, sn := range list {
		enabled := 0
		for _, st := range sn.State.Mods {
			if st.Enabled {
				enabled++
			}
		}
		out[i] = SnapshotSummary{ID: sn.ID, Reason: sn.Reason, CreatedAt: sn.CreatedAt, Enabled: enabled, Mods: len(sn.State.Mods)}
	}
	return out, nil
}

// CreateSnapshot takes a manual restore point.
func (s *Service) CreateSnapshot(ctx context.Context, id profile.ID) (profile.SnapshotID, error) {
	var sid profile.SnapshotID
	err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		p, err := getProfile(ctx, tx.Profiles(), id)
		if err != nil {
			return err
		}
		sid, err = s.snapshot(ctx, tx, p.Data(), profile.SnapshotManual)
		return err
	})
	return sid, err
}

// RestoreResult says what a restore could not bring back.
type RestoreResult struct {
	// Ignored are mods of the snapshot that no longer exist (core/07 §6).
	Ignored []NamedMod
}

// RestoreSnapshot brings back selection and orders of a profile, after an
// automatic snapshot of the current state. Rules created since the
// snapshot are applied to the restored order (INV-ORD-03).
func (s *Service) RestoreSnapshot(ctx context.Context, id profile.ID, snap profile.SnapshotID) (RestoreResult, error) {
	var res RestoreResult
	err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		p, err := getProfile(ctx, tx.Profiles(), id)
		if err != nil {
			return err
		}
		list, err := tx.Profiles().Snapshots(ctx, id)
		if err != nil {
			return err
		}
		i := slices.IndexFunc(list, func(x profile.Snapshot) bool { return x.ID == snap })
		if i < 0 {
			return fail(CodeSnapshotNotFound, nil, "snapshot", string(snap))
		}
		before := p.Data()
		if _, err := s.snapshot(ctx, tx, before, profile.SnapshotBeforeRevert); err != nil {
			return err
		}
		ignored, err := p.RestoreSnapshot(list[i], s.Clock.Now())
		if err != nil {
			return err
		}
		names, err := modNames(ctx, tx.Mods(), p.Instance())
		if err != nil {
			return err
		}
		for _, m := range ignored {
			name := names[m]
			if name == "" {
				name = string(m)
			}
			res.Ignored = append(res.Ignored, NamedMod{ID: m, Name: name})
		}
		if err := s.applyRules(ctx, tx, p); err != nil {
			return err
		}
		tx.Emit(s.newEvent(EventSnapshotRestored, subjectProfile, string(id), map[string]string{
			"snapshot": string(snap), "ignored": strconv.Itoa(len(ignored)),
		}))
		if err := s.recordOrder(ctx, tx, p, before, ReasonRestore, nil); err != nil {
			return err
		}
		return tx.Profiles().Save(ctx, p)
	})
	return res, err
}

// SetModsEnabled enables or disables installed mods in the active profile
// (D066). Above snapshots.bulkThreshold mods a snapshot is taken first
// (core/07 §6).
func (s *Service) SetModsEnabled(ctx context.Context, instance game.InstanceID, ids []mod.ID, enabled bool) error {
	if len(ids) == 0 {
		return nil
	}
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		p, err := activeProfile(ctx, tx, instance)
		if err != nil {
			return err
		}
		if len(ids) > limitsOf(ctx).bulk {
			if _, err := s.snapshot(ctx, tx, p.Data(), profile.SnapshotBulkEnable); err != nil {
				return err
			}
		}
		return s.setEnabled(ctx, tx, p, ids, enabled)
	})
}

// setEnabled changes the state of installed mods of p and saves it.
func (s *Service) setEnabled(ctx context.Context, tx ports.Tx, p *profile.Profile, ids []mod.ID, enabled bool) error {
	now := s.Clock.Now()
	t := EventModDisabled
	if enabled {
		t = EventModEnabled
	}
	for _, id := range ids {
		m, err := tx.Mods().Get(ctx, id)
		if errors.Is(err, ports.ErrNotFound) {
			return fail(CodeModNotFound, err, "mod", string(id))
		}
		if err != nil {
			return err
		}
		if m.State != mod.StateInstalled {
			return fail("mod_busy", nil, "mod", m.DisplayName())
		}
		if p.IsEnabled(id) == enabled {
			continue
		}
		if err := p.SetEnabled(id, enabled, now); err != nil {
			return err
		}
		tx.Emit(s.newEvent(t, subjectMod, string(id), map[string]string{"profile": string(p.ID()), "name": m.DisplayName()}))
	}
	return tx.Profiles().Save(ctx, p)
}
