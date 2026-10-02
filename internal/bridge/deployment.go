package bridge

import (
	"modorchestrator/internal/core/application/deployment"
	"modorchestrator/internal/core/domain/externalchange"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
)

// --- Deploy and purge (core/04, ui/00 §2.3 status, DLG-14/16/17/18). The
// status and plans are calculated by the backend on every read; the UI
// only shows them and rereads after operation events (D021). ---

type DeployFailureDTO struct {
	Location LocationDTO `json:"location"`
	Action   string      `json:"action,omitempty"`
	Code     string      `json:"code"`
}

type ForeignFindingDTO struct {
	Kind     string `json:"kind"`
	Target   string `json:"target,omitempty"`
	Name     string `json:"name"`
	Instance string `json:"instance,omitempty"`
}

type ProfileRefDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type DeployStatusDTO struct {
	Instance        string              `json:"instance"`
	Kind            string              `json:"kind"`
	Reason          string              `json:"reason"`
	ActiveProfile   ProfileRefDTO       `json:"activeProfile"`
	AppliedProfile  *ProfileRefDTO      `json:"appliedProfile,omitempty"`
	AppliedAt       string              `json:"appliedAt,omitempty"`
	Method          string              `json:"method"`
	Entries         int                 `json:"entries"`
	Busy            string              `json:"busy,omitempty"`
	PendingDecision string              `json:"pendingDecision,omitempty"`
	ExternalChanges int                 `json:"externalChanges"`
	NewFiles        int                 `json:"newFiles"`
	Foreign         []ForeignFindingDTO `json:"foreign"`
	Failures        []DeployFailureDTO  `json:"failures"`
}

type DeploySummaryDTO struct {
	Create          int   `json:"create"`
	Keep            int   `json:"keep"`
	Replace         int   `json:"replace"`
	Remove          int   `json:"remove"`
	BackupAndCreate int   `json:"backupAndCreate"`
	RestoreBackup   int   `json:"restoreBackup"`
	Mkdir           int   `json:"mkdir"`
	RemoveDir       int   `json:"removeDir"`
	ExtraBytes      int64 `json:"extraBytes"`
	Decisions       int   `json:"decisions"`
}

// FileFactsDTO is the size and time shown before/after in DLG-15.
type FileFactsDTO struct {
	Size    int64  `json:"size"`
	ModTime string `json:"modTime,omitempty"`
}

// DeployChangeDTO is one row of DLG-15: the actions offered come from the
// backend (core/09 §4), the UI never decides them.
type DeployChangeDTO struct {
	Location  LocationDTO   `json:"location"`
	Kind      string        `json:"kind"`
	Mod       string        `json:"mod,omitempty"`
	ModName   string        `json:"modName,omitempty"`
	Method    string        `json:"method,omitempty"`
	Wanted    bool          `json:"wanted"`
	Actions   []string      `json:"actions"`
	Suggested string        `json:"suggested,omitempty"`
	Before    *FileFactsDTO `json:"before,omitempty"`
	After     *FileFactsDTO `json:"after,omitempty"`
}

// ExternalDecisionDTO is the action chosen for one row of DLG-15.
type ExternalDecisionDTO struct {
	Location        LocationDTO `json:"location"`
	Action          string      `json:"action"`
	CaptureInto     string      `json:"captureInto,omitempty"`
	CaptureName     string      `json:"captureName,omitempty"`
	CaptureCategory string      `json:"captureCategory,omitempty"`
}

// ExternalChangesDTO is a scan outside a deploy (verify, review).
type ExternalChangesDTO struct {
	Instance     string            `json:"instance"`
	Changes      []DeployChangeDTO `json:"changes"`
	ChangeCount  int               `json:"changeCount"`
	NewFileCount int               `json:"newFileCount"`
}

type DeployBlockedDTO struct {
	Location LocationDTO `json:"location"`
	Reason   string      `json:"reason"`
}

type DeployFallbackDTO struct {
	Key    string        `json:"key"`
	Target string        `json:"target"`
	From   string        `json:"from"`
	To     string        `json:"to"`
	Count  int           `json:"count"`
	Sample []LocationDTO `json:"sample"`
}

type DeployPlanDTO struct {
	Instance     string              `json:"instance"`
	Operation    string              `json:"operation,omitempty"`
	Kind         string              `json:"kind"`
	Summary      DeploySummaryDTO    `json:"summary"`
	Changes      []DeployChangeDTO   `json:"changes"`
	Blocked      []DeployBlockedDTO  `json:"blocked"`
	Fallbacks    []DeployFallbackDTO `json:"fallbacks"`
	ChangeCount  int                 `json:"changeCount"`
	BlockedCount int                 `json:"blockedCount"`
	NewFileCount int                 `json:"newFileCount"`
	Empty        bool                `json:"empty"`
}

