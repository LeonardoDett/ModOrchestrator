package bridge

import (
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"modorchestrator/internal/core/application/diagnostics"
	"modorchestrator/internal/core/application/history"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/notification"
)

// --- Diagnostics, notifications and history (core/10, ui/telas/
// diagnostics.md §3). Diagnostics are calculated on every read; texts are
// rendered by the UI from code + parameters (D044, INV-OPS-05). ---

type DiagnosticEvidenceDTO struct {
	Kind   string            `json:"kind"`
	Ref    *EntityRefDTO     `json:"ref,omitempty"`
	Params map[string]string `json:"params,omitempty"`
}

type DiagnosticActionDTO struct {
	ID         string            `json:"id"`
	Params     map[string]string `json:"params,omitempty"`
	Target     *EntityRefDTO     `json:"target,omitempty"`
	NavigateTo string            `json:"navigateTo,omitempty"`
}

type DiagnosticDTO struct {
	Key        string                  `json:"key"`
	Code       string                  `json:"code"`
	Severity   string                  `json:"severity"`
	Blocking   bool                    `json:"blocking"`
	Blocks     []string                `json:"blocks"`
	Module     string                  `json:"module"`
	Instance   string                  `json:"instance"`
	Params     map[string]string       `json:"params"`
	Evidence   []DiagnosticEvidenceDTO `json:"evidence"`
	Actions    []DiagnosticActionDTO   `json:"actions"`
	Related    []EntityRefDTO          `json:"related"`
	FirstSeen  string                  `json:"firstSeen,omitempty"`
	New        bool                    `json:"new"`
	Suppressed bool                    `json:"suppressed"`
}

type DiagnosticCountsDTO struct {
	Blocking int `json:"blocking"`
	Errors   int `json:"errors"`
	Warnings int `json:"warnings"`
	Infos    int `json:"infos"`
}

type ProblemsDTO struct {
	Instance   string              `json:"instance"`
	Name       string              `json:"name,omitempty"`
	Items      []DiagnosticDTO     `json:"items"`
	Suppressed []DiagnosticDTO     `json:"suppressed"`
	Counts     DiagnosticCountsDTO `json:"counts"`
	Partial    bool                `json:"partial"`
}

type DiagnosticActionResultDTO struct {
	Operations []string `json:"operations"`
}

type SuppressionDTO struct {
	Key       string `json:"key,omitempty"`
	Code      string `json:"code,omitempty"`
	CreatedAt string `json:"createdAt"`
}

type NotificationDTO struct {
	ID        string            `json:"id"`
	Kind      string            `json:"kind"`
	Code      string            `json:"code"`
	Params    map[string]string `json:"params"`
	Subject   *EntityRefDTO     `json:"subject,omitempty"`
	Instance  string            `json:"instance,omitempty"`
	Severity  string            `json:"severity"`
	Count     int               `json:"count"`
	State     string            `json:"state"`
	CreatedAt string            `json:"createdAt"`
	UpdatedAt string            `json:"updatedAt"`
}

type HistoryFilterDTO struct {
	Instance string   `json:"instance"`
	Profile  string   `json:"profile"`
	Mod      string   `json:"mod"`
	Types    []string `json:"types"`
	Origin   string   `json:"origin"`
	From     string   `json:"from"`
	To       string   `json:"to"`
	Before   int64    `json:"before"`
	Limit    int      `json:"limit"`
}

type HistoryEntryDTO struct {
	ID         string            `json:"id"`
	Sequence   int64             `json:"sequence"`
	Type       string            `json:"type"`
	At         string            `json:"at"`
	Origin     string            `json:"origin"`
	Subject    *EntityRefDTO     `json:"subject,omitempty"`
	Operation  string            `json:"operation,omitempty"`
	Params     map[string]string `json:"params"`
	Items      int               `json:"items"`
	Reversible bool              `json:"reversible"`
	RevertedBy string            `json:"revertedBy,omitempty"`
	RevertOf   string            `json:"revertOf,omitempty"`
}

type EnableImpactDTO struct {
	AlsoEnable []NamedModDTO `json:"alsoEnable"`
	Affected   []NamedModDTO `json:"affected"`
}

