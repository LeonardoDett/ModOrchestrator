package appupdate

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"testing"
	"time"

	"modorchestrator/internal/core/application/instancelock"
	"modorchestrator/internal/core/application/settings"
	domain "modorchestrator/internal/core/domain/appupdate"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/testutil/memfs"
)

type fakeSettings map[string]string

func (f fakeSettings) AppValue(_ context.Context, key string) (settings.Effective, error) {
	return settings.Effective{Value: f[key]}, nil
}

type fakeSource struct {
	releases []domain.Release
	err      error
	calls    int
}

func (f *fakeSource) Releases(context.Context) ([]domain.Release, error) {
	f.calls++
	return f.releases, f.err
}

// fakeDownloader serves files by URL into the memory filesystem.
type fakeDownloader struct {
	fs    *memfs.FS
	files map[string]string
}

func (f *fakeDownloader) Fetch(_ context.Context, url string, _ int64) ([]byte, error) {
	data, ok := f.files[url]
	if !ok {
		return nil, errors.New("404")
	}
	return []byte(data), nil
}

func (f *fakeDownloader) Download(_ context.Context, url, dest string, _ int64, progress func(done, total int64)) error {
	data, ok := f.files[url]
	if !ok {
		return errors.New("404")
	}
	f.fs.AddFile(dest, data)
	progress(int64(len(data)), int64(len(data)))
	return nil
}

type fakeSignatures map[string]domain.Signature

func (f fakeSignatures) Verify(_ context.Context, path string) (domain.Signature, error) {
	if s, ok := f[path]; ok {
		return s, nil
	}
	return domain.SignatureMissing, nil
}

type fakeLauncher struct{ started []string }

func (f *fakeLauncher) Start(path string) error { f.started = append(f.started, path); return nil }

type sha struct{}

func (sha) Hash(_ context.Context, r io.Reader) (string, error) {
	h := sha256.New()
	if _, err := io.Copy(h, r); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

type fakeNotifier struct{ versions []string }

func (f *fakeNotifier) NotifyUpdate(_ context.Context, v string) error {
	f.versions = append(f.versions, v)
	return nil
}

type nopPublisher struct{ n int }

func (p *nopPublisher) Publish(...event.Event) { p.n++ }

type ids struct{ n int }

func (i *ids) NewID() string { i.n++; return "id" }

type clock struct{}

func (clock) Now() time.Time { return time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC) }

const installerData = "MZ installer bytes"

