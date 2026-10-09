package main

import "testing"

func TestChangelogSection(t *testing.T) {
	cl := "# Changelog\n\n## [1.1.0] - 2026-11-01\n\n### Added\n- B\n\n## [1.0.0] - 2026-10-20\n- A\n"
	if got, err := changelogSection(cl, "1.1.0"); err != nil || got != "### Added\n- B\n" {
		t.Errorf("1.1.0 = %q, %v", got, err)
	}
	if got, err := changelogSection(cl, "1.0.0"); err != nil || got != "- A\n" {
		t.Errorf("1.0.0 = %q, %v", got, err)
	}
	if _, err := changelogSection(cl, "1.0.1"); err == nil {
		t.Error("missing section must fail")
	}
	if _, err := changelogSection(cl, "1.1"); err == nil {
		t.Error("a prefix of another version must not match")
	}
}

func TestLicenseAllowed(t *testing.T) {
	for _, ok := range []string{"MIT", "(MIT OR Apache-2.0)", "BSD-3-Clause AND MIT", "MPL-2.0", "GPL-3.0-or-later", "(MIT OR GPL-2.0-only)"} {
		if !licenseAllowed(ok) {
			t.Errorf("%q should be allowed", ok)
		}
	}
	for _, bad := range []string{"", "unknown", "GPL-2.0-only", "SSPL-1.0", "CC-BY-NC-4.0", "MIT AND BUSL-1.1", "UNLICENSED"} {
		if licenseAllowed(bad) {
			t.Errorf("%q should be refused", bad)
		}
	}
}

func TestClassify(t *testing.T) {
	cases := map[string]string{
		"Permission is hereby granted, free of charge, to any person":               "MIT",
		"Apache License\n Version 2.0, January 2004":                                "Apache-2.0",
		"Redistribution and use in source and binary forms ... Neither the name of": "BSD-3-Clause",
		"Redistribution and use in source and binary forms, with or without":        "BSD-2-Clause",
		"Mozilla Public License Version 2.0":                                        "MPL-2.0",
		"Some custom license, all rights reserved":                                  "unknown",
	}
	for text, want := range cases {
		if got := classify(text); got != want {
			t.Errorf("classify(%q) = %q, want %q", text, got, want)
		}
	}
}