func toDiagnosticDTO(it diagnostics.Item) DiagnosticDTO {
	d := it.Diagnostic
	dto := DiagnosticDTO{
		Key: string(d.Key), Code: string(d.Code), Severity: string(d.Severity), Blocking: d.IsBlocking(),
		Blocks: []string{}, Module: string(it.Module), Instance: string(it.Instance), Params: nonNil(d.Params),
		Evidence: []DiagnosticEvidenceDTO{}, Actions: []DiagnosticActionDTO{}, Related: []EntityRefDTO{},
		New: it.New, Suppressed: it.Suppressed,
	}
	if !it.FirstSeen.IsZero() {
		dto.FirstSeen = formatTime(it.FirstSeen)
	}
	for _, b := range d.Blocks {
		dto.Blocks = append(dto.Blocks, string(b))
	}
	for _, e := range d.Evidence {
		dto.Evidence = append(dto.Evidence, DiagnosticEvidenceDTO{Kind: e.Kind, Ref: refPtr(e.Ref), Params: e.Params})
	}
	for _, a := range d.Actions {
		dto.Actions = append(dto.Actions, DiagnosticActionDTO{ID: a.ID, Params: a.Params, Target: refPtr(a.Target), NavigateTo: a.NavigateTo})
	}
	for _, r := range d.Related {
		dto.Related = append(dto.Related, EntityRefDTO{Kind: r.Kind, ID: r.ID})
	}
	return dto
}

func refPtr(r *event.EntityRef) *EntityRefDTO {
	if r == nil {
		return nil
	}
	return refDTO(*r)
}

func nonNil(m map[string]string) map[string]string {
	if m == nil {
		return map[string]string{}
	}
	return m
}

func toProblemsDTO(v diagnostics.View) ProblemsDTO {
	dto := ProblemsDTO{
		Instance: string(v.Instance), Items: []DiagnosticDTO{}, Suppressed: []DiagnosticDTO{}, Partial: v.Partial,
		Counts: DiagnosticCountsDTO{Blocking: v.Counts.Blocking, Errors: v.Counts.Errors, Warnings: v.Counts.Warnings, Infos: v.Counts.Infos},
	}
	for _, it := range v.Items {
		dto.Items = append(dto.Items, toDiagnosticDTO(it))
	}
	for _, it := range v.Suppressed {
		dto.Suppressed = append(dto.Suppressed, toDiagnosticDTO(it))
	}
	return dto
}

// Diagnostics returns the Problems tab of an instance.
func (a *App) Diagnostics(instance string) (ProblemsDTO, error) {
	v, err := a.c.Diagnostics.Problems(a.context(), game.InstanceID(instance))
	if err != nil {
		return ProblemsDTO{}, a.fail("diagnostics", err, map[string]string{"instance": instance})
	}
	return toProblemsDTO(v), nil
}

// AttentionDiagnostics returns the blocking, error and warning diagnostics
// of every managed game (Dashboard "Precisa de atenção").
func (a *App) AttentionDiagnostics() ([]ProblemsDTO, error) {
	views, err := a.c.Diagnostics.Attention(a.context())
	if err != nil {
		return nil, a.fail("attention diagnostics", err, nil)
	}
	out := make([]ProblemsDTO, 0, len(views))
	for _, v := range views {
		dto := toProblemsDTO(v)
		if inst, err := a.c.Games.Details(a.context(), v.Instance); err == nil {
			dto.Name = inst.Instance.DisplayName
		}
		out = append(out, dto)
	}
	return out, nil
}

// MarkDiagnosticsVisited records the visit of the Problems tab ("novo").
func (a *App) MarkDiagnosticsVisited(instance string) error {
	if err := a.c.Diagnostics.MarkVisited(a.context(), game.InstanceID(instance)); err != nil {
		return a.fail("mark diagnostics visited", err, map[string]string{"instance": instance})
	}
	return nil
}

// RunHealthChecks is "Verificar agora".
func (a *App) RunHealthChecks(instance string) error {
	if err := a.c.Diagnostics.RunNow(a.context(), game.InstanceID(instance)); err != nil {
		return a.fail("run health checks", err, map[string]string{"instance": instance})
	}
	return nil
}

