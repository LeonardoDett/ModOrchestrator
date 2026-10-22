package bridge

import (
	"modorchestrator/internal/core/application/conflicts"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
)

// ArchiveSideDTO is a mod's archive, or its loose files when archive is
// empty (D147).
type ArchiveSideDTO struct {
	Mod     ConflictModDTO `json:"mod"`
	Archive string         `json:"archive"`
}

type ArchiveOpponentDTO struct {
	Own      ArchiveSideDTO `json:"own"`
	Opponent ArchiveSideDTO `json:"opponent"`
	Wins     bool           `json:"wins"`
	// Reason is "loose" (a loose file beats every archive) or "load_order"
	// (the archive of the plugin loaded later wins).
	Reason string `json:"reason"`
	Files  int    `json:"files"`
}

type ModArchiveConflictsDTO struct {
	Supported bool                 `json:"supported"`
	Archives  []string             `json:"archives"`
	Unread    []string             `json:"unread"`
	Opponents []ArchiveOpponentDTO `json:"opponents"`
	FilesWon  int                  `json:"filesWon"`
	FilesLost int                  `json:"filesLost"`
}

// ModArchiveConflicts lists the disputes inside the game's archives of a
// mod in the active profile (D147). It only informs: deploy does not change.
func (a *App) ModArchiveConflicts(instance, modID string) (ModArchiveConflictsDTO, error) {
	v, err := a.c.Conflicts.ModArchiveConflicts(a.context(), game.InstanceID(instance), mod.ID(modID))
	if err != nil {
		return ModArchiveConflictsDTO{}, a.fail("mod archive conflicts", err, map[string]string{"mod": modID})
	}
	side := func(s conflicts.ArchiveSide) ArchiveSideDTO {
		return ArchiveSideDTO{Mod: toConflictMod(s.Mod), Archive: s.Archive}
	}
	out := ModArchiveConflictsDTO{Supported: v.Supported, Archives: append([]string{}, v.Archives...), Unread: append([]string{}, v.Unread...), Opponents: []ArchiveOpponentDTO{}, FilesWon: v.FilesWon, FilesLost: v.FilesLost}
	for _, o := range v.Opponents {
		out.Opponents = append(out.Opponents, ArchiveOpponentDTO{Own: side(o.Own), Opponent: side(o.Opponent), Wins: o.Wins, Reason: string(o.Reason), Files: o.Files})
	}
	return out, nil
}
