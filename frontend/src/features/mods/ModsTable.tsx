import { useMemo } from "react";
import { ChevronDown, ChevronRight, GitBranch, Palette, StickyNote } from "lucide-react";
import {
  DataTable,
  Indicator,
  StatusToggle,
  Tag,
  TONES,
  type DataTableColumn,
  type DataTableRowMove,
  type DataTableSort,
  type Tone,
} from "dettmann-ui";
import type { ConflictIndicator, ModRow, Separator } from "../../bridge/types";
import { ConflictIndicatorCell } from "../conflicts/conflict-labels";
import type { Density } from "../../app/settings-context";
import { useI18n } from "../../i18n/i18n";
import { categoryText, contentLabel, formatSize, toggleLabels, toggleState } from "./mod-labels";
import type { ListRow } from "./mod-order";

/** Columns shown by default (ui/telas/mods.md §5.1, without the F9 ones). */
export const DEFAULT_HIDDEN = ["type", "content", "author", "installedAt", "enabledAt", "source", "variant"];

/** The default and only reorderable ordering: priority, lowest first (§5.2). */
export const PRIORITY_SORT: DataTableSort = { columnId: "priority", direction: "asc" };

const SORT_KEYS: Record<string, (row: Extract<ListRow, { kind: "mod" }>) => string | number> = {
  status: ({ mod: r }) => (r.state !== "installed" ? 2 : r.enabled ? 0 : 1),
  priority: (r) => r.priority ?? Number.MAX_SAFE_INTEGER,
  name: ({ mod: r }) => r.name.toLowerCase(),
  version: ({ mod: r }) => r.version.toLowerCase(),
  category: ({ mod: r }) => r.categoryPath.join("/").toLowerCase(),
  size: ({ mod: r }) => r.size,
  type: ({ mod: r }) => r.typeName.toLowerCase(),
  author: ({ mod: r }) => r.author.toLowerCase(),
  installedAt: ({ mod: r }) => r.installedAt ?? "",
  enabledAt: ({ mod: r }) => r.enabledAt ?? "",
  source: ({ mod: r }) => r.source.toLowerCase(),
  variant: ({ mod: r }) => (r.variantLabel ?? "").toLowerCase(),
};

/** Presentation-only ordering of mod rows the backend already returned. */
export function sortRows(rows: readonly ListRow[], sort: DataTableSort | null, conflicts: ReadonlyMap<string, ConflictIndicator> = new Map()): readonly ListRow[] {
  if (!sort) return rows;
  const key =
    sort.columnId === "conflicts"
      ? (r: Extract<ListRow, { kind: "mod" }>) => INDICATOR_RANK[conflicts.get(r.mod.id)?.indicator ?? "none"]
      : SORT_KEYS[sort.columnId];
  if (!key) return rows;
  const mods = rows.filter((r): r is Extract<ListRow, { kind: "mod" }> => r.kind === "mod");
  const sorted = [...mods].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    return typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
  });
  return sort.direction === "desc" ? sorted.reverse() : sorted;
}

interface ModsTableProps {
  rows: readonly ListRow[];
  sort: DataTableSort | null;
  onSortChange: (sort: DataTableSort | null) => void;
  hidden: readonly string[];
  selected: ReadonlySet<string>;
  onSelectedChange: (ids: ReadonlySet<string>) => void;
  onFocusedChange: (id: string | null) => void;
  onToggle: (row: ModRow, enabled: boolean) => void;
  onToggleSeparator: (separator: Separator) => void;
  onActivate: (row: ListRow) => void;
  onContextMenu: (row: ListRow) => void;
  /** Whether rows can be dragged now (priority order, nothing hidden). */
  reorderable: boolean;
  onRowsMove: (move: DataTableRowMove) => Promise<unknown>;
  categoryLastOnly: boolean;
  conflicts: ReadonlyMap<string, ConflictIndicator>;
  onOpenConflicts: (mod: string) => void;
  density: Density;
  groupByCategory: boolean;
  empty?: React.ReactNode;
}

