package conflicts

import (
	"context"
	"slices"
	"strings"

	"modorchestrator/internal/core/domain/conflict"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/gamearchive"
	"modorchestrator/internal/core/domain/mod"
)

// ArchiveSource is the contribution point of a module that knows which
// archives the game loads (D133, D147): it gives them in the order the game
// reads them, with their indexes. ok is false when the instance has no such
// archives (a game without the capability, the generic adapter).
type ArchiveSource interface {
	GameArchives(ctx context.Context, instance game.InstanceID) (gamearchive.Loaded, bool, error)
}

// ArchiveSide is one side of a dispute inside archives: a mod's archive, or
// its loose files when Archive is empty.
type ArchiveSide struct {
	Mod     ModRef
	Archive string
}

// ArchiveOpponent is what a mod gets against another source: Wins is true
// when this mod's side wins the Files paths (the reason says why).
type ArchiveOpponent struct {
	Own      ArchiveSide
	Opponent ArchiveSide
	Wins     bool
	Reason   gamearchive.Reason
	Files    int
}

// ModArchiveConflicts is the "inside archives" part of a mod's conflicts
// (ui/telas/mods.md, D147). It only informs: nothing here is decided by the
// mod order, and deploy does not change.
type ModArchiveConflicts struct {
	// Supported: the game's adapter tells which archives load and reads
	// them. Without it the screen shows nothing.
	Supported bool
	// Archives are the mod's archives the game loads; Unread the ones whose
	// index was not read (the UI shows the rule instead of a calculation).
	Archives []string
	Unread   []string
	// Opponents, losses first, then by number of files.
	Opponents []ArchiveOpponent
	// FilesWon and FilesLost count paths, not pairs.
	FilesWon, FilesLost int
}

// ModArchiveConflicts derives the disputes inside archives of one mod with
// the active profile: its archives against loose files and other archives,
// and its loose files against other mods' archives.
func (s *Service) ModArchiveConflicts(ctx context.Context, instance game.InstanceID, m mod.ID) (ModArchiveConflicts, error) {
	var out ModArchiveConflicts
	loaded, ok, err := s.gameArchives(ctx, instance)
	if err != nil || !ok {
		return out, err
	}
	st, err := s.load(ctx, instance, false)
	if err != nil {
		return out, err
	}
	if err := st.check(m); err != nil {
		return out, err
	}
	out.Supported = true
	s.mu.Lock()
	res := gamearchive.Calculate(gamearchive.Input{
		Target: loaded.Target, Archives: loaded.Archives,
		Loose: st.index.WinnerOf(conflict.EvalInput{Order: st.order, Intent: st.intent}),
	})
	s.mu.Unlock()
	for _, a := range loaded.Archives {
		if a.Mod != m {
			continue
		}
		out.Archives = append(out.Archives, a.Name)
		if a.Unread {
			out.Unread = append(out.Unread, a.Name)
		}
	}
	side := func(src gamearchive.Source) ArchiveSide { return ArchiveSide{Mod: st.ref(src.Mod), Archive: src.Archive} }
	for _, p := range res.Pairs {
		switch m {
		case p.Winner.Mod:
			out.Opponents = append(out.Opponents, ArchiveOpponent{Own: side(p.Winner), Opponent: side(p.Loser), Wins: true, Reason: p.Reason, Files: p.Files})
		case p.Loser.Mod:
			out.Opponents = append(out.Opponents, ArchiveOpponent{Own: side(p.Loser), Opponent: side(p.Winner), Reason: p.Reason, Files: p.Files})
		}
	}
	for _, f := range res.Files {
		lost := slices.ContainsFunc(f.Losers, func(l gamearchive.Source) bool { return l.Mod == m && l.Mod != f.Winner.Mod })
		switch {
		case f.Winner.Mod == m && slices.ContainsFunc(f.Losers, func(l gamearchive.Source) bool { return l.Mod != m }):
			out.FilesWon++
		case lost:
			out.FilesLost++
		}
	}
	slices.SortStableFunc(out.Opponents, func(a, b ArchiveOpponent) int {
		if a.Wins != b.Wins {
			if a.Wins {
				return 1
			}
			return -1
		}
		if a.Files != b.Files {
			return b.Files - a.Files
		}
		return strings.Compare(a.Opponent.Mod.Name, b.Opponent.Mod.Name)
	})
	return out, nil
}

// gameArchives asks the contributing modules; the first that knows the
// instance answers.
func (s *Service) gameArchives(ctx context.Context, instance game.InstanceID) (gamearchive.Loaded, bool, error) {
	for _, src := range s.Archives {
		loaded, ok, err := src.GameArchives(ctx, instance)
		if err != nil || ok {
			return loaded, ok, err
		}
	}
	return gamearchive.Loaded{}, false, nil
}
