/**
 * Pure DataTable behavior: selection transitions and the flat display list
 * (group headers + rows). Kept out of the component so it can be unit tested
 * without rendering and reused by consumers that drive the table themselves.
 */

export type DataTableSelectionMode = "none" | "single" | "multiple";

/** How a pointer or keyboard gesture changes the selection. */
export type SelectionIntent = "replace" | "toggle" | "range" | "range-add";

export interface SelectionState {
  selected: ReadonlySet<string>;
  /** Row where the last non-range gesture happened; ranges extend from here. */
  anchor: string | null;
}

export interface ModifierKeys {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

/** Explorer-style mapping: Shift extends, Ctrl/Cmd toggles, both add a range. */
export function selectionIntent(keys: ModifierKeys, mode: DataTableSelectionMode): SelectionIntent {
  if (mode !== "multiple") return "replace";
  const toggle = Boolean(keys.ctrlKey || keys.metaKey);
  if (keys.shiftKey) return toggle ? "range-add" : "range";
  return toggle ? "toggle" : "replace";
}

function rangeBetween(order: readonly string[], from: string, to: string): string[] {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (b < 0) return [];
  if (a < 0) return [to];
  const [start, end] = a <= b ? [a, b] : [b, a];
  return order.slice(start, end + 1);
}

/**
 * Applies a gesture on `target`. `order` is the visible row order, used to
 * resolve ranges; ids outside it are kept only by additive intents.
 */
export function applySelection(
  state: SelectionState,
  order: readonly string[],
  target: string,
  intent: SelectionIntent,
): SelectionState {
  switch (intent) {
    case "replace":
      return { selected: new Set([target]), anchor: target };
    case "toggle": {
      const next = new Set(state.selected);
      if (next.has(target)) next.delete(target);
      else next.add(target);
      return { selected: next, anchor: target };
    }
    case "range":
      return { selected: new Set(rangeBetween(order, state.anchor ?? target, target)), anchor: state.anchor ?? target };
    case "range-add": {
      const next = new Set(state.selected);
      for (const id of rangeBetween(order, state.anchor ?? target, target)) next.add(id);
      return { selected: next, anchor: state.anchor ?? target };
    }
  }
}

export function selectAll(state: SelectionState, order: readonly string[]): SelectionState {
  return { selected: new Set(order), anchor: state.anchor };
}

export interface DataTableGroupItem {
  kind: "group";
  key: string;
  group: string;
  count: number;
  collapsed: boolean;
}

export interface DataTableRowItem<T> {
  kind: "row";
  key: string;
  row: T;
  /** Index of the row in the input array. */
  rowIndex: number;
}

export type DataTableDisplayItem<T> = DataTableGroupItem | DataTableRowItem<T>;

/** Group header keys cannot collide with row ids. */
export const groupKey = (group: string) => `\u0000group:${group}`;

/**
 * Flattens rows into what the grid renders. Without `getGroup`, every row is
 * an item. With it, rows are bucketed by group in order of first appearance
 * (row order inside a group is preserved) and collapsed groups contribute only
 * their header.
 */
export function buildDisplayItems<T>(
  rows: readonly T[],
  getRowId: (row: T) => string,
  getGroup?: (row: T) => string,
  collapsed: ReadonlySet<string> = new Set(),
): DataTableDisplayItem<T>[] {
  if (!getGroup) {
    return rows.map((row, rowIndex) => ({ kind: "row", key: getRowId(row), row, rowIndex }));
  }
  const buckets = new Map<string, DataTableRowItem<T>[]>();
  rows.forEach((row, rowIndex) => {
    const group = getGroup(row);
    let bucket = buckets.get(group);
    if (!bucket) buckets.set(group, (bucket = []));
    bucket.push({ kind: "row", key: getRowId(row), row, rowIndex });
  });
  const items: DataTableDisplayItem<T>[] = [];
  for (const [group, bucket] of buckets) {
    const isCollapsed = collapsed.has(group);
    items.push({ kind: "group", key: groupKey(group), group, count: bucket.length, collapsed: isCollapsed });
    if (!isCollapsed) items.push(...bucket);
  }
  return items;
}

export type SortDirection = "asc" | "desc";

export interface DataTableSort {
  columnId: string;
  direction: SortDirection;
}

/** Header click cycle: ascending, descending, unsorted. */
export function nextSort(current: DataTableSort | null, columnId: string): DataTableSort | null {
  if (!current || current.columnId !== columnId) return { columnId, direction: "asc" };
  return current.direction === "asc" ? { columnId, direction: "desc" } : null;
}

export function clampWidth(width: number, min = 48, max = 2000): number {
  return Math.min(max, Math.max(min, Math.round(width)));
}