func sum(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

type fixture struct {
	svc      *Service
	set      fakeSettings
	src      *fakeSource
	dl       *fakeDownloader
	sig      fakeSignatures
	launch   *fakeLauncher
	notifier *fakeNotifier
	locks    *instancelock.Locks
	fs       *memfs.FS
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	fs := memfs.New(`C:`)
	fs.AddDir(`C:\data\cache`)
	f := &fixture{
		set:      fakeSettings{SettingCheck: "true", SettingChannel: "stable"},
		src:      &fakeSource{},
		dl:       &fakeDownloader{fs: fs, files: map[string]string{}},
		sig:      fakeSignatures{},
		launch:   &fakeLauncher{},
		notifier: &fakeNotifier{},
		locks:    instancelock.New(),
		fs:       fs,
	}
	f.src.releases = []domain.Release{f.release("v1.0.0", false), f.release("v1.1.0", false), f.release("v1.2.0-beta.1", true)}
	f.svc = NewService(Deps{
		Settings: f.set, Source: f.src, Downloader: f.dl, Signatures: f.sig, Launcher: f.launch,
		FS: fs, Hasher: sha{}, Locks: f.locks, Notifier: f.notifier, Publisher: &nopPublisher{}, IDs: &ids{}, Clock: clock{},
		Installed: "1.0.0", Executable: `C:\app\ModOrchestrator.exe`, Dir: `C:\data\cache\updates`,
	})
	return f
}

func (f *fixture) release(tag string, pre bool) domain.Release {
	base := "https://github.com/o/r/releases/download/" + tag + "/"
	f.dl.files[base+domain.InstallerAsset] = installerData
	f.dl.files[base+domain.ChecksumsAsset] = sum(installerData) + "  " + domain.InstallerAsset + "\n"
	return domain.Release{Tag: tag, Prerelease: pre, Notes: "## " + tag, Assets: []domain.Asset{
		{Name: domain.InstallerAsset, URL: base + domain.InstallerAsset, Size: int64(len(installerData))},
		{Name: domain.ChecksumsAsset, URL: base + domain.ChecksumsAsset},
	}}
}

func TestNothingGoesToTheNetworkWithTheSettingOff(t *testing.T) {
	f := newFixture(t)
	f.set[SettingCheck] = "false"
	if _, err := f.svc.Check(context.Background()); !IsCode(err, CodeDisabled) {
		t.Fatalf("check = %v", err)
	}
	f.svc.Close()
	f.svc.RunPeriodic(context.Background()) // returns at once: stopped
	if f.src.calls != 0 {
		t.Fatalf("source called %d times with the setting off", f.src.calls)
	}
}

func TestCheckOffersTheChannelVersionAndNotifiesOnce(t *testing.T) {
	f := newFixture(t)
	st, err := f.svc.Check(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if st.Offer == nil || st.Offer.Version != "1.1.0" || len(st.Offer.Notes) != 1 || st.Offer.Notes[0].Text != "## v1.1.0" {
		t.Fatalf("offer = %+v", st.Offer)
	}
	f.set[SettingChannel] = "beta"
	st, _ = f.svc.Check(context.Background())
	if st.Offer == nil || st.Offer.Version != "1.2.0-beta.1" || len(st.Offer.Notes) != 2 {
		t.Fatalf("beta offer = %+v", st.Offer)
	}
	if len(f.notifier.versions) != 2 {
		t.Errorf("notified %v", f.notifier.versions)
	}
	f.src.err = errors.New("offline")
	st, _ = f.svc.Check(context.Background())
	if st.CheckError == nil || st.CheckError.Code() != CodeCheckFailed || st.Offer == nil {
		t.Fatalf("failed check must keep the last offer and report: %+v", st)
	}
}

func TestInstallVerifiesAndStartsTheInstaller(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	if err := f.svc.Install(ctx, "1.1.0"); !IsCode(err, CodeNoUpdate) {
		t.Fatalf("install before a check = %v", err)
	}
	if _, err := f.svc.Check(ctx); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.Install(ctx, "1.1.0"); err != nil {
		t.Fatal(err)
	}
	if len(f.launch.started) != 1 || f.launch.started[0] != `C:\data\cache\updates\1.1.0\`+domain.InstallerAsset {
		t.Fatalf("started %v", f.launch.started)
	}
	st, _ := f.svc.Status(ctx)
	if !st.Launched || st.Installing {
		t.Fatalf("status = %+v", st)
	}
	// The app is closing: no operation may start.
	var busy *instancelock.BusyError
	if _, err := f.locks.Acquire("i1", "deploy"); !errors.As(err, &busy) || busy.Holder != Holder {
		t.Fatalf("acquire after launch = %v", err)
	}
}

func TestInstallRefusedWithAnOperationRunning(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	_, _ = f.svc.Check(ctx)
	release, _ := f.locks.Acquire("i1", "import")
	var busy *instancelock.BusyError
	if err := f.svc.Install(ctx, "1.1.0"); !errors.As(err, &busy) {
		t.Fatalf("install during an import = %v", err)
	}
	release()
	if len(f.launch.started) != 0 {
		t.Fatal("installer started")
	}
}

func TestInstallRefusesWhatDoesNotMatch(t *testing.T) {
	cases := []struct {
		name  string
		setup func(f *fixture, base string)
		code  string
	}{
		{"checksum differs", func(f *fixture, base string) { f.dl.files[base+domain.InstallerAsset] = "tampered" }, CodeChecksumMismatch},
		{"checksum not listed", func(f *fixture, base string) { f.dl.files[base+domain.ChecksumsAsset] = "" }, CodeChecksumMissing},
		{"checksums unreadable", func(f *fixture, base string) { f.dl.files[base+domain.ChecksumsAsset] = "garbage" }, CodeChecksumMissing},
		{"download fails", func(f *fixture, base string) { delete(f.dl.files, base+domain.InstallerAsset) }, CodeDownloadFailed},
		{"invalid signature", func(f *fixture, _ string) {
			f.sig[`C:\data\cache\updates\1.1.0\`+domain.InstallerAsset] = domain.SignatureInvalid
		}, "update_signature_invalid"},
		{"signed app, unsigned installer", func(f *fixture, _ string) { f.sig[`C:\app\ModOrchestrator.exe`] = domain.SignatureValid }, "update_signature_missing"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := newFixture(t)
			ctx := context.Background()
			_, _ = f.svc.Check(ctx)
			c.setup(f, "https://github.com/o/r/releases/download/v1.1.0/")
			err := f.svc.Install(ctx, "1.1.0")
			if !IsCode(err, c.code) {
				t.Fatalf("install = %v, want %s", err, c.code)
			}
			if len(f.launch.started) != 0 {
				t.Fatal("installer started")
			}
			if f.fs.Exists(`C:\data\cache\updates\1.1.0\` + domain.InstallerAsset) {
				t.Error("a refused installer stays on disk")
			}
			// Refused: operations run again and a new attempt is possible.
			if _, err := f.locks.Acquire("i1", "deploy"); err != nil {
				t.Fatalf("still frozen: %v", err)
			}
			if st, _ := f.svc.Status(ctx); st.Installing {
				t.Fatal("still installing")
			}
		})
	}
}
