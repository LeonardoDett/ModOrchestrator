package supportbundle

import (
	"archive/zip"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"modorchestrator/internal/core/application/diagnostics"
)

func TestWriteAnonymizesReportAndLogs(t *testing.T) {
	dir := t.TempDir()
	logs := filepath.Join(dir, "logs")
	os.MkdirAll(logs, 0o755)
	os.WriteFile(filepath.Join(logs, "app.log"), []byte(`{"msg":"deploy","path":"C:\\Users\\Ana\\Games\\Skyrim\\Data"}`+"\n"), 0o644)
	b := diagnostics.Bundle{
		Report: diagnostics.Report{AppVersion: "1.0.0", Anonymized: true, Instances: []diagnostics.InstanceReport{{Name: "Game", Root: `C:\Users\Ana\Games\Skyrim`}}},
		Replacements: []diagnostics.Replacement{
			{Path: `C:\Users\Ana\Games\Skyrim`, Placeholder: "<game1>"},
			{Path: `C:\Users\Ana`, Placeholder: "<home>"},
		},
	}
	out := filepath.Join(dir, "bundle.zip")
	if err := Write(out, b, logs); err != nil {
		t.Fatal(err)
	}
	zr, err := zip.OpenReader(out)
	if err != nil {
		t.Fatal(err)
	}
	defer zr.Close()
	all := map[string]string{}
	for _, f := range zr.File {
		rc, _ := f.Open()
		data, _ := io.ReadAll(rc)
		rc.Close()
		all[f.Name] = string(data)
	}
	if !strings.Contains(all["report.json"], "<game1>") || strings.Contains(all["report.json"], "Ana") {
		t.Fatalf("report not anonymized: %s", all["report.json"])
	}
	if !strings.Contains(all["logs/app.log"], "<game1>") || strings.Contains(all["logs/app.log"], "Ana") {
		t.Fatalf("log not anonymized (JSON-escaped paths): %s", all["logs/app.log"])
	}
	if _, err := os.Stat(out + ".partial"); !os.IsNotExist(err) {
		t.Fatal("no temporary file is left behind")
	}
}