type DeployMethodDTO struct {
	Method    string `json:"method"`
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"`
	Preferred bool   `json:"preferred"`
}

type StagingPreviewDTO struct {
	From          string `json:"from"`
	To            string `json:"to"`
	Bytes         int64  `json:"bytes"`
	Free          int64  `json:"free"`
	Deployed      bool   `json:"deployed"`
	SameVolume    bool   `json:"sameVolume"`
	HardlinkAfter bool   `json:"hardlinkAfter"`
	Problem       string `json:"problem,omitempty"`
	Reason        string `json:"reason,omitempty"`
}

func toFactsDTO(f *deployment.FileFacts) *FileFactsDTO {
	if f == nil {
		return nil
	}
	dto := &FileFactsDTO{Size: f.Size}
	if !f.ModTime.IsZero() {
		dto.ModTime = formatTime(f.ModTime)
	}
	return dto
}

func toChangeDTOs(cs []deployment.ChangeView) []DeployChangeDTO {
	out := make([]DeployChangeDTO, 0, len(cs))
	for _, c := range cs {
		d := DeployChangeDTO{Location: toLocationDTO(c.Location), Kind: string(c.Kind), Mod: string(c.Mod), ModName: c.ModName,
			Method: string(c.Method), Wanted: c.Wanted, Actions: make([]string, len(c.Actions)), Suggested: string(c.Suggested),
			Before: toFactsDTO(c.Before), After: toFactsDTO(c.After)}
		for i, a := range c.Actions {
			d.Actions[i] = string(a)
		}
		out = append(out, d)
	}
	return out
}

func toExternalDecisions(list []ExternalDecisionDTO) ([]deployment.DecisionInput, error) {
	out := make([]deployment.DecisionInput, 0, len(list))
	for _, d := range list {
		locs, err := toLocations([]LocationDTO{d.Location})
		if err != nil {
			return nil, err
		}
		out = append(out, deployment.DecisionInput{Location: locs[0], Action: externalchange.Action(d.Action),
			CaptureInto: mod.ID(d.CaptureInto), CaptureName: d.CaptureName, CaptureCategory: d.CaptureCategory})
	}
	return out, nil
}

func toPlanDTO(v deployment.PlanView) DeployPlanDTO {
	s := v.Summary
	dto := DeployPlanDTO{
		Instance: string(v.Instance), Operation: string(v.Operation), Kind: string(v.Kind),
		Summary: DeploySummaryDTO{Create: s.Create, Keep: s.Keep, Replace: s.Replace, Remove: s.Remove, BackupAndCreate: s.BackupAndCreate,
			RestoreBackup: s.RestoreBackup, Mkdir: s.Mkdir, RemoveDir: s.RemoveDir, ExtraBytes: s.ExtraBytes, Decisions: s.Decisions},
		Changes: toChangeDTOs(v.Changes), Blocked: []DeployBlockedDTO{}, Fallbacks: []DeployFallbackDTO{},
		ChangeCount: v.ChangeCount, BlockedCount: v.BlockedCount, NewFileCount: v.NewFileCount, Empty: v.Empty,
	}
	for _, b := range v.Blocked {
		dto.Blocked = append(dto.Blocked, DeployBlockedDTO{Location: toLocationDTO(b.Location), Reason: string(b.Reason)})
	}
	for _, f := range v.Fallbacks {
		fd := DeployFallbackDTO{Key: f.Key, Target: string(f.Target), From: string(f.From), To: string(f.To), Count: f.Count, Sample: []LocationDTO{}}
		for _, l := range f.Sample {
			fd.Sample = append(fd.Sample, toLocationDTO(l))
		}
		dto.Fallbacks = append(dto.Fallbacks, fd)
	}
	return dto
}

// DeployStatus returns the deployment status of an instance (topbar,
// Overview, popover).
func (a *App) DeployStatus(instance string) (DeployStatusDTO, error) {
	v, err := a.c.Deployment.Status(a.context(), game.InstanceID(instance))
	if err != nil {
		return DeployStatusDTO{}, a.fail("deploy status", err, map[string]string{"instance": instance})
	}
	dto := DeployStatusDTO{
		Instance: instance, Kind: string(v.Status.Kind), Reason: string(v.Status.Reason),
		ActiveProfile: ProfileRefDTO{ID: v.ActiveProfile.ID, Name: v.ActiveProfile.Name},
		Method:        string(v.Method), Entries: v.Entries, Busy: v.Busy, PendingDecision: string(v.PendingDecision),
		ExternalChanges: v.ExternalChanges, NewFiles: v.NewFiles, Foreign: []ForeignFindingDTO{}, Failures: []DeployFailureDTO{},
	}
	if v.AppliedProfile.ID != "" {
		dto.AppliedProfile = &ProfileRefDTO{ID: v.AppliedProfile.ID, Name: v.AppliedProfile.Name}
	}
	if !v.AppliedAt.IsZero() {
		dto.AppliedAt = formatTime(v.AppliedAt)
	}
	for _, f := range v.Foreign {
		dto.Foreign = append(dto.Foreign, ForeignFindingDTO{Kind: string(f.Kind), Target: string(f.Target), Name: f.Name, Instance: string(f.Instance)})
	}
	for _, f := range v.Failures {
		dto.Failures = append(dto.Failures, DeployFailureDTO{Location: toLocationDTO(f.Location), Action: string(f.Action), Code: f.Code})
	}
	return dto, nil
}