/** Sort order of the conflict indicator: most worrying first. */
const INDICATOR_RANK = { fully_overwritten: 0, loses_all: 1, mixed: 2, wins_all: 3, redundant_only: 4, none: 5 } as const;

export function useModColumns(
  onToggle: (row: ModRow, enabled: boolean) => void,
  onToggleSeparator: (separator: Separator) => void,
  categoryLastOnly: boolean,
  conflicts: ReadonlyMap<string, ConflictIndicator> = new Map(),
  onOpenConflicts: (mod: string) => void = () => {},
) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  return useMemo<DataTableColumn<ListRow>[]>(() => {
    const states = toggleLabels(i18n);
    const mod = (render: (row: ModRow, list: Extract<ListRow, { kind: "mod" }>) => React.ReactNode) => (row: ListRow) =>
      row.kind === "mod" ? render(row.mod, row) : null;
    return [
      {
        id: "status",
        label: t("mods.column.status"),
        width: 84,
        sortable: true,
        hideable: false,
        // The span keeps a toggle click from also changing the row selection.
        cell: mod((row) => (
          <span onClick={(e) => e.stopPropagation()}>
            <StatusToggle
              state={toggleState(row)}
              label={t("mods.toggleLabel", { name: row.name })}
              stateLabels={states}
              onCheckedChange={(next) => onToggle(row, next)}
            />
          </span>
        )),
      },
      {
        id: "priority",
        label: t("mods.column.priority"),
        header: <span title={t("mods.column.priorityHelp")}>{t("mods.column.priorityShort")}</span>,
        width: 64,
        numeric: true,
        sortable: true,
        hideable: false,
        cell: mod((_, r) => (r.priority != null ? r.priority : "")),
      },
      {
        id: "name",
        label: t("mods.column.name"),
        width: 320,
        grow: true,
        sortable: true,
        hideable: false,
        cell: (row) =>
          row.kind === "separator" ? (
            <span className="flex min-w-0 items-center gap-2 font-medium text-fg">
              <button
                type="button"
                aria-expanded={!row.separator.collapsed}
                aria-label={t(row.separator.collapsed ? "mods.separator.expand" : "mods.separator.collapse", { name: row.separator.label })}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSeparator(row.separator);
                }}
              >
                {row.separator.collapsed ? <ChevronRight aria-hidden="true" className="h-4 w-4" /> : <ChevronDown aria-hidden="true" className="h-4 w-4" />}
              </button>
              {row.separator.color ? <Indicator icon={Palette} tone={asTone(row.separator.color)} label={t("mods.separator.colored")} /> : null}
              <span className="truncate">{row.separator.label}</span>
              <span className="shrink-0 text-xs font-normal text-fg-muted">
                {tp("mods.separator.count", row.separator.total, { enabled: row.separator.enabled })}
              </span>
            </span>
          ) : (
            <span className={`flex min-w-0 items-center gap-2 ${row.mod.state !== "installed" ? "italic text-fg-muted" : row.mod.enabled ? "" : "text-fg-muted"}`}>
              {row.mod.highlight ? <Indicator icon={Palette} tone={asTone(row.mod.highlight)} label={t("mods.highlighted")} /> : null}
              <span className="truncate">{row.mod.name}</span>
              {row.mod.variantLabel ? <Tag size="sm">{row.mod.variantLabel}</Tag> : null}
              {row.mod.hasNotes ? <Indicator icon={StickyNote} tone="subtle" label={t("mods.hasNotes")} /> : null}
            </span>
          ),
      },
      { id: "version", label: t("mods.column.version"), width: 110, sortable: true, cell: mod((row) => row.version || t("common.empty")) },
      {
        id: "category",
        label: t("mods.column.category"),
        width: 180,
        sortable: true,
        cell: mod((row) => categoryText(row, categoryLastOnly) || <span className="text-fg-subtle">{t("mods.noCategory")}</span>),
      },
      {
        id: "conflicts",
        label: t("mods.column.conflicts"),
        width: 110,
        sortable: true,
        cell: mod((row) => <ConflictIndicatorCell value={conflicts.get(row.id)} onOpen={() => onOpenConflicts(row.id)} />),
      },
      {
        id: "size",
        label: t("mods.column.size"),
        width: 120,
        numeric: true,
        align: "end",
        sortable: true,
        cell: mod((row) => (row.state === "installed" ? formatSize(i18n.language, row.size) : t("common.empty"))),
      },
      { id: "type", label: t("mods.column.type"), width: 120, sortable: true, cell: mod((row) => row.typeName || row.type) },
      {
        id: "content",
        label: t("mods.column.content"),
        width: 200,
        cell: mod((row) => {
          const shown = row.content.slice(0, 4).map((f) => contentLabel(i18n, f));
          const more = row.content.length - shown.length;
          return (
            <span className="truncate" title={row.content.map((f) => contentLabel(i18n, f)).join(", ")}>
              {shown.join(", ")}
              {more > 0 ? ` +${more}` : ""}
            </span>
          );
        }),
      },
      { id: "author", label: t("mods.column.author"), width: 140, sortable: true, cell: mod((row) => row.author || t("common.empty")) },
      { id: "installedAt", label: t("mods.column.installedAt"), width: 170, sortable: true, cell: mod((row) => i18n.formatDateTime(row.installedAt)) },
      { id: "enabledAt", label: t("mods.column.enabledAt"), width: 170, sortable: true, cell: mod((row) => i18n.formatDateTime(row.enabledAt)) },
      { id: "source", label: t("mods.column.source"), width: 220, sortable: true, cell: mod((row) => <span className="truncate" title={row.source}>{row.source}</span>) },
      {
        id: "variant",
        label: t("mods.column.variant"),
        width: 140,
        sortable: true,
        cell: mod((row) =>
          row.variantLabel ? (
            <span className="flex items-center gap-1">
              <GitBranch aria-hidden="true" className="h-3.5 w-3.5 text-fg-muted" />
              {row.variantLabel}
            </span>
          ) : (
            t("common.empty")
          ),
        ),
      },
    ];
  }, [i18n, t, tp, onToggle, onToggleSeparator, categoryLastOnly, conflicts, onOpenConflicts]);
}

