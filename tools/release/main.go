// Command release holds the checks and files of the release pipeline
// (plano-de-publicacao.md, etapa 3; D105). It runs in CI and on any
// machine with the repository:
//
//	go run ./tools/release version v1.0.0     tag = wails.json = CHANGELOG
//	go run ./tools/release notes 1.0.0        CHANGELOG section of a version
//	go run ./tools/release notices OUT        THIRD_PARTY_NOTICES, failing on
//	                                          a license not compatible with
//	                                          GPL-3.0 (D076)
//	go run ./tools/release sums DIR           SHA256SUMS of the files in DIR
//
// The notices cover the Go modules compiled into the executable and the
// production npm packages of the frontend (including dettmann-ui's).
package main

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"

	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strings"
)

func main() {
	if len(os.Args) < 3 {
		fmt.Fprintln(os.Stderr, "usage: release version <tag> | notes <version> | notices <out> | sums <dir>")
		os.Exit(2)
	}
	var err error
	switch os.Args[1] {
	case "version":
		err = checkVersion(os.Args[2])
	case "notes":
		var notes string
		notes, err = changelogSection(readFile("CHANGELOG.md"), strings.TrimPrefix(os.Args[2], "v"))
		fmt.Print(notes)
	case "notices":
		err = writeNotices(os.Args[2])
	case "sums":
		err = writeSums(os.Args[2])
	default:
		err = fmt.Errorf("unknown command %q", os.Args[1])
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "release:", err)
		os.Exit(1)
	}
}

func readFile(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintln(os.Stderr, "release:", err)
		os.Exit(1)
	}
	return string(b)
}

// --- version -----------------------------------------------------------

var semver = regexp.MustCompile(`^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)$`)

// checkVersion makes the executable, the installer and the notes carry the
// version of the tag ("versão da tag igual à do executável").
func checkVersion(tag string) error {
	m := semver.FindStringSubmatch(tag)
	if m == nil {
		return fmt.Errorf("tag %q is not v<major>.<minor>.<patch>[-pre]", tag)
	}
	version := m[1]
	var cfg struct {
		Info struct {
			ProductVersion string `json:"productVersion"`
		} `json:"info"`
	}
	if err := json.Unmarshal([]byte(readFile("wails.json")), &cfg); err != nil {
		return fmt.Errorf("wails.json: %w", err)
	}
	// The Windows version resource has no prerelease part: 1.1.0-beta.1 is
	// built as 1.1.0 (the app reports the full version from -ldflags).
	core, _, _ := strings.Cut(version, "-")
	if cfg.Info.ProductVersion != core {
		return fmt.Errorf("wails.json info.productVersion is %q, tag needs %q", cfg.Info.ProductVersion, core)
	}
	if _, err := changelogSection(readFile("CHANGELOG.md"), version); err != nil {
		return err
	}
	fmt.Println(version)
	return nil
}

// changelogSection returns the body of "## [version]" in a Keep a
// Changelog file, up to the next "## ".
func changelogSection(changelog, version string) (string, error) {
	sc := bufio.NewScanner(strings.NewReader(changelog))
	var out []string
	in := false
	for sc.Scan() {
		line := sc.Text()
		if strings.HasPrefix(line, "## ") {
			if in {
				break
			}
			in = strings.HasPrefix(line, "## ["+version+"]")
			continue
		}
		if in {
			out = append(out, line)
		}
	}
	if !in && len(out) == 0 {
		return "", fmt.Errorf("CHANGELOG.md has no section \"## [%s]\"", version)
	}
	return strings.TrimSpace(strings.Join(out, "\n")) + "\n", nil
}

// --- sums --------------------------------------------------------------