// ExecuteDiagnosticAction runs a command action of a current diagnostic;
// index disambiguates two actions with the same id ("Desabilitar A/B").
func (a *App) ExecuteDiagnosticAction(instance, key, actionID string, index int) (DiagnosticActionResultDTO, error) {
	res, err := a.c.Diagnostics.Execute(a.context(), game.InstanceID(instance), diagnostic.Key(key), actionID, index)
	if err != nil {
		return DiagnosticActionResultDTO{}, a.fail("diagnostic action", err, map[string]string{"instance": instance, "action": actionID})
	}
	dto := DiagnosticActionResultDTO{Operations: []string{}}
	for _, op := range res.Operations {
		dto.Operations = append(dto.Operations, string(op))
	}
	return dto, nil
}

// SuppressDiagnostic hides a diagnostic ("Ignorar este") or its whole code
// ("Não mostrar este tipo").
func (a *App) SuppressDiagnostic(instance, key string, wholeCode bool) error {
	if err := a.c.Diagnostics.Suppress(a.context(), game.InstanceID(instance), diagnostic.Key(key), wholeCode); err != nil {
		return a.fail("suppress diagnostic", err, map[string]string{"key": key})
	}
	return nil
}

// UnsuppressDiagnostic shows a key or a code again ("Reativar").
func (a *App) UnsuppressDiagnostic(key, code string) error {
	if err := a.c.Diagnostics.Unsuppress(a.context(), diagnostic.Key(key), diagnostic.Code(code)); err != nil {
		return a.fail("unsuppress diagnostic", err, map[string]string{"key": key, "code": code})
	}
	return nil
}

// Suppressions lists the hidden keys and codes.
func (a *App) Suppressions() ([]SuppressionDTO, error) {
	list, err := a.c.Diagnostics.SuppressionList(a.context())
	if err != nil {
		return nil, a.fail("suppressions", err, nil)
	}
	out := make([]SuppressionDTO, len(list))
	for i, s := range list {
		out[i] = SuppressionDTO{Key: string(s.Key), Code: string(s.Code), CreatedAt: formatTime(s.CreatedAt)}
	}
	return out, nil
}

// ResetSuppressedDiagnostics is Settings › Interface "Redefinir
// notificações suprimidas"; it returns how many there were.
func (a *App) ResetSuppressedDiagnostics() (int, error) {
	n, err := a.c.Diagnostics.ResetSuppressions(a.context())
	if err != nil {
		return 0, a.fail("reset suppressions", err, nil)
	}
	return n, nil
}

// Notifications lists the bell, newest first.
func (a *App) Notifications(limit int) ([]NotificationDTO, error) {
	list, err := a.c.Diagnostics.Notifications(a.context(), limit)
	if err != nil {
		return nil, a.fail("notifications", err, nil)
	}
	out := make([]NotificationDTO, len(list))
	for i, n := range list {
		out[i] = NotificationDTO{
			ID: string(n.ID), Kind: string(n.Kind), Code: n.Code, Params: nonNil(n.Params), Subject: refDTO(n.Subject),
			Instance: n.Instance, Severity: n.Severity, Count: n.Count, State: string(n.State),
			CreatedAt: formatTime(n.CreatedAt), UpdatedAt: formatTime(n.UpdatedAt),
		}
	}
	return out, nil
}

func notificationIDs(ids []string) []notification.ID {
	out := make([]notification.ID, len(ids))
	for i, id := range ids {
		out[i] = notification.ID(id)
	}
	return out
}

// MarkNotificationsRead marks the given notifications read (all when ids
// is empty).
func (a *App) MarkNotificationsRead(ids []string) error {
	if err := a.c.Diagnostics.MarkRead(a.context(), notificationIDs(ids)); err != nil {
		return a.fail("mark notifications read", err, nil)
	}
	return nil
}

// DismissNotifications removes notifications from the bell (all when ids
// is empty).
func (a *App) DismissNotifications(ids []string) error {
	if err := a.c.Diagnostics.Dismiss(a.context(), notificationIDs(ids)); err != nil {
		return a.fail("dismiss notifications", err, nil)
	}
	return nil
}

