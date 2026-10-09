// Package appupdate is the application service of the opt-in update of the
// app itself (plano-de-publicacao.md, etapa 6; D077 item 7; D104). It is
// the only network access of V1 and runs only with app.updateCheck on:
// it lists the releases, offers the newest one of app.updateChannel with
// its notes, and on the user's command downloads the installer, checks it
// against the release SHA256SUMS and its signature, and starts it. It
// never runs with an operation in progress, and no operation starts while
// it installs. Its status lives in memory: nothing about it is persisted
// except the notification of a new version.
package appupdate

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"strings"
	"sync"
	"time"

	"modorchestrator/internal/core/application/instancelock"
	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/application/settings"
	domain "modorchestrator/internal/core/domain/appupdate"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
)

// Settings read by the service (core/13).
const (
	SettingCheck   = "app.updateCheck"
	SettingChannel = "app.updateChannel"
)

// EventChanged signals that the status changed (check finished, download
// progress); the UI reads Status again (D021).
const EventChanged event.Type = "app_update.changed"

// Holder is the lock holder reported to operations refused while the
// update installs.
const Holder = "app_update"

// Error codes (core/00 §6).
const (
	CodeDisabled         = "update_check_disabled"
	CodeCheckFailed      = "update_check_failed"
	CodeNoUpdate         = "update_not_available"
	CodeDownloadFailed   = "update_download_failed"
	CodeChecksumMissing  = "update_checksum_missing"
	CodeChecksumMismatch = "update_checksum_mismatch"
	CodeLaunchFailed     = "update_launch_failed"
	CodeInProgress       = "update_in_progress"
)

const (
	// Limits of what is downloaded: the checksums file is a few lines; the
	// installer is about 15 MB today.
	checksumsLimit = 64 << 10
	installerLimit = 512 << 20
	// checkInterval spaces the automatic checks while the app stays open.
	checkInterval = 24 * time.Hour
	// progressStep throttles progress signals.
	progressStep = 512 << 10
)

// Error is a failure with a stable code and parameters (D053).
type Error struct {
	code   string
	params map[string]string
	cause  error
}

func (e *Error) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("appupdate: %s: %v", e.code, e.cause)
	}
	return "appupdate: " + e.code
}
func (e *Error) Unwrap() error             { return e.cause }
func (e *Error) Code() string              { return e.code }
func (e *Error) Params() map[string]string { return maps.Clone(e.params) }

func fail(code string, cause error, kv ...string) *Error {
	e := &Error{code: code, cause: cause, params: map[string]string{}}
	for i := 0; i+1 < len(kv); i += 2 {
		e.params[kv[i]] = kv[i+1]
	}
	return e
}

// SettingsReader reads app settings.
type SettingsReader interface {
	AppValue(ctx context.Context, key string) (settings.Effective, error)
}

// Notifier stores the notification of a new version (once per version).
type Notifier interface {
	NotifyUpdate(ctx context.Context, version string) error
}

// Deps are the collaborators of the service.
type Deps struct {
	Settings   SettingsReader
	Source     ports.ReleaseSource
	Downloader ports.Downloader
	Signatures ports.SignatureVerifier
	Launcher   ports.InstallerLauncher
	FS         ports.FileSystem
	Hasher     ports.Hasher
	Locks      *instancelock.Locks
	Notifier   Notifier
	Publisher  operations.Publisher
	IDs        operations.IDGenerator
	Clock      operations.Clock
	// Installed is the running version (bridge.Version); Executable the
	// running executable, whose signature sets the bar for the installer.
	Installed  string
	Executable string
	// Dir receives the downloads (<dataDir>/cache/updates).
	Dir string
}

// Note is the release notes of one version.
type Note struct {
	Version   string
	Published time.Time
	Text      string
}

// Offer is the version offered, with the notes of every newer version.
type Offer struct {
	Version   string
	Published time.Time
	Size      int64
	Notes     []Note
}

// Status is what Settings › Aplicação shows.
type Status struct {
	Enabled   bool
	Channel   string
	Installed string
	Checking  bool
	CheckedAt time.Time
	Offer     *Offer
	// CheckError is the failure of the last check.
	CheckError *Error
	// Installing is set from the download to the start of the installer;
	// Done/Total is the download progress (Total -1 when unknown).
	Installing  bool
	Done, Total int64
	// Launched: the installer started and the app is closing.
	Launched bool
}

