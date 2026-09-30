package logging

import (
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/operation"
)

func TestRotationKeepsAtMostMaxFiles(t *testing.T) {
	dir := t.TempDir()
	w, err := OpenRotating(dir, 200, 3)
	if err != nil {
		t.Fatal(err)
	}
	var level slog.LevelVar
	log := NewLogger(w, &level)
	for i := range 50 {
		log.Info("line", "n", i)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	files, _ := filepath.Glob(filepath.Join(dir, "*.log"))
	if len(files) != 3 {
		t.Fatalf("files = %v, want 3", files)
	}
	for _, f := range files {
		info, _ := os.Stat(f)
		if info.Size() > 200 {
			t.Errorf("%s has %d bytes, above the limit", f, info.Size())
		}
	}

	// Tail crosses rotations and returns the newest entries in order.
	entries, err := Tail(dir, Filter{Limit: 4})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 4 {
		t.Fatalf("entries = %d", len(entries))
	}
	for i, e := range entries {
		if n, _ := e.Fields["n"].(float64); int(n) != 46+i {
			t.Errorf("entry %d has n=%v", i, e.Fields["n"])
		}
	}
}

func TestTailFiltersAndParsesKnownKeys(t *testing.T) {
	dir := t.TempDir()
	w, err := OpenRotating(dir, DefaultMaxBytes, DefaultMaxFiles)
	if err != nil {
		t.Fatal(err)
	}
	defer w.Close()
	var level slog.LevelVar
	level.Set(slog.LevelDebug)
	log := NewLogger(w, &level)
	log.Debug("probe")
	log.Warn("disk almost full", KeyOperation, "op-1", KeyStep, "apply")
	log.Error("copy failed", KeyOperation, "op-2", KeyError, "access denied")

	all, _ := Tail(dir, Filter{})
	if len(all) != 3 || all[0].Level != "debug" || all[1].Level != "warn" || all[2].Level != "error" {
		t.Fatalf("all = %+v", all)
	}
	if all[1].Operation != "op-1" || all[1].Step != "apply" || all[2].Error != "access denied" {
		t.Fatalf("known keys not parsed: %+v", all)
	}
	if all[0].Time.IsZero() || all[0].Time.Location() != time.UTC {
		t.Fatalf("time = %v", all[0].Time)
	}
	byLevel, _ := Tail(dir, Filter{Levels: []string{"warn", "error"}})
	byOp, _ := Tail(dir, Filter{Operation: "op-2"})
	byText, _ := Tail(dir, Filter{Text: "DISK"})
	if len(byLevel) != 2 || len(byOp) != 1 || len(byText) != 1 || byText[0].Message != "disk almost full" {
		t.Fatalf("filters: %d %d %d", len(byLevel), len(byOp), len(byText))
	}
}

func TestTailOfMissingDirIsEmpty(t *testing.T) {
	entries, err := Tail(filepath.Join(t.TempDir(), "nope"), Filter{})
	if err != nil || len(entries) != 0 {
		t.Fatalf("entries = %v, err = %v", entries, err)
	}
}

func TestOperationEventsAreLogged(t *testing.T) {
	dir := t.TempDir()
	w, _ := OpenRotating(dir, DefaultMaxBytes, DefaultMaxFiles)
	defer w.Close()
	var level slog.LevelVar
	sub := OperationEvents(NewLogger(w, &level))
	sub(event.Event{Type: "operation.failed", OperationID: "op-9", Payload: operation.EventPayload{
		Kind: "import", Status: operation.StatusFailed, Step: "extract",
		Error: &operation.Error{Code: "archive_corrupt", Message: "bad header"},
	}})
	sub(event.Event{Type: "unrelated"}) // no operation: ignored

	entries, _ := Tail(dir, Filter{})
	if len(entries) != 1 {
		t.Fatalf("entries = %+v", entries)
	}
	e := entries[0]
	if e.Level != "error" || e.Operation != "op-9" || e.Step != "extract" || !strings.Contains(e.Error, "archive_corrupt") {
		t.Fatalf("entry = %+v", e)
	}
}

func TestParseLevel(t *testing.T) {
	for in, want := range map[string]slog.Level{"error": slog.LevelError, "warn": slog.LevelWarn, "info": slog.LevelInfo, "debug": slog.LevelDebug, "": slog.LevelInfo} {
		if got := ParseLevel(in); got != want {
			t.Errorf("ParseLevel(%q) = %v", in, got)
		}
	}
}
