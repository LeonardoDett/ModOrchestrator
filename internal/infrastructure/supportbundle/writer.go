// Package supportbundle writes the support bundle zip (core/10 §4): the
// state report gathered by the diagnostics service and the technical logs,
// with local paths replaced by placeholders when the bundle is anonymized.
package supportbundle

import (
	"archive/zip"
	"bufio"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"modorchestrator/internal/core/application/diagnostics"
)

// Write creates the bundle at path (through a temporary file renamed at
// the end, so a failure never leaves a half-written zip there).
func Write(path string, b diagnostics.Bundle, logsDir string) (err error) {
	tmp := path + ".partial"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			f.Close()
			os.Remove(tmp)
		}
	}()
	zw := zip.NewWriter(f)
	scrub := newScrubber(b.Replacements)

	report, err := json.MarshalIndent(b.Report, "", "  ")
	if err != nil {
		return err
	}
	w, err := zw.Create("report.json")
	if err != nil {
		return err
	}
	if _, err := io.WriteString(w, scrub(string(report))); err != nil {
		return err
	}
	if err := addLogs(zw, logsDir, scrub); err != nil {
		return err
	}
	if err := zw.Close(); err != nil {
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func addLogs(zw *zip.Writer, dir string, scrub func(string) string) error {
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		if err := addLog(zw, filepath.Join(dir, name), "logs/"+name, scrub); err != nil {
			return err
		}
	}
	return nil
}

func addLog(zw *zip.Writer, src, dst string, scrub func(string) string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	w, err := zw.Create(dst)
	if err != nil {
		return err
	}
	r := bufio.NewReader(in)
	for {
		line, err := r.ReadString('\n')
		if line != "" {
			if _, werr := io.WriteString(w, scrub(line)); werr != nil {
				return werr
			}
		}
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
	}
}

// newScrubber replaces every path (case-insensitive, both as written and as
// escaped inside JSON) with its placeholder. Replacements come longest
// first, so a folder inside another is replaced before its parent.
func newScrubber(repl []diagnostics.Replacement) func(string) string {
	if len(repl) == 0 {
		return func(s string) string { return s }
	}
	type rule struct {
		re  *regexp.Regexp
		out string
	}
	var rules []rule
	for _, r := range repl {
		forms := []string{r.Path, strings.ReplaceAll(r.Path, `\`, `\\`), strings.ReplaceAll(r.Path, `\`, `/`)}
		for _, form := range forms {
			rules = append(rules, rule{regexp.MustCompile(`(?i)` + regexp.QuoteMeta(form)), r.Placeholder})
		}
	}
	return func(s string) string {
		for _, r := range rules {
			s = r.re.ReplaceAllLiteralString(s, r.out)
		}
		return s
	}
}
