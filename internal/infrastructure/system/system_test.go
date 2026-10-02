package system

import (
	"context"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"
)

var uuidV7 = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func TestIDsAreUniqueUUIDv7(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 1000; i++ {
		id := IDs{}.NewID()
		if !uuidV7.MatchString(id) {
			t.Fatalf("not a UUIDv7: %s", id)
		}
		if seen[id] {
			t.Fatalf("duplicate id %s", id)
		}
		seen[id] = true
	}
}

func TestProcessesFindsTheTestBinary(t *testing.T) {
	exe, err := os.Executable()
	if err != nil {
		t.Skip(err)
	}
	name := filepath.Base(exe)
	got, err := Processes{}.Running(context.Background(), []string{strings.ToUpper(name), "certainly-not-running.exe"})
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS == "windows" && (len(got) != 1 || got[0] != strings.ToUpper(name)) {
		t.Fatalf("running = %v", got)
	}
}