/** The Mods table (ui/telas/mods.md §5) over the lib DataTable (L1, L2). */
export function ModsTable(props: ModsTableProps) {
  const { t } = useI18n();
  const columns = useModColumns(props.onToggle, props.onToggleSeparator, props.categoryLastOnly, props.conflicts, props.onOpenConflicts);
  return (
    <DataTable
      aria-label={t("mods.tableLabel")}
      className="min-h-0 flex-1"
      columns={columns}
      rows={props.rows}
      getRowId={(row) => row.id}
      hiddenColumns={props.hidden}
      sort={props.sort}
      onSortChange={props.onSortChange}
      density={props.density}
      selectionMode="multiple"
      selectedIds={props.selected}
      onSelectedIdsChange={props.onSelectedChange}
      onFocusedIdChange={props.onFocusedChange}
      onRowActivate={props.onActivate}
      onRowContextMenu={(_, row) => props.onContextMenu(row)}
      getGroup={props.groupByCategory ? (row) => (row.kind === "mod" ? row.mod.categoryPath.join(" › ") || t("mods.noCategory") : "") : undefined}
      rowClassName={(row) =>
        row.kind === "separator" ? "bg-structure" : row.mod.highlight ? "border-l-2 border-l-tone" : undefined
      }
      reorderable={props.reorderable ? (row) => row.kind === "separator" || row.priority != null : false}
      onRowsMove={props.onRowsMove}
      empty={props.empty}
      labels={{ resizeColumn: t("table.resizeColumn"), loading: t("common.loading"), dragHandle: t("mods.dragHandle"), moving: t("mods.moving") }}
    />
  );
}

/** Highlight colours are tones of the theme palette (ui/04 §2). */
export function asTone(value?: string): Tone | undefined {
  return (TONES as readonly string[]).includes(value ?? "") ? (value as Tone) : undefined;
}
