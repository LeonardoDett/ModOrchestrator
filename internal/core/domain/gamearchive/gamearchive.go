// Package gamearchive calculates the disputes over files inside the game's
// archives (BSA, BA2) of the plugin target (D147). State category:
// calculated, like package conflict (INV-CON-04): derived on demand from the
// archives the game loads, their indexes and the loose winners, never
// persisted, never a rule (D004).
//
// The rule is fixed by the contract (ports.ArchiveIndex): a loose file wins
// over the same path inside any archive, whatever the mod order; among
// archives, the one the game reads later wins. Nothing here changes what is
// deployed: the result only explains what the game will see.
package gamearchive

import (
	"slices"
	"strings"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/relpath"
)

// Archive is a game archive the desired state deploys and the game loads.
type Archive struct {
	// Name is the file name at the top of the plugin target ("Mod.bsa").
	Name string
	Mod  mod.ID
	// Files are the paths inside, relative to the plugin target. Unread is
	// true when the adapter could not read the index: the archive takes no
	// part in the calculation and the UI shows the rule instead.
	Files  []relpath.Path
	Unread bool
}

// Source is where a file comes from: a mod's archive, or the mod's loose
// file when Archive is empty.
type Source struct {
	Mod     mod.ID
	Archive string
}

// Loose reports whether s is a loose file.
func (s Source) Loose() bool { return s.Archive == "" }

func (s Source) key() string { return string(s.Mod) + "|" + strings.ToLower(s.Archive) }

// Input is what the calculation needs.
type Input struct {
	// Target is the plugin target the archives belong to.
	Target game.TargetID
	// Archives are in the order the game reads them (later wins).
	Archives []Archive
	// Loose returns the mod whose loose file the desired state deploys at
	// a location of the target (the winner of package conflict).
	Loose func(game.Location) (mod.ID, bool)
}

// FileConflict is a path inside archives that more than one source has.
type FileConflict struct {
	Path   relpath.Path
	Winner Source
	// Losers are in the order the game reads them.
	Losers []Source
}

// Reason says why the winner of a pair wins.
type Reason string

const (
	// ReasonLoose: the winner is a loose file; loose beats every archive.
	ReasonLoose Reason = "loose"
	// ReasonLoadOrder: both are archives; the winner's loads later.
	ReasonLoadOrder Reason = "load_order"
)

// Pair is a winner and a loser of different mods with the number of paths
// the winner takes. Sources of the same mod (its loose file over its own
// archive) are counted in Files, not in pairs.
type Pair struct {
	Winner, Loser Source
	Reason        Reason
	Files         int
}

// Result is the calculation.
type Result struct {
	Files []FileConflict
	Pairs []Pair
	// Unread are the loaded archives whose index was not read.
	Unread []Archive
}

// Calculate derives every dispute. Same input, same output: files by path
// key, pairs by winner, then loser.
func Calculate(in Input) Result {
	type entry struct {
		path    relpath.Path
		sources []Source
	}
	byPath := map[string]*entry{}
	var res Result
	for _, a := range in.Archives {
		if a.Unread {
			res.Unread = append(res.Unread, a)
			continue
		}
		src := Source{Mod: a.Mod, Archive: a.Name}
		for _, p := range a.Files {
			e := byPath[p.Key()]
			if e == nil {
				e = &entry{path: p}
				byPath[p.Key()] = e
			}
			// A path listed twice in one archive counts once.
			if n := len(e.sources); n > 0 && e.sources[n-1] == src {
				continue
			}
			e.sources = append(e.sources, src)
		}
	}
	keys := make([]string, 0, len(byPath))
	for k := range byPath {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	pairs := map[[2]string]*Pair{}
	for _, k := range keys {
		e := byPath[k]
		sources := e.sources
		if in.Loose != nil {
			if m, ok := in.Loose(game.Location{Target: in.Target, Path: e.path}); ok {
				sources = append(slices.Clone(sources), Source{Mod: m})
			}
		}
		if len(sources) < 2 {
			continue
		}
		c := FileConflict{Path: e.path, Winner: sources[len(sources)-1], Losers: sources[:len(sources)-1]}
		res.Files = append(res.Files, c)
		reason := ReasonLoadOrder
		if c.Winner.Loose() {
			reason = ReasonLoose
		}
		for _, l := range c.Losers {
			if l.Mod == c.Winner.Mod {
				continue
			}
			pk := [2]string{c.Winner.key(), l.key()}
			p := pairs[pk]
			if p == nil {
				p = &Pair{Winner: c.Winner, Loser: l, Reason: reason}
				pairs[pk] = p
			}
			p.Files++
		}
	}
	for _, p := range pairs {
		res.Pairs = append(res.Pairs, *p)
	}
	slices.SortFunc(res.Pairs, func(a, b Pair) int {
		if c := strings.Compare(a.Winner.key(), b.Winner.key()); c != 0 {
			return c
		}
		return strings.Compare(a.Loser.key(), b.Loser.key())
	})
	return res
}

// Loaded is what a module that knows the game's archives gives the
// calculation: the plugin target and the archives in the order the game
// reads them.
type Loaded struct {
	Target   game.TargetID
	Archives []Archive
}
