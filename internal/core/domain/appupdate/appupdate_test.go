package appupdate

import (
	"testing"
)

func mustVersion(t *testing.T, s string) Version {
	t.Helper()
	v, ok := ParseVersion(s)
	if !ok {
		t.Fatalf("ParseVersion(%q) failed", s)
	}
	return v
}

func TestParseVersion(t *testing.T) {
	for _, s := range []string{"1.0.0", "v1.0.0", "0.0.0-dev", "1.2.3-beta.1", "1.0.0+build.5", "10.20.30"} {
		if _, ok := ParseVersion(s); !ok {
			t.Errorf("%q should parse", s)
		}
	}
	for _, s := range []string{"", "1.0", "1.0.0.0", "a.b.c", "1.0.0-", "01.0.0", "1.0.0-beta..1", "-1.0.0"} {
		if _, ok := ParseVersion(s); ok {
			t.Errorf("%q should not parse", s)
		}
	}
	if got := mustVersion(t, "v1.2.3-beta.4").String(); got != "1.2.3-beta.4" {
		t.Errorf("String = %q", got)
	}
}

func TestCompareFollowsSemverPrecedence(t *testing.T) {
	// semver.org §11 example, ascending.
	order := []string{"0.0.0-dev", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.1", "1.1.0", "2.0.0"}
	for i := range order {
		for j := range order {
			a, b := mustVersion(t, order[i]), mustVersion(t, order[j])
			want := cmpInt(i, j)
			if got := a.Compare(b); got != want {
				t.Errorf("Compare(%s, %s) = %d, want %d", order[i], order[j], got, want)
			}
		}
	}
}

func rel(tag string, pre bool, assets ...string) Release {
	r := Release{Tag: tag, Prerelease: pre, Notes: "notes " + tag}
	for _, a := range assets {
		r.Assets = append(r.Assets, Asset{Name: a, URL: "https://example.invalid/" + tag + "/" + a})
	}
	return r
}

func TestSelect(t *testing.T) {
	full := []string{InstallerAsset, ChecksumsAsset}
	releases := []Release{
		rel("v1.0.0", false, full...),
		rel("v1.1.0-beta.1", true, full...),
		rel("v1.0.1", false, full...),
		rel("v1.0.2", false, InstallerAsset), // no checksums: never offered
		{Tag: "v9.0.0", Draft: true},         // draft
		rel("nightly", false, full...),       // not a version
		rel("v1.0.3-rc.1", false, full...),   // prerelease by version, not flagged
	}
	installed := mustVersion(t, "1.0.0")

	o, ok := Select(installed, ChannelStable, releases)
	if !ok || o.Version.String() != "1.0.1" {
		t.Fatalf("stable offer = %v %v, want 1.0.1", o.Version, ok)
	}
	if len(o.Newer) != 1 {
		t.Errorf("stable newer = %d releases", len(o.Newer))
	}

	o, ok = Select(installed, ChannelBeta, releases)
	if !ok || o.Version.String() != "1.1.0-beta.1" {
		t.Fatalf("beta offer = %v %v, want 1.1.0-beta.1", o.Version, ok)
	}
	// Notes newest first: 1.1.0-beta.1, 1.0.3-rc.1, 1.0.1.
	var tags []string
	for _, r := range o.Newer {
		tags = append(tags, r.Tag)
	}
	if len(tags) != 3 || tags[0] != "v1.1.0-beta.1" || tags[1] != "v1.0.3-rc.1" || tags[2] != "v1.0.1" {
		t.Errorf("beta newer = %v", tags)
	}

	if _, ok := Select(mustVersion(t, "1.1.0"), ChannelBeta, releases); ok {
		t.Error("nothing newer than 1.1.0 should be offered")
	}
	// A beta user on 1.1.0-beta.1 is offered the stable 1.1.0 on either channel.
	releases = append(releases, rel("v1.1.0", false, full...))
	for _, ch := range []Channel{ChannelStable, ChannelBeta} {
		if o, ok := Select(mustVersion(t, "1.1.0-beta.1"), ch, releases); !ok || o.Version.String() != "1.1.0" {
			t.Errorf("%s: offer = %v %v, want 1.1.0", ch, o.Version, ok)
		}
	}
}

func TestParseChecksums(t *testing.T) {
	h1 := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	h2 := "FEDCBA9876543210FEDCBA9876543210FEDCBA9876543210FEDCBA9876543210"
	data := []byte(h1 + "  " + InstallerAsset + "\r\n" + h2 + " *ModOrchestrator-portable.zip\n\n# comment\n")
	sums, err := ParseChecksums(data)
	if err != nil {
		t.Fatal(err)
	}
	if sums[InstallerAsset] != h1 || sums["ModOrchestrator-portable.zip"] != "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210" {
		t.Errorf("sums = %v", sums)
	}
	for _, bad := range []string{"xyz  file", h1, h1[:63] + "  file", h1 + "  a\n" + h2 + "  a"} {
		if _, err := ParseChecksums([]byte(bad)); err == nil {
			t.Errorf("%q should fail", bad)
		}
	}
}

func TestTrust(t *testing.T) {
	cases := []struct {
		installer, running Signature
		want               string
	}{
		{SignatureValid, SignatureValid, ""},
		{SignatureValid, SignatureMissing, ""},
		{SignatureMissing, SignatureMissing, ""},
		{SignatureMissing, SignatureValid, "update_signature_missing"},
		{SignatureInvalid, SignatureMissing, "update_signature_invalid"},
		{SignatureInvalid, SignatureValid, "update_signature_invalid"},
	}
	for _, c := range cases {
		if got := Trust(c.installer, c.running); got != c.want {
			t.Errorf("Trust(%s, %s) = %q, want %q", c.installer, c.running, got, c.want)
		}
	}
}