// PreviewDeploy computes what a deploy (or purge) would do, reading only.
func (a *App) PreviewDeploy(instance string, purge bool) (DeployPlanDTO, error) {
	v, err := a.c.Deployment.Preview(a.context(), game.InstanceID(instance), purge)
	if err != nil {
		return DeployPlanDTO{}, a.fail("preview deploy", err, map[string]string{"instance": instance})
	}
	return toPlanDTO(v), nil
}

// Deploy starts a deploy of the active profile; it returns the operation.
func (a *App) Deploy(instance string) (string, error) {
	id, err := a.c.Deployment.Deploy(a.context(), game.InstanceID(instance))
	if err != nil {
		return "", a.fail("deploy", err, map[string]string{"instance": instance})
	}
	return string(id), nil
}

// Purge starts a purge; it returns the operation.
func (a *App) Purge(instance string) (string, error) {
	id, err := a.c.Deployment.Purge(a.context(), game.InstanceID(instance))
	if err != nil {
		return "", a.fail("purge", err, map[string]string{"instance": instance})
	}
	return string(id), nil
}

// ReconcileDeploy recovers an interrupted deploy or purge.
func (a *App) ReconcileDeploy(instance string) (string, error) {
	id, err := a.c.Deployment.Reconcile(a.context(), game.InstanceID(instance))
	if err != nil {
		return "", a.fail("reconcile deploy", err, map[string]string{"instance": instance})
	}
	return string(id), nil
}

// CancelDeploy stops the running deploy or purge of an instance.
func (a *App) CancelDeploy(instance string) bool {
	return a.c.Deployment.Cancel(game.InstanceID(instance))
}

// PendingDeployDecision returns the plan of a deploy waiting for a decision
// (nil when none waits).
func (a *App) PendingDeployDecision(instance string) *DeployPlanDTO {
	v, ok := a.c.Deployment.PendingDecision(game.InstanceID(instance))
	if !ok {
		return nil
	}
	dto := toPlanDTO(v)
	return &dto
}

// ResolveDeployDecision continues a waiting deploy: the listed method
// fallbacks are accepted and each external change gets its chosen action
// (DLG-15); everything else that needed a decision is left untouched in
// this run.
func (a *App) ResolveDeployDecision(instance, op string, acceptFallbacks []string, decisions []ExternalDecisionDTO) error {
	ds, err := toExternalDecisions(decisions)
	if err != nil {
		return a.fail("resolve deploy decision", err, map[string]string{"operation": op})
	}
	if err := a.c.Deployment.ResolveDecision(game.InstanceID(instance), operation.ID(op), acceptFallbacks, ds); err != nil {
		return a.fail("resolve deploy decision", err, map[string]string{"operation": op})
	}
	return nil
}

// CancelDeployDecision cancels a waiting deploy; nothing was written.
func (a *App) CancelDeployDecision(instance, op string) error {
	if err := a.c.Deployment.CancelDecision(game.InstanceID(instance), operation.ID(op)); err != nil {
		return a.fail("cancel deploy decision", err, map[string]string{"operation": op})
	}
	return nil
}

// VerifyDeployment scans the deployed files and the folders around them
// ("Verificar implantação", review of external changes, DLG-15).
func (a *App) VerifyDeployment(instance string) (ExternalChangesDTO, error) {
	v, err := a.c.Deployment.Verify(a.context(), game.InstanceID(instance))
	if err != nil {
		return ExternalChangesDTO{}, a.fail("verify deployment", err, map[string]string{"instance": instance})
	}
	return ExternalChangesDTO{Instance: instance, Changes: toChangeDTOs(v.Changes), ChangeCount: v.ChangeCount, NewFileCount: v.NewFileCount}, nil
}