func writeSums(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	var b strings.Builder
	for _, e := range entries {
		if e.IsDir() || e.Name() == "SHA256SUMS" {
			continue
		}
		f, err := os.Open(filepath.Join(dir, e.Name()))
		if err != nil {
			return err
		}
		h := sha256.New()
		_, err = io.Copy(h, f)
		f.Close()
		if err != nil {
			return err
		}
		fmt.Fprintf(&b, "%s  %s\n", hex.EncodeToString(h.Sum(nil)), e.Name())
	}
	return os.WriteFile(filepath.Join(dir, "SHA256SUMS"), []byte(b.String()), 0o644)
}

// --- notices -----------------------------------------------------------

// allowed are the licenses compatible with distributing the app under
// GPL-3.0-or-later (D076, D062).
var allowed = []string{
	"MIT", "MIT-0", "ISC", "0BSD", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "MPL-2.0",
	"Zlib", "Unlicense", "CC0-1.0", "BlueOak-1.0.0", "Python-2.0",
	"LGPL-2.1-or-later", "LGPL-3.0", "LGPL-3.0-or-later", "GPL-3.0", "GPL-3.0-or-later",
}

type component struct {
	Name, Version, License, Text string
}

func writeNotices(out string) error {
	goDeps, err := goComponents()
	if err != nil {
		return err
	}
	npmDeps, err := npmComponents("frontend")
	if err != nil {
		return err
	}
	var bad []string
	for _, c := range append(slices.Clone(goDeps), npmDeps...) {
		if !licenseAllowed(c.License) {
			bad = append(bad, fmt.Sprintf("%s %s: %q", c.Name, c.Version, c.License))
		}
	}
	if len(bad) > 0 {
		return fmt.Errorf("licenses not known to be compatible with GPL-3.0 (D076):\n  %s", strings.Join(bad, "\n  "))
	}
	var b bytes.Buffer
	b.WriteString("Mod Orchestrator is licensed under the GPL-3.0-or-later (LICENSE.txt).\n")
	b.WriteString("It includes the third-party components below, under their own licenses.\n")
	for _, group := range []struct {
		title string
		list  []component
	}{{"Go modules", goDeps}, {"JavaScript packages (frontend)", npmDeps}} {
		fmt.Fprintf(&b, "\n\n==== %s (%d) ====\n", group.title, len(group.list))
		for _, c := range group.list {
			fmt.Fprintf(&b, "\n---- %s %s (%s) ----\n\n", c.Name, c.Version, c.License)
			b.WriteString(strings.TrimSpace(c.Text))
			b.WriteString("\n")
		}
	}
	fmt.Printf("%d Go modules, %d npm packages\n", len(goDeps), len(npmDeps))
	return os.WriteFile(out, b.Bytes(), 0o644)
}

func licenseAllowed(expr string) bool {
	expr = strings.Trim(strings.TrimSpace(expr), "()")
	if expr == "" {
		return false
	}
	if strings.Contains(expr, " OR ") {
		for _, part := range strings.Split(expr, " OR ") {
			if licenseAllowed(part) {
				return true
			}
		}
		return false
	}
	for _, part := range strings.Split(expr, " AND ") {
		if !slices.Contains(allowed, strings.Trim(strings.TrimSpace(part), "()")) {
			return false
		}
	}
	return true
}

// goComponents lists the modules of the packages linked into the Windows
// executable.
func goComponents() ([]component, error) {
	cmd := exec.Command("go", "list", "-deps", "-f", "{{if .Module}}{{if not .Module.Main}}{{.Module.Path}}\t{{.Module.Version}}\t{{if .Module.Replace}}{{.Module.Replace.Dir}}{{else}}{{.Module.Dir}}{{end}}{{end}}{{end}}", ".")
	cmd.Env = append(os.Environ(), "GOOS=windows", "GOARCH=amd64")
	cmd.Stderr = os.Stderr
	raw, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("go list: %w", err)
	}
	seen := map[string]bool{}
	var out []component
	for _, line := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
		f := strings.Split(strings.TrimSpace(line), "\t")
		if len(f) != 3 || seen[f[0]] {
			continue
		}
		seen[f[0]] = true
		dir := f[2]
		if dir != "" && !filepath.IsAbs(dir) {
			dir = filepath.Join(".", dir)
		}
		text := licenseText(dir)
		out = append(out, component{Name: f[0], Version: f[1], License: classify(text), Text: text})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// npmComponents lists the production packages installed for the frontend
