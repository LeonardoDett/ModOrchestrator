// Package appupdate holds the pure rules of the opt-in application update
// (plano-de-publicacao.md, etapa 6; D077 item 7; D104): which published
// release is offered for the installed version and channel, and how the
// SHA256SUMS of a release is read. Fetching, downloading, hashing and
// starting the installer are ports of the application service.
package appupdate

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"
)

// Channel is app.updateChannel (core/13).
type Channel string

const (
	ChannelStable Channel = "stable"
	ChannelBeta   Channel = "beta"
)

// Names of the release assets the update uses. The release pipeline
// publishes them with exactly these names (plano-de-publicacao.md, etapa 3).
const (
	InstallerAsset = "ModOrchestrator-amd64-installer.exe"
	ChecksumsAsset = "SHA256SUMS"
)

// Version is a semantic version ("1.0.0", "1.1.0-beta.2"); a leading "v"
// of the tag is accepted.
type Version struct {
	Major, Minor, Patch int
	// Pre are the dot-separated prerelease identifiers ("beta", "2").
	Pre []string
}

// ParseVersion reads "v1.2.3" or "1.2.3-beta.1". Build metadata ("+...")
// is ignored, as in semver precedence.
func ParseVersion(s string) (Version, bool) {
	s = strings.TrimPrefix(strings.TrimSpace(s), "v")
	if i := strings.IndexByte(s, '+'); i >= 0 {
		s = s[:i]
	}
	core, pre, hasPre := strings.Cut(s, "-")
	parts := strings.Split(core, ".")
	if len(parts) != 3 {
		return Version{}, false
	}
	var nums [3]int
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 || p == "" || (len(p) > 1 && p[0] == '0') {
			return Version{}, false
		}
		nums[i] = n
	}
	v := Version{Major: nums[0], Minor: nums[1], Patch: nums[2]}
	if hasPre {
		if pre == "" {
			return Version{}, false
		}
		v.Pre = strings.Split(pre, ".")
		for _, id := range v.Pre {
			if id == "" {
				return Version{}, false
			}
		}
	}
	return v, true
}

func (v Version) String() string {
	s := fmt.Sprintf("%d.%d.%d", v.Major, v.Minor, v.Patch)
	if len(v.Pre) > 0 {
		s += "-" + strings.Join(v.Pre, ".")
	}
	return s
}

// Prerelease reports a version with prerelease identifiers.
func (v Version) Prerelease() bool { return len(v.Pre) > 0 }

// Compare orders by semver precedence: -1, 0 or +1.
func (v Version) Compare(o Version) int {
	for _, d := range [][2]int{{v.Major, o.Major}, {v.Minor, o.Minor}, {v.Patch, o.Patch}} {
		if d[0] != d[1] {
			return cmpInt(d[0], d[1])
		}
	}
	switch {
	case len(v.Pre) == 0 && len(o.Pre) == 0:
		return 0
	case len(v.Pre) == 0:
		return 1 // 1.0.0 > 1.0.0-beta
	case len(o.Pre) == 0:
		return -1
	}
	for i := 0; i < len(v.Pre) && i < len(o.Pre); i++ {
		a, b := v.Pre[i], o.Pre[i]
		an, aNum := numeric(a)
		bn, bNum := numeric(b)
		switch {
		case aNum && bNum:
			if an != bn {
				return cmpInt(an, bn)
			}
		case aNum:
			return -1 // numeric identifiers sort before alphanumeric ones
		case bNum:
			return 1
		default:
			if c := strings.Compare(a, b); c != 0 {
				return c
			}
		}
	}
	return cmpInt(len(v.Pre), len(o.Pre))
}

func numeric(s string) (int, bool) {
	n, err := strconv.Atoi(s)
	return n, err == nil && n >= 0
}

func cmpInt(a, b int) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	}
	return 0
}

// Asset is a file attached to a release.
type Asset struct {
	Name string
	URL  string
	Size int64
}

// Release is a published release of the app.
type Release struct {
	Tag        string
	Notes      string
	Prerelease bool
	Draft      bool
	Published  time.Time
	Assets     []Asset
}

// Asset returns the asset with that name.
func (r Release) Asset(name string) (Asset, bool) {
	for _, a := range r.Assets {
		if a.Name == name {
			return a, true
		}
	}
	return Asset{}, false
}

// Offer is what the update proposes: the newest eligible release and the
// notes of every eligible release newer than the installed one, newest
// first (the notes are shown before installing).
type Offer struct {
	Version Version
	Release Release
	Newer   []Release
}

// Select returns the release to offer for the installed version and
// channel. Drafts, releases without the installer or the checksums, tags
// that are not versions and, on the stable channel, prereleases (by flag
// or by version) are never offered.
func Select(installed Version, ch Channel, releases []Release) (Offer, bool) {
	type cand struct {
		v Version
		r Release
	}
	var cands []cand
	for _, r := range releases {
		v, ok := ParseVersion(r.Tag)
		if !ok || r.Draft || v.Compare(installed) <= 0 {
			continue
		}
		if ch != ChannelBeta && (r.Prerelease || v.Prerelease()) {
			continue
		}
		if _, ok := r.Asset(InstallerAsset); !ok {
			continue
		}
		if _, ok := r.Asset(ChecksumsAsset); !ok {
			continue
		}
		cands = append(cands, cand{v, r})
	}
	if len(cands) == 0 {
		return Offer{}, false
	}
	slices.SortStableFunc(cands, func(a, b cand) int { return b.v.Compare(a.v) })
	o := Offer{Version: cands[0].v, Release: cands[0].r}
	for _, c := range cands {
		o.Newer = append(o.Newer, c.r)
	}
	return o, true
}

// ErrChecksums reports a SHA256SUMS that cannot be read.
var ErrChecksums = errors.New("appupdate: malformed SHA256SUMS")

// ParseChecksums reads the output of sha256sum ("<hex>  <name>" or
// "<hex> *<name>", one per line) into name -> lowercase hex.
func ParseChecksums(data []byte) (map[string]string, error) {
	out := map[string]string{}
	sc := bufio.NewScanner(bytes.NewReader(data))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		hash, name, ok := strings.Cut(line, " ")
		name = strings.TrimPrefix(strings.TrimLeft(name, " "), "*")
		hash = strings.ToLower(hash)
		if !ok || name == "" || !isSHA256(hash) {
			return nil, fmt.Errorf("%w: %q", ErrChecksums, line)
		}
		if prev, dup := out[name]; dup && prev != hash {
			return nil, fmt.Errorf("%w: %s listed twice", ErrChecksums, name)
		}
		out[name] = hash
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrChecksums, err)
	}
	return out, nil
}

func isSHA256(s string) bool {
	if len(s) != 64 {
		return false
	}
	for _, c := range s {
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}

// Signature is what Authenticode says about a file.
type Signature string

const (
	SignatureValid   Signature = "valid"
	SignatureMissing Signature = "missing"
	SignatureInvalid Signature = "invalid"
)

// Trust decides whether a downloaded installer may run (D077 item 7,
// D104): a signature that is present must be valid, and once the running
// app is signed an unsigned installer is refused (no silent downgrade from
// signed to unsigned). It returns "" when the installer may run, or the
// error code otherwise.
func Trust(installer, running Signature) string {
	switch {
	case installer == SignatureInvalid:
		return "update_signature_invalid"
	case installer != SignatureValid && running == SignatureValid:
		return "update_signature_missing"
	}
	return ""
}
