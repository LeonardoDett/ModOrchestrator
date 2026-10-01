package bridge

import (
	"time"

	"modorchestrator/internal/core/application/profiles"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/profile"
	"modorchestrator/internal/core/domain/rules"
)

// Profiles and mod order bridge (ui/telas/profiles.md §4, ui/telas/mods.md
// §10). Every method only translates between DTOs and the profiles
// service; none decides anything.

type ProfileSummaryDTO struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Notes           string `json:"notes"`
	Active          bool   `json:"active"`
	Enabled         int    `json:"enabled"`
	Mods            int    `json:"mods"`
	Snapshots       int    `json:"snapshots"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
	LastActivatedAt string `json:"lastActivatedAt,omitempty"`
}

type NamedModDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type PriorityDiffDTO struct {
	NamedModDTO
	A int `json:"a"`
	B int `json:"b"`
}

type PluginDiffDTO struct {
	Plugin string `json:"plugin"`
	A      int    `json:"a"`
	B      int    `json:"b"`
}

type ProfileComparisonDTO struct {
	A                ProfileSummaryDTO `json:"a"`
	B                ProfileSummaryDTO `json:"b"`
	OnlyA            []NamedModDTO     `json:"onlyA"`
	OnlyB            []NamedModDTO     `json:"onlyB"`
	PriorityChanged  []PriorityDiffDTO `json:"priorityChanged"`
	PluginsOnlyA     []string          `json:"pluginsOnlyA"`
	PluginsOnlyB     []string          `json:"pluginsOnlyB"`
	LoadOrderChanged []PluginDiffDTO   `json:"loadOrderChanged"`
}

type TransferOptionsDTO struct {
	Order   bool `json:"order"`
	Plugins bool `json:"plugins"`
}

type SnapshotDTO struct {
	ID        string `json:"id"`
	Reason    string `json:"reason"`
	CreatedAt string `json:"createdAt"`
	Enabled   int    `json:"enabled"`
	Mods      int    `json:"mods"`
}

type RestoreResultDTO struct {
	Ignored []NamedModDTO `json:"ignored"`
}

type SeparatorDTO struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Color     string `json:"color,omitempty"`
	Collapsed bool   `json:"collapsed"`
	Enabled   int    `json:"enabled"`
	Total     int    `json:"total"`
}

type OrderEntryDTO struct {
	Kind      string        `json:"kind"` // "mod" | "separator"
	ModID     string        `json:"modId,omitempty"`
	Priority  int           `json:"priority,omitempty"`
	Separator *SeparatorDTO `json:"separator,omitempty"`
}

type ModOrderDTO struct {
	ProfileID   string          `json:"profileId"`
	ProfileName string          `json:"profileName"`
	Entries     []OrderEntryDTO `json:"entries"`
	Undo        string          `json:"undo,omitempty"`
}

// EntryRefDTO names a mod or a separator of the order.
type EntryRefDTO struct {
	Mod       string `json:"mod,omitempty"`
	Separator string `json:"separator,omitempty"`
}

type AnchorDTO struct {
	Kind     string      `json:"kind"` // top | bottom | before | after | end_of_block | priority
	Entry    EntryRefDTO `json:"entry"`
	Priority int         `json:"priority,omitempty"`
}

type MoveRequestDTO struct {
	Entries []EntryRefDTO `json:"entries"`
	Anchor  AnchorDTO     `json:"anchor"`
	Mode    string        `json:"mode"` // exact | nearest | remove_rules
}

type RuleDTO struct {
	ID       string      `json:"id"`
	Kind     string      `json:"kind"` // wins | requires | recommends | incompatible
	A        NamedModDTO `json:"a"`
	B        NamedModDTO `json:"b"`
	Source   string      `json:"source"`
	Disabled bool        `json:"disabled"`
	Orphan   bool        `json:"orphan"`
}

type MoveResultDTO struct {
	Applied         bool      `json:"applied"`
	Violated        []RuleDTO `json:"violated"`
	HasNearest      bool      `json:"hasNearest"`
	NearestPriority int       `json:"nearestPriority,omitempty"`
}

type ModMoveDTO struct {
	NamedModDTO
	From    int      `json:"from"`
	To      int      `json:"to"`
	Because []string `json:"because"`
}

type ProfileMovesDTO struct {
	ProfileID string       `json:"profileId"`
	Name      string       `json:"name"`
	Moves     []ModMoveDTO `json:"moves"`
}

type RulePreviewDTO struct {
	Cycle    []NamedModDTO     `json:"cycle"`
	Profiles []ProfileMovesDTO `json:"profiles"`
}

type OrderChangeDTO struct {
	ID         string `json:"id"`
	At         string `json:"at"`
	Reason     string `json:"reason"`
	Moved      int    `json:"moved"`
	RevertOf   string `json:"revertOf,omitempty"`
	Reverted   bool   `json:"reverted"`
	Revertible bool   `json:"revertible"`
}

func optionalTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return formatTime(t)
}

func toProfileSummaryDTO(s profiles.Summary) ProfileSummaryDTO {
	return ProfileSummaryDTO{
		ID: string(s.ID), Name: s.Name, Notes: s.Notes, Active: s.Active, Enabled: s.Enabled, Mods: s.Mods,
		Snapshots: s.Snapshots, CreatedAt: formatTime(s.CreatedAt), UpdatedAt: formatTime(s.UpdatedAt),
		LastActivatedAt: optionalTime(s.LastActivatedAt),
	}
}

func toNamed(list []profiles.NamedMod) []NamedModDTO {
	out := make([]NamedModDTO, len(list))
	for i, m := range list {
		out[i] = NamedModDTO{ID: string(m.ID), Name: m.Name}
	}
	return out
}

func toRuleDTO(r profiles.RuleView) RuleDTO {
	return RuleDTO{
		ID: string(r.ID), Kind: string(r.Kind), A: NamedModDTO{ID: string(r.A.ID), Name: r.A.Name},
		B: NamedModDTO{ID: string(r.B.ID), Name: r.B.Name}, Source: string(r.Source), Disabled: r.Disabled, Orphan: r.Orphan,
	}
}

func toEntry(e EntryRefDTO) profile.Entry {
	return profile.Entry{Mod: mod.ID(e.Mod), Separator: profile.SeparatorID(e.Separator)}
}

func toAnchor(a AnchorDTO) profile.Anchor {
	return profile.Anchor{Kind: profile.AnchorKind(a.Kind), Entry: toEntry(a.Entry), Priority: a.Priority}
}

func orNonNil[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}

// ProfileList returns the profiles of an instance.
func (a *App) ProfileList(instance string) ([]ProfileSummaryDTO, error) {
	list, err := a.c.Profiles.List(a.context(), game.InstanceID(instance))
	if err != nil {
		return nil, a.fail("profile list", err, map[string]string{"instance": instance})
	}
	out := make([]ProfileSummaryDTO, len(list))
	for i, s := range list {
		out[i] = toProfileSummaryDTO(s)
	}
	return out, nil
}

// CreateProfile creates an empty profile (from = "") or a clone of from.
func (a *App) CreateProfile(instance, name, from string) (string, error) {
	id, err := a.c.Profiles.Create(a.context(), game.InstanceID(instance), name, profile.ID(from))
	if err != nil {
		return "", a.fail("create profile", err, map[string]string{"name": name})
	}
	return string(id), nil
}

// RenameProfile changes the name of a profile.
func (a *App) RenameProfile(id, name string) error {
	if err := a.c.Profiles.Rename(a.context(), profile.ID(id), name); err != nil {
		return a.fail("rename profile", err, map[string]string{"name": name})
	}
	return nil
}

// SetProfileNotes replaces the notes of a profile.
func (a *App) SetProfileNotes(id, notes string) error {
	if err := a.c.Profiles.SetNotes(a.context(), profile.ID(id), notes); err != nil {
		return a.fail("profile notes", err, map[string]string{"profile": id})
	}
	return nil
}

// DeleteProfile removes a profile and its snapshots.
func (a *App) DeleteProfile(id string) error {
	if err := a.c.Profiles.Delete(a.context(), profile.ID(id)); err != nil {
		return a.fail("delete profile", err, map[string]string{"profile": id})
	}
	return nil
}

// ActivateProfile makes a profile the active one of its instance.
func (a *App) ActivateProfile(id string) error {
	if err := a.c.Profiles.Activate(a.context(), profile.ID(id)); err != nil {
		return a.fail("activate profile", err, map[string]string{"profile": id})
	}
	return nil
}

// CompareProfiles returns the differences between two profiles.
func (a *App) CompareProfiles(idA, idB string) (ProfileComparisonDTO, error) {
	c, err := a.c.Profiles.Compare(a.context(), profile.ID(idA), profile.ID(idB))
	if err != nil {
		return ProfileComparisonDTO{}, a.fail("compare profiles", err, nil)
	}
	out := ProfileComparisonDTO{
		A: toProfileSummaryDTO(c.A), B: toProfileSummaryDTO(c.B), OnlyA: toNamed(c.OnlyA), OnlyB: toNamed(c.OnlyB),
		PriorityChanged: []PriorityDiffDTO{}, PluginsOnlyA: orNonNil(c.PluginsOnlyA), PluginsOnlyB: orNonNil(c.PluginsOnlyB),
		LoadOrderChanged: []PluginDiffDTO{},
	}
	for _, d := range c.PriorityChanged {
		out.PriorityChanged = append(out.PriorityChanged, PriorityDiffDTO{NamedModDTO: NamedModDTO{ID: string(d.ID), Name: d.Name}, A: d.A, B: d.B})
	}
	for _, d := range c.LoadOrderChanged {
		out.LoadOrderChanged = append(out.LoadOrderChanged, PluginDiffDTO{Plugin: d.Plugin, A: d.A, B: d.B})
	}
	return out, nil
}

// TransferSelection copies the selection of one profile into another.
func (a *App) TransferSelection(from, to string, opts TransferOptionsDTO) error {
	err := a.c.Profiles.Transfer(a.context(), profile.ID(from), profile.ID(to), profiles.TransferOptions{Order: opts.Order, Plugins: opts.Plugins})
	if err != nil {
		return a.fail("transfer selection", err, nil)
	}
	return nil
}

// ProfileSnapshots lists the restore points of a profile.
func (a *App) ProfileSnapshots(id string) ([]SnapshotDTO, error) {
	list, err := a.c.Profiles.Snapshots(a.context(), profile.ID(id))
	if err != nil {
		return nil, a.fail("snapshots", err, map[string]string{"profile": id})
	}
	out := make([]SnapshotDTO, len(list))
	for i, s := range list {
		out[i] = SnapshotDTO{ID: string(s.ID), Reason: string(s.Reason), CreatedAt: formatTime(s.CreatedAt), Enabled: s.Enabled, Mods: s.Mods}
	}
	return out, nil
}

// CreateSnapshot takes a manual restore point.
func (a *App) CreateSnapshot(id string) (string, error) {
	sid, err := a.c.Profiles.CreateSnapshot(a.context(), profile.ID(id))
	if err != nil {
		return "", a.fail("create snapshot", err, map[string]string{"profile": id})
	}
	return string(sid), nil
}

// RestoreSnapshot restores a restore point of a profile.
func (a *App) RestoreSnapshot(id, snapshot string) (RestoreResultDTO, error) {
	res, err := a.c.Profiles.RestoreSnapshot(a.context(), profile.ID(id), profile.SnapshotID(snapshot))
	if err != nil {
		return RestoreResultDTO{}, a.fail("restore snapshot", err, map[string]string{"profile": id})
	}
	return RestoreResultDTO{Ignored: toNamed(res.Ignored)}, nil
}

// SetModsEnabled enables or disables mods in the active profile.
func (a *App) SetModsEnabled(instance string, ids []string, enabled bool) error {
	if err := a.c.Profiles.SetModsEnabled(a.context(), game.InstanceID(instance), modIDs(ids), enabled); err != nil {
		return a.fail("set enabled", err, map[string]string{"instance": instance})
	}
	return nil
}

// ModOrder returns the mod order of the active profile with separators.
func (a *App) ModOrder(instance string) (ModOrderDTO, error) {
	v, err := a.c.Profiles.OrderView(a.context(), game.InstanceID(instance))
	if err != nil {
		return ModOrderDTO{}, a.fail("mod order", err, map[string]string{"instance": instance})
	}
	out := ModOrderDTO{ProfileID: string(v.Profile), ProfileName: v.ProfileName, Undo: v.Undo, Entries: make([]OrderEntryDTO, len(v.Entries))}
	for i, e := range v.Entries {
		if e.Separator != nil {
			s := e.Separator
			out.Entries[i] = OrderEntryDTO{Kind: "separator", Separator: &SeparatorDTO{
				ID: string(s.ID), Label: s.Label, Color: s.Color, Collapsed: s.Collapsed, Enabled: s.Enabled, Total: s.Total,
			}}
			continue
		}
		out.Entries[i] = OrderEntryDTO{Kind: "mod", ModID: string(e.Mod), Priority: e.Priority}
	}
	return out, nil
}

// MoveMods moves mods or separators of the active profile. A position that
// breaks rules returns applied=false with the rules and the nearest valid
// position (DLG-11); nothing changes then.
func (a *App) MoveMods(instance string, req MoveRequestDTO) (MoveResultDTO, error) {
	entries := make([]profile.Entry, len(req.Entries))
	for i, e := range req.Entries {
		entries[i] = toEntry(e)
	}
	res, err := a.c.Profiles.MoveMods(a.context(), game.InstanceID(instance), entries, toAnchor(req.Anchor), profiles.MoveMode(req.Mode))
	if err != nil {
		return MoveResultDTO{}, a.fail("move mods", err, map[string]string{"instance": instance})
	}
	out := MoveResultDTO{Applied: res.Applied, HasNearest: res.HasNearest, NearestPriority: res.NearestPriority, Violated: []RuleDTO{}}
	for _, r := range res.Violated {
		out.Violated = append(out.Violated, toRuleDTO(r))
	}
	return out, nil
}

// CreateSeparator inserts a separator at the anchor (top without one).
func (a *App) CreateSeparator(instance, label, color string, anchor AnchorDTO) (string, error) {
	id, err := a.c.Profiles.CreateSeparator(a.context(), game.InstanceID(instance), label, color, toAnchor(anchor))
	if err != nil {
		return "", a.fail("create separator", err, map[string]string{"instance": instance})
	}
	return string(id), nil
}

// UpdateSeparator changes label, colour or collapsed state.
func (a *App) UpdateSeparator(instance string, sep SeparatorDTO) error {
	err := a.c.Profiles.UpdateSeparator(a.context(), game.InstanceID(instance), profile.Separator{
		ID: profile.SeparatorID(sep.ID), Label: sep.Label, Color: sep.Color, Collapsed: sep.Collapsed,
	})
	if err != nil {
		return a.fail("update separator", err, map[string]string{"separator": sep.ID})
	}
	return nil
}

// DeleteSeparator removes a separator; its mods stay in place.
func (a *App) DeleteSeparator(instance, id string) error {
	if err := a.c.Profiles.DeleteSeparator(a.context(), game.InstanceID(instance), profile.SeparatorID(id)); err != nil {
		return a.fail("delete separator", err, map[string]string{"separator": id})
	}
	return nil
}

// SetSeparatorBlockEnabled enables or disables every mod of a block.
func (a *App) SetSeparatorBlockEnabled(instance, id string, enabled bool) error {
	if err := a.c.Profiles.SetBlockEnabled(a.context(), game.InstanceID(instance), profile.SeparatorID(id), enabled); err != nil {
		return a.fail("block enabled", err, map[string]string{"separator": id})
	}
	return nil
}

// ModRules lists every rule of the instance.
func (a *App) ModRules(instance string) ([]RuleDTO, error) {
	list, err := a.c.Profiles.RuleList(a.context(), game.InstanceID(instance))
	if err != nil {
		return nil, a.fail("rules", err, map[string]string{"instance": instance})
	}
	out := make([]RuleDTO, len(list))
	for i, r := range list {
		out[i] = toRuleDTO(r)
	}
	return out, nil
}

// PreviewOrderRule shows what "winner wins loser" would move, per profile,
// or the cycle that refuses it.
func (a *App) PreviewOrderRule(instance, winner, loser string) (RulePreviewDTO, error) {
	p, err := a.c.Profiles.PreviewOrderRule(a.context(), game.InstanceID(instance), mod.ID(winner), mod.ID(loser))
	if err != nil {
		return RulePreviewDTO{}, a.fail("preview rule", err, nil)
	}
	return toRulePreviewDTO(p), nil
}

func toRulePreviewDTO(p profiles.RulePreview) RulePreviewDTO {
	out := RulePreviewDTO{Cycle: toNamed(p.Cycle), Profiles: []ProfileMovesDTO{}}
	for _, pm := range p.Profiles {
		dto := ProfileMovesDTO{ProfileID: string(pm.Profile), Name: pm.Name, Moves: make([]ModMoveDTO, len(pm.Moves))}
		for i, m := range pm.Moves {
			because := make([]string, len(m.Because))
			for j, r := range m.Because {
				because[j] = string(r)
			}
			dto.Moves[i] = ModMoveDTO{NamedModDTO: NamedModDTO{ID: string(m.ID), Name: m.Name}, From: m.From, To: m.To, Because: because}
		}
		out.Profiles = append(out.Profiles, dto)
	}
	return out
}

// CreateOrderRule stores "winner wins loser" and applies it to every profile.
func (a *App) CreateOrderRule(instance, winner, loser string) (string, error) {
	id, err := a.c.Profiles.CreateOrderRule(a.context(), game.InstanceID(instance), mod.ID(winner), mod.ID(loser))
	if err != nil {
		return "", a.fail("create rule", err, nil)
	}
	return string(id), nil
}

// AddDependencyRule stores "mod requires/recommends target".
func (a *App) AddDependencyRule(instance, modID, target, kind string) (string, error) {
	id, err := a.c.Profiles.AddDependency(a.context(), game.InstanceID(instance), mod.ID(modID), mod.ID(target), rules.DependencyKind(kind))
	if err != nil {
		return "", a.fail("add dependency", err, nil)
	}
	return string(id), nil
}

// AddIncompatibilityRule stores "a is incompatible with b".
func (a *App) AddIncompatibilityRule(instance, modA, modB string) (string, error) {
	id, err := a.c.Profiles.AddIncompatibility(a.context(), game.InstanceID(instance), mod.ID(modA), mod.ID(modB))
	if err != nil {
		return "", a.fail("add incompatibility", err, nil)
	}
	return string(id), nil
}

// RemoveRule deletes a user rule (never moves anything).
func (a *App) RemoveRule(instance, id string) error {
	if err := a.c.Profiles.RemoveRule(a.context(), game.InstanceID(instance), rules.ID(id)); err != nil {
		return a.fail("remove rule", err, map[string]string{"rule": id})
	}
	return nil
}

// SetRuleDisabled disables or re-enables a rule.
func (a *App) SetRuleDisabled(instance, id string, disabled bool) error {
	if err := a.c.Profiles.SetRuleDisabled(a.context(), game.InstanceID(instance), rules.ID(id), disabled); err != nil {
		return a.fail("rule disabled", err, map[string]string{"rule": id})
	}
	return nil
}

// OrderHistory lists the reversible order changes of the active profile.
func (a *App) OrderHistory(instance string) ([]OrderChangeDTO, error) {
	list, err := a.c.Profiles.OrderHistory(a.context(), game.InstanceID(instance))
	if err != nil {
		return nil, a.fail("order history", err, nil)
	}
	out := make([]OrderChangeDTO, len(list))
	for i, c := range list {
		out[i] = OrderChangeDTO{ID: c.ID, At: formatTime(c.At), Reason: c.Reason, Moved: c.Moved, RevertOf: c.RevertOf, Reverted: c.Reverted, Revertible: c.Revertible}
	}
	return out, nil
}

// RevertOrderChange reverts one order change from history.
func (a *App) RevertOrderChange(instance, id string) error {
	if err := a.c.Profiles.RevertOrderChange(a.context(), game.InstanceID(instance), id); err != nil {
		return a.fail("revert order", err, nil)
	}
	return nil
}

// UndoOrderChange reverts the latest order change (Ctrl+Z).
func (a *App) UndoOrderChange(instance string) error {
	if err := a.c.Profiles.UndoOrderChange(a.context(), game.InstanceID(instance)); err != nil {
		return a.fail("undo order", err, nil)
	}
	return nil
}