// Service checks and installs updates.
type Service struct {
	d Deps

	mu      sync.Mutex
	status  Status
	release domain.Release
	lastLog int64
	stop    chan struct{}
	stopped sync.Once
}

// NewService creates the service.
func NewService(d Deps) *Service {
	return &Service{d: d, stop: make(chan struct{}), status: Status{Installed: d.Installed}}
}

// Status returns the current status with the settings read now.
func (s *Service) Status(ctx context.Context) (Status, error) {
	enabled, channel, err := s.settings(ctx)
	if err != nil {
		return Status{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	st := s.status
	st.Enabled, st.Channel = enabled, string(channel)
	if st.Offer != nil {
		o := *st.Offer
		o.Notes = append([]Note(nil), o.Notes...)
		st.Offer = &o
	}
	return st, nil
}

func (s *Service) settings(ctx context.Context) (bool, domain.Channel, error) {
	on, err := s.d.Settings.AppValue(ctx, SettingCheck)
	if err != nil {
		return false, "", err
	}
	c, err := s.d.Settings.AppValue(ctx, SettingChannel)
	if err != nil {
		return false, "", err
	}
	ch := c.Value
	if ch != string(domain.ChannelBeta) {
		ch = string(domain.ChannelStable)
	}
	return on.Value == "true", domain.Channel(ch), nil
}

// Check asks the release source for a newer version (Settings › "Verificar
// agora", and the automatic check). It refuses when app.updateCheck is off:
// nothing goes to the network without the setting.
func (s *Service) Check(ctx context.Context) (Status, error) {
	enabled, channel, err := s.settings(ctx)
	if err != nil {
		return Status{}, err
	}
	if !enabled {
		return Status{}, fail(CodeDisabled, nil)
	}
	s.mu.Lock()
	if s.status.Installing || s.status.Checking {
		s.mu.Unlock()
		return s.Status(ctx)
	}
	s.status.Checking = true
	s.mu.Unlock()
	s.signal()

	installed, ok := domain.ParseVersion(s.d.Installed)
	if !ok {
		installed = domain.Version{} // unknown build: any release is newer
	}
	releases, err := s.d.Source.Releases(ctx)
	offer, found := domain.Select(installed, channel, releases)

	s.mu.Lock()
	s.status.Checking = false
	s.status.CheckedAt = s.d.Clock.Now()
	if err != nil {
		s.status.CheckError = fail(CodeCheckFailed, err)
	} else {
		s.status.CheckError = nil
		s.status.Offer = nil
		s.release = domain.Release{}
		if found {
			s.status.Offer = toOffer(offer)
			s.release = offer.Release
		}
	}
	s.mu.Unlock()
	s.signal()
	if err == nil && found && s.d.Notifier != nil {
		// A notification that cannot be stored does not hide the offer:
		// Settings shows it anyway.
		_ = s.d.Notifier.NotifyUpdate(ctx, offer.Version.String())
	}
	return s.Status(ctx)
}

func toOffer(o domain.Offer) *Offer {
	out := &Offer{Version: o.Version.String(), Published: o.Release.Published}
	if a, ok := o.Release.Asset(domain.InstallerAsset); ok {
		out.Size = a.Size
	}
	for _, r := range o.Newer {
		v, _ := domain.ParseVersion(r.Tag)
		out.Notes = append(out.Notes, Note{Version: v.String(), Published: r.Published, Text: strings.TrimSpace(r.Notes)})
	}
	return out
}

// RunPeriodic checks at start and then every day while the app is open,
// only while app.updateCheck is on. Failures stay in the status (Settings
// shows them); nothing else reports them.
func (s *Service) RunPeriodic(ctx context.Context) {
	t := time.NewTicker(checkInterval)
	defer t.Stop()
	for {
		if on, _, err := s.settings(ctx); err == nil && on {
			_, _ = s.Check(ctx)
		}
		select {
		case <-s.stop:
			return
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// Close stops RunPeriodic.
func (s *Service) Close() { s.stopped.Do(func() { close(s.stop) }) }

// Install downloads the offered version, checks it and starts the
// installer. version must be the one the user saw (the offer of the last
// check). On success the caller closes the app; the instances stay frozen
// until then so no operation starts in between.
func (s *Service) Install(ctx context.Context, version string) (err error) {
	enabled, _, err := s.settings(ctx)
	if err != nil {
		return err
	}
	if !enabled {
		return fail(CodeDisabled, nil)
	}
	s.mu.Lock()
	if s.status.Installing || s.status.Launched {
		s.mu.Unlock()
		return fail(CodeInProgress, nil)
	}
	if s.status.Offer == nil || s.status.Offer.Version != version {
		s.mu.Unlock()
		return fail(CodeNoUpdate, nil, "version", version)
	}
	release := s.release
	s.mu.Unlock()

	// Never with an operation in progress; nothing starts while it runs.
	unfreeze, err := s.d.Locks.Freeze(Holder)
	if err != nil {
		return err
	}
	s.setInstalling(true, 0, -1)
	defer func() {
		if err != nil {
			unfreeze()
			s.setInstalling(false, 0, 0)
		}
	}()

	sumsAsset, _ := release.Asset(domain.ChecksumsAsset)
	data, err := s.d.Downloader.Fetch(ctx, sumsAsset.URL, checksumsLimit)
	if err != nil {
		return fail(CodeDownloadFailed, err, "file", domain.ChecksumsAsset)
	}
	sums, err := domain.ParseChecksums(data)
	if err != nil {
		return fail(CodeChecksumMissing, err)
	}
	want, ok := sums[domain.InstallerAsset]
	if !ok {
		return fail(CodeChecksumMissing, nil)
	}

	dir := game.JoinPath(s.d.Dir, version)
	_ = s.d.FS.RemoveAll(ctx, s.d.Dir) // earlier downloads are never reused
	if err := s.d.FS.MkdirAll(ctx, dir); err != nil {
		return fail(CodeDownloadFailed, err, "file", domain.InstallerAsset)
	}
	path := game.JoinPath(dir, domain.InstallerAsset)
	asset, _ := release.Asset(domain.InstallerAsset)
	if err := s.d.Downloader.Download(ctx, asset.URL, path, installerLimit, s.progress); err != nil {
		_ = s.d.FS.Remove(ctx, path)
		return fail(CodeDownloadFailed, err, "file", domain.InstallerAsset)
	}
	got, err := s.hash(ctx, path)
	if err != nil {
		return fail(CodeDownloadFailed, err, "file", domain.InstallerAsset)
	}
	if got != want {
		_ = s.d.FS.Remove(ctx, path)
		return fail(CodeChecksumMismatch, nil, "expected", want, "actual", got)
	}
	sig, err := s.d.Signatures.Verify(ctx, path)
	if err != nil {
		sig = domain.SignatureInvalid
	}
	running := domain.SignatureMissing
	if s.d.Executable != "" {
		if r, rerr := s.d.Signatures.Verify(ctx, s.d.Executable); rerr == nil {
			running = r
		}
	}
	if code := domain.Trust(sig, running); code != "" {
		_ = s.d.FS.Remove(ctx, path)
		return fail(code, nil)
	}
	if err := s.d.Launcher.Start(path); err != nil {
		return fail(CodeLaunchFailed, err)
	}
	s.mu.Lock()
	s.status.Installing, s.status.Launched = false, true
	s.mu.Unlock()
	s.signal()
	return nil
}

func (s *Service) hash(ctx context.Context, path string) (string, error) {
	f, err := s.d.FS.Open(ctx, path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	return s.d.Hasher.Hash(ctx, f)
}

func (s *Service) setInstalling(on bool, done, total int64) {
	s.mu.Lock()
	s.status.Installing, s.status.Done, s.status.Total = on, done, total
	s.lastLog = 0
	s.mu.Unlock()
	s.signal()
}

func (s *Service) progress(done, total int64) {
	s.mu.Lock()
	s.status.Done, s.status.Total = done, total
	emit := done-s.lastLog >= progressStep || done == total
	if emit {
		s.lastLog = done
	}
	s.mu.Unlock()
	if emit {
		s.signal()
	}
}

func (s *Service) signal() {
	if s.d.Publisher == nil {
		return
	}
	s.d.Publisher.Publish(event.Event{ID: s.d.IDs.NewID(), Type: EventChanged, OccurredAt: s.d.Clock.Now()})
}

// IsCode reports whether err carries code.
func IsCode(err error, code string) bool {
	var e *Error
	return errors.As(err, &e) && e.code == code
}