// (npm ls --omit=dev), reading each package.json and license file.
func npmComponents(dir string) ([]component, error) {
	cmd := exec.Command(npmBin(), "ls", "--omit=dev", "--all", "--parseable")
	cmd.Dir = dir
	raw, err := cmd.Output()
	if err != nil && len(raw) == 0 {
		return nil, fmt.Errorf("npm ls: %w", err)
	}
	root, _ := filepath.Abs(dir)
	seen := map[string]bool{}
	var out []component
	for _, line := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
		path := strings.TrimSpace(line)
		if path == "" || samePath(path, root) {
			continue
		}
		var pkg struct {
			Name    string          `json:"name"`
			Version string          `json:"version"`
			License json.RawMessage `json:"license"`
			Private bool            `json:"private"`
		}
		data, err := os.ReadFile(filepath.Join(path, "package.json"))
		if err != nil {
			return nil, err
		}
		if err := json.Unmarshal(data, &pkg); err != nil {
			return nil, fmt.Errorf("%s: %w", path, err)
		}
		key := pkg.Name + "@" + pkg.Version
		if seen[key] {
			continue
		}
		seen[key] = true
		license := ""
		if err := json.Unmarshal(pkg.License, &license); err != nil {
			var obj struct {
				Type string `json:"type"`
			}
			_ = json.Unmarshal(pkg.License, &obj)
			license = obj.Type
		}
		text := licenseText(path)
		if text == "" {
			text = "License: " + license + " (no license file in the package)"
		}
		out = append(out, component{Name: pkg.Name, Version: pkg.Version, License: license, Text: text})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func npmBin() string {
	if os.PathSeparator == '\\' {
		return "npm.cmd"
	}
	return "npm"
}

func samePath(a, b string) bool {
	a, _ = filepath.Abs(a)
	return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
}

var licenseFile = regexp.MustCompile(`(?i)^(licen[cs]e|copying)(\.md|\.txt|-mit|\.mit)?$`)

func licenseText(dir string) string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return ""
	}
	var texts []string
	for _, e := range entries {
		if !e.IsDir() && licenseFile.MatchString(e.Name()) {
			if b, err := os.ReadFile(filepath.Join(dir, e.Name())); err == nil {
				texts = append(texts, string(b))
			}
		}
	}
	return strings.Join(texts, "\n\n")
}

// classify names the license of a Go module from its license text (Go
// modules carry no SPDX field). Unknown text is reported, never guessed.
func classify(text string) string {
	t := strings.Join(strings.Fields(strings.ToLower(text)), " ")
	switch {
	case t == "":
		return ""
	case strings.Contains(t, "mozilla public license") && strings.Contains(t, "2.0"):
		return "MPL-2.0"
	case strings.Contains(t, "apache license") && strings.Contains(t, "version 2.0"):
		return "Apache-2.0"
	case strings.Contains(t, "gnu general public license") && strings.Contains(t, "version 3"):
		return "GPL-3.0"
	case strings.Contains(t, "permission is hereby granted, free of charge"):
		return "MIT"
	case strings.Contains(t, "permission to use, copy, modify, and/or distribute this software for any purpose with or without fee"),
		strings.Contains(t, "permission to use, copy, modify, and distribute this software for any purpose with or without fee"):
		return "ISC"
	case strings.Contains(t, "redistribution and use in source and binary forms"):
		if strings.Contains(t, "neither the name") || strings.Contains(t, "names of its contributors may be used") {
			return "BSD-3-Clause"
		}
		return "BSD-2-Clause"
	case strings.Contains(t, "this is free and unencumbered software released into the public domain"):
		return "Unlicense"
	}
	return "unknown"
}
