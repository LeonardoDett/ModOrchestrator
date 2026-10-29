import type { ModArchiveConflicts } from "../../bridge/types";

/** What the headline of the disputes inside archives counts (D147): files of every line and the other mods. */
export function archiveSummary(data: ModArchiveConflicts): { files: number; mods: number } {
  const mods = new Set(data.opponents.map((o) => o.opponent.mod.id));
  return { files: data.opponents.reduce((n, o) => n + o.files, 0), mods: mods.size };
}
