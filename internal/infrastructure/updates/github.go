// Package updates implements the ports of the app update (D104): the
// GitHub releases of the project as the release source, an HTTPS
// downloader restricted to GitHub hosts, the Authenticode check and the
// start of the installer. It is the only code of V1 that uses the network.
package updates

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"modorchestrator/internal/core/domain/appupdate"
)

// Repository is the GitHub repository the releases come from ("owner/name").
// It can be overridden at build time with -ldflags (a fork publishing its
// own releases).
var Repository = "LeonardoDett/ModOrchestrator"

// allowedHosts are the only hosts the client talks to, redirects included:
// the API, the release download URL and the storage it redirects to.
var allowedHosts = []string{"api.github.com", "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"}

// Client talks HTTPS to GitHub only.
type Client struct {
	HTTP      *http.Client
	UserAgent string
	// API is the releases endpoint (tests point it elsewhere).
	API string
	// Hosts overrides allowedHosts (tests).
	Hosts []string
}

// NewClient returns the client for version (sent as the User-Agent, which
// the GitHub API requires).
func NewClient(version string) *Client {
	c := &Client{UserAgent: "ModOrchestrator/" + version, API: "https://api.github.com/repos/" + Repository + "/releases?per_page=30"}
	c.HTTP = &http.Client{
		Timeout: 30 * time.Minute, // the whole download; the API call has its own context
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("updates: too many redirects")
			}
			return c.allowed(req.URL)
		},
	}
	return c
}

func (c *Client) allowed(u *url.URL) error {
	hosts := c.Hosts
	if hosts == nil {
		hosts = allowedHosts
	}
	if u.Scheme != "https" {
		return fmt.Errorf("updates: refusing %s: not https", u.Redacted())
	}
	for _, h := range hosts {
		if strings.EqualFold(u.Hostname(), h) {
			return nil
		}
	}
	return fmt.Errorf("updates: refusing host %s", u.Hostname())
}

func (c *Client) get(ctx context.Context, raw string, accept string) (*http.Response, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, err
	}
	if err := c.allowed(u); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", c.UserAgent)
	if accept != "" {
		req.Header.Set("Accept", accept)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, fmt.Errorf("updates: %s: HTTP %d", u.Redacted(), resp.StatusCode)
	}
	return resp, nil
}

type ghRelease struct {
	TagName     string    `json:"tag_name"`
	Body        string    `json:"body"`
	Draft       bool      `json:"draft"`
	Prerelease  bool      `json:"prerelease"`
	PublishedAt time.Time `json:"published_at"`
	Assets      []struct {
		Name string `json:"name"`
		URL  string `json:"browser_download_url"`
		Size int64  `json:"size"`
	} `json:"assets"`
}

// Releases lists the published releases (ports.ReleaseSource).
func (c *Client) Releases(ctx context.Context) ([]appupdate.Release, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	resp, err := c.get(ctx, c.API, "application/vnd.github+json")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var list []ghRelease
	if err := json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(&list); err != nil {
		return nil, fmt.Errorf("updates: releases: %w", err)
	}
	out := make([]appupdate.Release, 0, len(list))
	for _, r := range list {
		rel := appupdate.Release{Tag: r.TagName, Notes: r.Body, Draft: r.Draft, Prerelease: r.Prerelease, Published: r.PublishedAt}
		for _, a := range r.Assets {
			rel.Assets = append(rel.Assets, appupdate.Asset{Name: a.Name, URL: a.URL, Size: a.Size})
		}
		out = append(out, rel)
	}
	return out, nil
}

// ErrTooLarge reports a download over its limit.
var ErrTooLarge = errors.New("updates: download larger than allowed")

// Fetch reads a small asset (ports.Downloader).
func (c *Client) Fetch(ctx context.Context, raw string, limit int64) ([]byte, error) {
	resp, err := c.get(ctx, raw, "application/octet-stream")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, ErrTooLarge
	}
	return data, nil
}

// Download writes an asset to dest through a ".part" file renamed at the
// end, so dest only ever holds a complete download (ports.Downloader).
func (c *Client) Download(ctx context.Context, raw, dest string, limit int64, progress func(done, total int64)) error {
	resp, err := c.get(ctx, raw, "application/octet-stream")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	total := resp.ContentLength
	if total > limit {
		return ErrTooLarge
	}
	part := dest + ".part"
	f, err := os.Create(part)
	if err != nil {
		return err
	}
	w := &progressWriter{w: f, total: total, report: progress, limit: limit}
	_, err = io.Copy(w, resp.Body)
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err == nil && total >= 0 && w.done != total {
		err = fmt.Errorf("updates: incomplete download (%d of %d bytes)", w.done, total)
	}
	if err != nil {
		os.Remove(part)
		return err
	}
	if err := os.Rename(part, dest); err != nil {
		os.Remove(part)
		return err
	}
	return nil
}

type progressWriter struct {
	w           io.Writer
	done, total int64
	limit       int64
	report      func(done, total int64)
}

func (p *progressWriter) Write(b []byte) (int, error) {
	if p.done+int64(len(b)) > p.limit {
		return 0, ErrTooLarge
	}
	n, err := p.w.Write(b)
	p.done += int64(n)
	if p.report != nil {
		p.report(p.done, p.total)
	}
	return n, err
}

// Launcher starts the installer (ports.InstallerLauncher). The installer
// is per user and asks for no elevation (D103).
type Launcher struct{}

// Start runs the installer from its folder and returns without waiting.
func (Launcher) Start(path string) error {
	cmd := newInstallerCommand(path)
	cmd.Dir = filepath.Dir(path)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("updates: start installer: %w", err)
	}
	return cmd.Process.Release()
}

// MasterlistFetcher downloads LOOT data files (ports.MasterlistFetcher,
// D141): the same client, limited to the host of raw repository files.
type MasterlistFetcher struct{ c *Client }

// NewMasterlistFetcher returns the fetcher for version (User-Agent).
func NewMasterlistFetcher(version string) MasterlistFetcher {
	c := NewClient(version)
	c.Hosts = []string{"raw.githubusercontent.com"}
	return MasterlistFetcher{c: c}
}

// Fetch reads one file of at most 32 MB.
func (f MasterlistFetcher) Fetch(ctx context.Context, raw string) ([]byte, error) {
	return f.c.Fetch(ctx, raw, 32<<20)
}
