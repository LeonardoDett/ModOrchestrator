package system

import (
	"regexp"
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
