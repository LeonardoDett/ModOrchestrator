package updates

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"modorchestrator/internal/core/domain/appupdate"
)

func testClient(t *testing.T, mux *http.ServeMux) (*Client, *httptest.Server) {
	t.Helper()
	srv := httptest.NewTLSServer(mux)
	t.Cleanup(srv.Close)
	u, _ := url.Parse(srv.URL)
	c := NewClient("1.0.0")
	c.HTTP.Transport = srv.Client().Transport
	c.Hosts = []string{u.Hostname()}
	c.API = srv.URL + "/releases"
	return c, srv
}

func TestReleasesAndDownload(t *testing.T) {
	mux := http.NewServeMux()
	var agent string
	var srvURL string
	mux.HandleFunc("/releases", func(w http.ResponseWriter, r *http.Request) {
		agent = r.Header.Get("User-Agent")
		fmt.Fprintf(w, `[{"tag_name":"v1.1.0","body":"notes","prerelease":false,"draft":false,"published_at":"2026-10-09T12:00:00Z",
		  "assets":[{"name":"SHA256SUMS","browser_download_url":"%[1]s/a/SHA256SUMS","size":10},
		            {"name":"ModOrchestrator-amd64-installer.exe","browser_download_url":"%[1]s/redirect","size":5}]}]`, srvURL)
	})
	mux.HandleFunc("/redirect", func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, "/a/installer", http.StatusFound) })
	mux.HandleFunc("/a/installer", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("hello")) })
	mux.HandleFunc("/a/big", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte(strings.Repeat("x", 100))) })
	c, srv := testClient(t, mux)
	srvURL = srv.URL
	ctx := context.Background()

	rels, err := c.Releases(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if agent != "ModOrchestrator/1.0.0" || len(rels) != 1 || rels[0].Tag != "v1.1.0" || len(rels[0].Assets) != 2 || rels[0].Published.IsZero() {
		t.Fatalf("releases = %+v (agent %q)", rels, agent)
	}
	a, _ := rels[0].Asset(appupdate.InstallerAsset)

	dest := filepath.Join(t.TempDir(), "installer.exe")
	var last int64
	if err := c.Download(ctx, a.URL, dest, 1<<20, func(done, _ int64) { last = done }); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(dest); string(data) != "hello" || last != 5 {
		t.Fatalf("downloaded %q, progress %d", data, last)
	}
	if _, err := os.Stat(dest + ".part"); !os.IsNotExist(err) {
		t.Error("partial file left behind")
	}

	if _, err := c.Fetch(ctx, srv.URL+"/a/big", 10); !errors.Is(err, ErrTooLarge) {
		t.Errorf("fetch over limit = %v", err)
	}
	big := filepath.Join(t.TempDir(), "big")
	if err := c.Download(ctx, srv.URL+"/a/big", big, 10, nil); !errors.Is(err, ErrTooLarge) {
		t.Errorf("download over limit = %v", err)
	}
	if _, err := os.Stat(big); !os.IsNotExist(err) {
		t.Error("refused download left a file")
	}
}

func TestOnlyHTTPSToAllowedHosts(t *testing.T) {
	c := NewClient("1.0.0")
	for _, raw := range []string{"http://github.com/x", "https://example.com/x", "https://github.com.evil.example/x", "file:///C:/x"} {
		if _, err := c.Fetch(context.Background(), raw, 10); err == nil || !strings.Contains(err.Error(), "refusing") {
			t.Errorf("%s: %v", raw, err)
		}
	}
	// A redirect leaving the allowed hosts is refused too.
	mux := http.NewServeMux()
	mux.HandleFunc("/r", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "https://example.com/payload", http.StatusFound)
	})
	tc, srv := testClient(t, mux)
	if _, err := tc.Fetch(context.Background(), srv.URL+"/r", 10); err == nil || !strings.Contains(err.Error(), "refusing host example.com") {
		t.Errorf("redirect to another host = %v", err)
	}
}

func TestSignatures(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Authenticode is Windows only")
	}
	ctx := context.Background()
	unsigned := filepath.Join(t.TempDir(), "unsigned.exe")
	self, _ := os.Executable()
	data, err := os.ReadFile(self) // test binaries are never signed
	if err != nil {
		t.Fatal(err)
	}
	os.WriteFile(unsigned, data, 0o755)
	if s, err := (Signatures{}).Verify(ctx, unsigned); err != nil || s != appupdate.SignatureMissing {
		t.Errorf("unsigned = %s %v", s, err)
	}
	for _, signed := range []string{`C:\Program Files\nodejs\node.exe`, `C:\Program Files\GitHub CLI\gh.exe`, `C:\Program Files\Git\cmd\git.exe`} {
		data, err := os.ReadFile(signed)
		if err != nil {
			continue
		}
		if s, _ := (Signatures{}).Verify(ctx, signed); s != appupdate.SignatureValid {
			t.Skipf("%s did not verify here (%s; revocation needs the network)", signed, s)
		}
		tampered := filepath.Join(t.TempDir(), "tampered.exe")
		data[len(data)/2]++
		os.WriteFile(tampered, data, 0o755)
		if s, _ := (Signatures{}).Verify(ctx, tampered); s != appupdate.SignatureInvalid {
			t.Errorf("tampered copy of %s = %s", signed, s)
		}
		return
	}
	t.Log("no embedded-signed executable found; only the unsigned case ran")
}
