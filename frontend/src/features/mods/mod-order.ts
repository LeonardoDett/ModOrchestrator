import type { DataTableRowMove } from "dettmann-ui";
import type { EntryRef, ModOrder, ModRow, MoveRequest, Separator } from "../../bridge/types";

/**
 * A line of the Mods table: a mod, or a separator of the ModOrder
 * (ui/telas/mods.md §5.3). Building it is presentation of what the backend
 * returned (ModList + ModOrder); every decision about positions stays in the
 * backend (MoveMods).
 */
export type ListRow =
  | { kind: "mod"; id: string; mod: ModRow; priority: number | null }
  | { kind: "separator"; id: string; separator: Separator };

const SEPARATOR_PREFIX = "\u0000sep:";

export const separatorRowId = (id: string) => SEPARATOR_PREFIX + id;

/** Mod rows in plain form, with the priority each mod has in the order. */
export function modRows(mods: readonly ModRow[], order: ModOrder | null): ListRow[] {
  const priority = new Map<string, number>();
  for (const e of order?.entries ?? []) if (e.kind === "mod" && e.modId) priority.set(e.modId, e.priority ?? 0);
  return mods.map((mod) => ({ kind: "mod", id: mod.id, mod, priority: priority.get(mod.id) ?? null }));
}

/**
 * The ModOrder as rows, lowest priority first, with separators; mods of a
 * collapsed separator are hidden. Mods outside the order (not installed)
 * come last, without priority.
 */
export function orderedRows(mods: readonly ModRow[], order: ModOrder): ListRow[] {
  const byId = new Map(mods.map((m) => [m.id, m]));
  const out: ListRow[] = [];
  const placed = new Set<string>();
  let collapsed = false;
  for (const e of order.entries) {
    if (e.kind === "separator" && e.separator) {
      collapsed = e.separator.collapsed;
      out.push({ kind: "separator", id: separatorRowId(e.separator.id), separator: e.separator });
      continue;
    }
    const mod = e.modId ? byId.get(e.modId) : undefined;
    if (!mod) continue;
    placed.add(mod.id);
    if (!collapsed) out.push({ kind: "mod", id: mod.id, mod, priority: e.priority ?? null });
  }
  for (const mod of mods) if (!placed.has(mod.id)) out.push({ kind: "mod", id: mod.id, mod, priority: null });
  return out;
}

/** The order entry a row stands for; rows outside the order have none. */
export function entryOf(row: ListRow): EntryRef | null {
  if (row.kind === "separator") return { separator: row.separator.id };
  return row.priority != null ? { mod: row.mod.id } : null;
}

/** Turns a table drop into the backend request (validated there). */
export function moveRequestFor(move: DataTableRowMove, rows: readonly ListRow[]): MoveRequest | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const entries = move.ids.flatMap((id) => {
    const row = byId.get(id);
    const entry = row ? entryOf(row) : null;
    return entry ? [entry] : [];
  });
  const target = byId.get(move.targetId);
  const anchor = target ? entryOf(target) : null;
  if (entries.length === 0 || !anchor) return null;
  return { entries, anchor: { kind: move.position, entry: anchor }, mode: "exact" };
}
