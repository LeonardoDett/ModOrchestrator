// Package logging is the technical log (core/10 §4): JSON lines in a
// rotating set of files under the data directory, and a reader for the
// Diagnostics › Log tab. The technical log is not history, diagnostics or
// notifications; it records what the program did, for debugging.
package logging

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/operation"
)

// Defaults of core/10 §4: 10 files of 10 MB.
const (
	DefaultMaxBytes = 10 << 20
	DefaultMaxFiles = 10
	baseName        = "modorchestrator"
)

// Attribute keys shared by writers and the reader.
const (
	KeyOperation = "operation"
	KeyStep      = "step"
	KeyInstance  = "instance"
	KeyEntity    = "entity"
	KeyError     = "error"
)

// RotatingFile is an io.Writer over <dir>/modorchestrator.log that rotates
// to modorchestrator.1.log ... .(maxFiles-1).log when a write would exceed
// maxBytes. Writes are line-atomic (one slog record per Write).
type RotatingFile struct {
	dir      string
	maxBytes int64
	maxFiles int

	mu   sync.Mutex
	file *os.File
	size int64
}

// OpenRotating opens (creating dir if needed) the current log file.
func OpenRotating(dir string, maxBytes int64, maxFiles int) (*RotatingFile, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("logging: create %s: %w", dir, err)
	}
	r := &RotatingFile{dir: dir, maxBytes: maxBytes, maxFiles: max(1, maxFiles)}
	if err := r.open(); err != nil {
		return nil, err
	}
	return r, nil
}

// Dir is the folder holding the log files.
func (r *RotatingFile) Dir() string { return r.dir }

func (r *RotatingFile) open() error {
	f, err := os.OpenFile(filePath(r.dir, 0), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return fmt.Errorf("logging: open: %w", err)
	}
	info, err := f.Stat()
	if err != nil {
		f.Close()
		return err
	}
	r.file, r.size = f, info.Size()
	return nil
}

// Write appends p, rotating first if needed.
func (r *RotatingFile) Write(p []byte) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.file == nil {
		return 0, errors.New("logging: closed")
	}
	if r.size > 0 && r.size+int64(len(p)) > r.maxBytes {
		if err := r.rotate(); err != nil {
			return 0, err
		}
	}
	n, err := r.file.Write(p)
	r.size += int64(n)
	return n, err
}

func (r *RotatingFile) rotate() error {
	if err := r.file.Close(); err != nil {
		return err
	}
	r.file = nil
	_ = os.Remove(filePath(r.dir, r.maxFiles-1))
	for i := r.maxFiles - 2; i >= 0; i-- {
		if err := os.Rename(filePath(r.dir, i), filePath(r.dir, i+1)); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("logging: rotate: %w", err)
		}
	}
	return r.open()
}

// Close flushes and closes the current file.
func (r *RotatingFile) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.file == nil {
		return nil
	}
	err := r.file.Close()
	r.file = nil
	return err
}

func filePath(dir string, index int) string {
	if index == 0 {
		return filepath.Join(dir, baseName+".log")
	}
	return filepath.Join(dir, fmt.Sprintf("%s.%d.log", baseName, index))
}

// NewLogger returns a JSON slog logger writing to w at the given level.
func NewLogger(w *RotatingFile, level *slog.LevelVar) *slog.Logger {
	return slog.New(slog.NewJSONHandler(w, &slog.HandlerOptions{Level: level}))
}

// ParseLevel maps the app.logLevel setting (core/13) to a slog level.
func ParseLevel(s string) slog.Level {
	switch s {
	case "error":
		return slog.LevelError
	case "warn":
		return slog.LevelWarn
	case "debug":
		return slog.LevelDebug
	default:
		return slog.LevelInfo
	}
}

// OperationEvents returns an event-bus subscriber that records operation
// transitions in the technical log.
func OperationEvents(logger *slog.Logger) func(event.Event) {
	return func(e event.Event) {
		if e.OperationID == "" {
			return
		}
		attrs := []any{slog.String(KeyOperation, e.OperationID), slog.String("event", string(e.Type))}
		if !e.Subject.IsZero() {
			attrs = append(attrs, slog.String(KeyEntity, e.Subject.Kind+":"+e.Subject.ID))
		}
		level := slog.LevelInfo
		if p, ok := e.Payload.(operation.EventPayload); ok {
			attrs = append(attrs, slog.String("kind", string(p.Kind)), slog.String("status", string(p.Status)))
			if p.Step != "" {
				attrs = append(attrs, slog.String(KeyStep, p.Step))
			}
			if p.Error != nil {
				level = slog.LevelError
				attrs = append(attrs, slog.String(KeyError, p.Error.Error()))
			}
			if p.Status == operation.StatusInterrupted {
				level = max(level, slog.LevelWarn)
			}
		}
		logger.Log(context.Background(), level, "operation event", attrs...)
	}
}

// Entry is one parsed log line.
type Entry struct {
	Time      time.Time
	Level     string // error, warn, info, debug
	Message   string
	Operation string
	Step      string
	Error     string
	// Fields are the remaining attributes, as JSON-decoded values.
	Fields map[string]any
}

// Filter selects entries; zero values match everything.
type Filter struct {
	Levels    []string
	Operation string
	Text      string
	// Limit caps the result to the newest entries (default 500).
	Limit int
}

func (f Filter) match(e Entry, raw string) bool {
	if len(f.Levels) > 0 && !slices.Contains(f.Levels, e.Level) {
		return false
	}
	if f.Operation != "" && e.Operation != f.Operation {
		return false
	}
	if f.Text != "" && !strings.Contains(strings.ToLower(raw), strings.ToLower(f.Text)) {
		return false
	}
	return true
}

// Tail returns the newest entries matching f, oldest first, reading the
// current file and then older rotations until the limit is reached.
func Tail(dir string, f Filter) ([]Entry, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = 500
	}
	var out []Entry
	for i := 0; ; i++ {
		lines, err := readLines(filePath(dir, i))
		if errors.Is(err, fs.ErrNotExist) {
			if i == 0 {
				continue
			}
			break
		}
		if err != nil {
			return nil, err
		}
		var chunk []Entry
		for _, line := range lines {
			e, ok := parse(line)
			if ok && f.match(e, line) {
				chunk = append(chunk, e)
			}
		}
		out = append(chunk, out...)
		if len(out) >= limit || i > 100 {
			break
		}
	}
	if len(out) > limit {
		out = out[len(out)-limit:]
	}
	return out, nil
}

func readLines(path string) ([]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	var lines []string
	sc := bufio.NewScanner(file)
	sc.Buffer(make([]byte, 64<<10), 4<<20)
	for sc.Scan() {
		if line := strings.TrimSpace(sc.Text()); line != "" {
			lines = append(lines, line)
		}
	}
	return lines, sc.Err()
}

func parse(line string) (Entry, bool) {
	var m map[string]any
	if err := json.Unmarshal([]byte(line), &m); err != nil {
		return Entry{}, false
	}
	take := func(key string) string {
		v, _ := m[key].(string)
		delete(m, key)
		return v
	}
	e := Entry{
		Level:     strings.ToLower(take(slog.LevelKey)),
		Message:   take(slog.MessageKey),
		Operation: take(KeyOperation),
		Step:      take(KeyStep),
		Error:     take(KeyError),
	}
	if t, err := time.Parse(time.RFC3339Nano, take(slog.TimeKey)); err == nil {
		e.Time = t.UTC()
	}
	if strings.HasPrefix(e.Level, "warn") {
		e.Level = "warn"
	}
	if len(m) > 0 {
		e.Fields = m
	}
	return e, true
}
