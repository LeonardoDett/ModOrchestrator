package conflict

import (
	"math/rand"
	"strings"
	"testing"

	"modorchestrator/internal/core/domain/game"
)

// locKey.compare sorts as the joined "target|path" key always did (F14).
func TestLocKeyCompareMatchesJoinedKey(t *testing.T) {
	parts := []string{"data", "data2", "dat", "root", "a", "a|b", "a/b", "", "z"}
	r := rand.New(rand.NewSource(1))
	sign := func(n int) int {
		switch {
		case n < 0:
			return -1
		case n > 0:
			return 1
		}
		return 0
	}
	for i := 0; i < 20000; i++ {
		a := locKey{target: game.TargetID(parts[r.Intn(len(parts))]), path: parts[r.Intn(len(parts))]}
		b := locKey{target: game.TargetID(parts[r.Intn(len(parts))]), path: parts[r.Intn(len(parts))]}
		want := strings.Compare(string(a.target)+"|"+a.path, string(b.target)+"|"+b.path)
		if got := a.compare(b); sign(got) != sign(want) {
			t.Fatalf("%v vs %v: %d, want %d", a, b, got, want)
		}
	}
}
