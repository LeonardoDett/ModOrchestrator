package ports

import (
	"context"

	"modorchestrator/internal/core/domain/appupdate"
)

// ReleaseSource lists the published releases of the app (the GitHub
// releases API). It is the only network access of V1, used only when
// app.updateCheck is on (00-visao-e-escopo, D104).
type ReleaseSource interface {
	Releases(ctx context.Context) ([]appupdate.Release, error)
}

// Downloader fetches release assets. Fetch reads a small asset into memory;
// Download writes one to dest, refusing more than limit bytes and reporting
// progress (total is -1 when unknown).
type Downloader interface {
	Fetch(ctx context.Context, url string, limit int64) ([]byte, error)
	Download(ctx context.Context, url, dest string, limit int64, progress func(done, total int64)) error
}

// SignatureVerifier checks the Authenticode signature of an executable.
type SignatureVerifier interface {
	Verify(ctx context.Context, path string) (appupdate.Signature, error)
}

// InstallerLauncher starts the downloaded installer as a separate process;
// the app closes itself right after.
type InstallerLauncher interface {
	Start(path string) error
}