// SendDesktopNotification shows a Windows notification with text the UI
// already translated. The UI calls it only for a notification marked
// desktop while the window is in the background (core/10 §2).
func (a *App) SendDesktopNotification(id, title, body string) error {
	if a.ctx == nil {
		return nil
	}
	if !runtime.IsNotificationAvailable(a.ctx) {
		return nil
	}
	if err := runtime.SendNotification(a.ctx, runtime.NotificationOptions{ID: id, Title: title, Body: body}); err != nil {
		return a.fail("desktop notification", err, nil)
	}
	return nil
}

// History returns history entries, newest first (core/10 §3).
func (a *App) History(filter HistoryFilterDTO) ([]HistoryEntryDTO, error) {
	f := history.Filter{
		Instance: game.InstanceID(filter.Instance), Profile: filter.Profile, Mod: filter.Mod, Types: filter.Types,
		Origin: filter.Origin, Before: filter.Before, Limit: filter.Limit,
	}
	if t, err := time.Parse(time.RFC3339, filter.From); err == nil {
		f.From = t
	}
	if t, err := time.Parse(time.RFC3339, filter.To); err == nil {
		f.To = t
	}
	list, err := a.c.History.List(a.context(), f)
	if err != nil {
		return nil, a.fail("history", err, nil)
	}
	out := make([]HistoryEntryDTO, len(list))
	for i, e := range list {
		out[i] = toHistoryEntryDTO(e)
	}
	return out, nil
}

func toHistoryEntryDTO(e history.Entry) HistoryEntryDTO {
	return HistoryEntryDTO{
		ID: e.ID, Sequence: e.Sequence, Type: e.Type, At: formatTime(e.At), Origin: e.Origin, Subject: refDTO(e.Subject),
		Operation: e.Operation, Params: nonNil(e.Params), Items: e.Items, Reversible: e.Reversible,
		RevertedBy: e.RevertedBy, RevertOf: e.RevertOf,
	}
}

// RevertHistoryEntry applies the inverse of an entry as a new command.
func (a *App) RevertHistoryEntry(id string) error {
	if err := a.c.History.Revert(a.context(), id); err != nil {
		return a.fail("revert history entry", err, map[string]string{"entry": id})
	}
	return nil
}

// ExportSupportBundle asks where to save and writes the support bundle;
// it returns the path, or "" when the user cancels.
func (a *App) ExportSupportBundle(title, defaultName string) (string, error) {
	path, err := runtime.SaveFileDialog(a.context(), runtime.SaveDialogOptions{
		Title: title, DefaultFilename: defaultName,
		Filters: []runtime.FileFilter{{DisplayName: "Zip (*.zip)", Pattern: "*.zip"}},
	})
	if err != nil {
		return "", a.fail("support bundle dialog", err, nil)
	}
	if path == "" {
		return "", nil
	}
	if err := a.c.ExportSupportBundle(a.context(), path, Version); err != nil {
		return "", a.fail("export support bundle", err, nil)
	}
	a.c.Logger.Info("support bundle exported")
	return path, nil
}

// EnableImpact tells which disabled mods the given mods require (enabling)
// or which enabled mods depend on them (disabling), core/06 §6.
func (a *App) EnableImpact(instance string, ids []string, enabling bool) (EnableImpactDTO, error) {
	mods := make([]mod.ID, len(ids))
	for i, id := range ids {
		mods[i] = mod.ID(id)
	}
	v, err := a.c.Profiles.EnableImpact(a.context(), game.InstanceID(instance), mods, enabling)
	if err != nil {
		return EnableImpactDTO{}, a.fail("enable impact", err, map[string]string{"instance": instance})
	}
	dto := EnableImpactDTO{AlsoEnable: []NamedModDTO{}, Affected: []NamedModDTO{}}
	for _, m := range v.AlsoEnable {
		dto.AlsoEnable = append(dto.AlsoEnable, NamedModDTO{ID: string(m.ID), Name: m.Name})
	}
	for _, m := range v.Affected {
		dto.Affected = append(dto.Affected, NamedModDTO{ID: string(m.ID), Name: m.Name})
	}
	return dto, nil
}