// ScanExternalChanges is the limited scan made when the window gets the
// focus (core/09 §3); the UI rereads the status if the counts changed.
func (a *App) ScanExternalChanges(instance string) error {
	if err := a.c.Deployment.ScanOnFocus(a.context(), game.InstanceID(instance)); err != nil {
		return a.fail("scan external changes", err, map[string]string{"instance": instance})
	}
	return nil
}

// ResolveExternalChanges applies the decisions of the review outside a
// deploy (DLG-15): they run as a deploy, the only writer to the game
// (D080). It returns the operation.
func (a *App) ResolveExternalChanges(instance string, decisions []ExternalDecisionDTO) (string, error) {
	ds, err := toExternalDecisions(decisions)
	if err != nil {
		return "", a.fail("resolve external changes", err, map[string]string{"instance": instance})
	}
	id, err := a.c.Deployment.ResolveChanges(a.context(), game.InstanceID(instance), ds)
	if err != nil {
		return "", a.fail("resolve external changes", err, map[string]string{"instance": instance})
	}
	return string(id), nil
}

// DeployMethods reports which deployment methods work and why not.
func (a *App) DeployMethods(instance string) ([]DeployMethodDTO, error) {
	ms, err := a.c.Deployment.Methods(a.context(), game.InstanceID(instance))
	if err != nil {
		return nil, a.fail("deploy methods", err, map[string]string{"instance": instance})
	}
	out := make([]DeployMethodDTO, len(ms))
	for i, m := range ms {
		out[i] = DeployMethodDTO{Method: string(m.Method), Available: m.Available, Reason: m.Reason, Preferred: m.Preferred}
	}
	return out, nil
}

// ChangeDeployMethod purges, switches the method and deploys again.
func (a *App) ChangeDeployMethod(instance, method string) (string, error) {
	id, err := a.c.Deployment.ChangeMethod(a.context(), game.InstanceID(instance), game.DeploymentMethod(method))
	if err != nil {
		return "", a.fail("change deploy method", err, map[string]string{"instance": instance, "method": method})
	}
	return string(id), nil
}

// PreviewMoveStaging validates a new staging folder and estimates the move.
func (a *App) PreviewMoveStaging(instance, path string) (StagingPreviewDTO, error) {
	p, err := a.c.Deployment.PreviewMoveStaging(a.context(), game.InstanceID(instance), path)
	if err != nil {
		return StagingPreviewDTO{}, a.fail("preview staging move", err, map[string]string{"instance": instance})
	}
	return StagingPreviewDTO{From: p.From, To: p.To, Bytes: p.Bytes, Free: p.Free, Deployed: p.Deployed, SameVolume: p.SameVolume,
		HardlinkAfter: p.HardlinkAfter, Problem: p.Problem, Reason: p.Reason}, nil
}

// MoveStaging moves the staging folder (purge, copy, save, deploy).
func (a *App) MoveStaging(instance, path string) (string, error) {
	id, err := a.c.Deployment.MoveStaging(a.context(), game.InstanceID(instance), path)
	if err != nil {
		return "", a.fail("move staging", err, map[string]string{"instance": instance, "folder": path})
	}
	return string(id), nil
}

// instanceSettingKeys are the instance settings the UI edits so far (F7).
var instanceSettingKeys = []string{"automation.deployOnChange", "deploy.cleanEmptyDirs", "deploy.autoRestoreMissing"}

// ListInstanceSettings returns the editable instance-scoped settings.
func (a *App) ListInstanceSettings(instance string) ([]SettingDTO, error) {
	all, err := a.c.Settings.Instance(a.context(), instance, instanceSettingKeys)
	if err != nil {
		return nil, a.fail("list instance settings", err, map[string]string{"instance": instance})
	}
	out := make([]SettingDTO, len(all))
	for i, e := range all {
		out[i] = toSettingDTO(e)
	}
	return out, nil
}

// SetInstanceSetting stores an instance-scoped value.
func (a *App) SetInstanceSetting(instance, key, value string) error {
	if err := a.c.Settings.SetInstance(a.context(), instance, key, value); err != nil {
		return a.fail("set instance setting", err, map[string]string{"key": key, "value": value})
	}
	a.c.Logger.Info("instance setting changed", "instance", instance, "key", key, "value", value)
	return nil
}

// OpenLocationFolder shows the folder holding a location of the game in the
// file manager (DLG-15 "Abrir pasta").
func (a *App) OpenLocationFolder(instance string, loc LocationDTO) error {
	locs, err := toLocations([]LocationDTO{loc})
	if err == nil {
		var path string
		if path, err = a.c.Deployment.LocationFolder(a.context(), game.InstanceID(instance), locs[0]); err == nil {
			err = a.c.OpenFolder(path)
		}
	}
	if err != nil {
		return a.fail("open location folder", err, map[string]string{"instance": instance, "folder": "location"})
	}
	return nil
}
