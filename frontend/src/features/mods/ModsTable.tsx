import { useMemo } from "react";
import { DataTable, Icon, Switch, Tag, type DataTableColumn } from "dettmann-ui";
import type { ConflictIndicator, ModRow, TagInfo } from "../../bridge/types";
import { useI18n, type Translator } from "../../i18n/i18n";
import { categoryText, formatSize } from "./mod-labels";
import { categoryIcon, paletteColor } from "./category-look";
import type { ListRow } from "./mod-order";

export type ModsView = "list" | "nested" | "tabs";

/** Rows in the order of the active profile: priority ascending, mods outside the order last. */
export function byPriority(rows: readonly ListRow[]): ListRow[] {
  const key = (r: ListRow) => (r.kind === "mod" ? (r.priority ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER);
  return [...rows].sort((a, b) => key(a) - key(b));
}

/** The text and the meaning of the Conflitos cell (board JogoMods). */
export function conflictCell(i18n: Translator, row: ModRow, c: ConflictIndicator | undefined): { text: string; intent?: "success" | "warning" | "info" } {
  const { t } = i18n;
  if (row.state === "installing") return { text: t("mods.conflict.installing"), intent: "info" };
  if (row.queued || row.state === "imported") return { text: t("mods.conflict.queued") };
  if (!c || c.indicator === "none" || c.indicator === "redundant_only") return { text: t("mods.conflict.none") };
  if (c.unreviewed > 0) return { text: t("mods.conflict.toDecide", { count: c.unreviewed }), intent: "warning" };
  const wins = c.winsAgainst ?? 0;
  const loses = c.losesTo ?? 0;
  if (wins > 0 && loses > 0) return { text: t("mods.conflict.mixed", { wins, loses }) };
  if (wins > 0) return { text: t("mods.conflict.wins", { count: wins }), intent: "success" };
  return { text: t("mods.conflict.loses", { count: loses }), intent: "warning" };
}

interface ModsTableProps {
  rows: readonly ListRow[];
  view: ModsView;
  selected: ReadonlySet<string>;
  onSelectedChange: (ids: ReadonlySet<string>) => void;
  onFocusedChange: (id: string | null) => void;
  onToggle: (row: ModRow, enabled: boolean) => void;
  onActivate: (row: ListRow) => void;
  onContextMenu: (row: ListRow) => void;
  /** Keys on the focused row that the table itself does not use (Space, Delete, Shift+F10). */
  onRowKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>, row: ListRow) => void;
  categoryLastOnly: boolean;
  conflicts: ReadonlyMap<string, ConflictIndicator>;
  /** Tag definitions by lower-case name, for their colors (D123). */
  tagDefs: ReadonlyMap<string, TagInfo>;
  /** Nested view: the group of a row and its header (category tile, name, counts). */
  groupOf?: (row: ListRow) => string;
  renderGroup?: (group: string, count: number) => React.ReactNode;
  /** Abas view: the table sits inside a card under the tabs. */
  embedded?: boolean;
  empty?: React.ReactNode;
  /** Columns the user hid (Mais ações › Colunas da lista). */
  hiddenColumns?: readonly string[];
}

/** The colored square with the category icon (boards JogoMods and JogoModsAninhada). */
export function CategoryTile({ color, icon }: { color?: string; icon?: string }) {
  const c = paletteColor(color);
  const glyph = categoryIcon(icon);
  return (
    <span
      data-category={c}
      className={`flex size-5.5 shrink-0 items-center justify-center rounded-chip ${c ? "bg-intent-subtle text-intent-text" : "bg-sunken text-fg-muted"}`}
    >
      {glyph ? <Icon icon={glyph} size="xs" /> : null}
    </span>
  );
}

/**
 * The Mods table (ui/telas/mods.md §5, board JogoMods): Ativo, Mod (name and
 * tags underneath), Categoria (only in the list), Conflitos, Atualizado and
 * Tamanho, in rows of 54 px. The order is the priority of the active profile.
 */
export function ModsTable(props: ModsTableProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const { view, conflicts, tagDefs, onToggle, categoryLastOnly } = props;
  const columns = useMemo<DataTableColumn<ListRow>[]>(() => {
    const mod = (render: (row: ModRow) => React.ReactNode) => (row: ListRow) => (row.kind === "mod" ? render(row.mod) : null);
    const out: DataTableColumn<ListRow>[] = [
      {
        id: "status",
        label: t("mods.column.active"),
        width: 68,
        hideable: false,
        // The span keeps a toggle click from also changing the row selection.
        cell: mod((row) => (
          <span onClick={(e) => e.stopPropagation()} className="flex items-center">
            <Switch
              size="xs"
              checked={row.state === "installed" && row.enabled}
              disabled={row.state !== "installed" || row.queued}
              aria-label={t(row.state === "installed" && row.enabled ? "mods.toggle.disable" : "mods.toggle.enable", { name: row.name })}
              onCheckedChange={(next) => onToggle(row, next)}
            />
          </span>
        )),
      },
      {
        id: "name",
        label: t("mods.column.mod"),
        width: 320,
        grow: true,
        hideable: false,
        cell: mod((row) => {
          const tags = row.tags ?? [];
          return (
            <span className="flex min-w-0 flex-col gap-1.25">
              <span className={`truncate font-medium ${row.state === "installed" && row.enabled ? "text-fg" : "text-fg-muted"}`}>{row.name}</span>
              <span className="flex min-h-4.5 items-center gap-1.5 overflow-hidden">
                {tags.length === 0 ? (
                  <span className="text-xs text-fg-subtle">{t("mods.noTags")}</span>
                ) : (
                  tags.map((g) => {
                    const c = paletteColor(tagDefs.get(g.toLowerCase())?.color);
                    return (
                      <Tag key={g} size="xs" dot {...(c ? { color: c } : {})}>
                        {g}
                      </Tag>
                    );
                  })
                )}
              </span>
            </span>
          );
        }),
      },
    ];
    if (view === "list") {
      out.push({
        id: "category",
        label: t("mods.column.category"),
        width: 206,
        cell: mod((row) =>
          row.categoryPath.length > 0 ? (
            <span className="flex min-w-0 items-center gap-2">
              <CategoryTile color={row.categoryColor} icon={row.categoryIcon} />
              <span className="truncate text-fg">{categoryText(row, categoryLastOnly)}</span>
            </span>
          ) : (
            <span className="text-fg-subtle">{t("mods.noCategory")}</span>
          ),
        ),
      });
    }
    out.push(
      {
        id: "conflicts",
        label: t("mods.column.conflicts"),
        width: view === "list" ? 166 : 176,
        cell: mod((row) => {
          const c = conflictCell(i18n, row, conflicts.get(row.id));
          return (
            <span data-intent={c.intent} className={c.intent ? "text-intent-text" : c.text === t("mods.conflict.none") ? "text-fg-subtle" : "text-fg-muted"}>
              {c.text}
            </span>
          );
        }),
      },
      {
        id: "updated",
        label: t("mods.column.updated"),
        width: view === "list" ? 136 : 146,
        cell: mod((row) => (
          <span className="text-fg-muted" title={i18n.formatAbsolute(row.installedAt)}>
            {i18n.formatAgo(row.installedAt)}
          </span>
        )),
      },
      {
        id: "size",
        label: t("mods.column.size"),
        width: 96,
        align: "end",
        cell: mod((row) => <span className="text-fg-muted">{row.state === "installed" ? formatSize(i18n.language, row.size) : t("common.empty")}</span>),
      },
    );
    return out;
  }, [i18n, t, view, conflicts, tagDefs, onToggle, categoryLastOnly]);

  return (
    <DataTable
      aria-label={t("mods.tableLabel")}
      className={props.embedded ? "min-h-0 flex-1 rounded-none border-0" : "min-h-0 flex-1"}
      columns={columns}
      rows={props.rows}
      getRowId={(row) => row.id}
      hiddenColumns={props.hiddenColumns}
      density="relaxed"
      selectionMode="multiple"
      selectedIds={props.selected}
      onSelectedIdsChange={props.onSelectedChange}
      onFocusedIdChange={props.onFocusedChange}
      onRowActivate={props.onActivate}
      onRowContextMenu={(_, row) => props.onContextMenu(row)}
      onRowKeyDown={props.onRowKeyDown}
      getGroup={props.groupOf}
      renderGroupHeader={props.renderGroup ? (g) => props.renderGroup!(g.group, g.count) : undefined}
      empty={props.empty}
      labels={{ resizeColumn: t("table.resizeColumn"), loading: t("common.loading"), dragHandle: t("mods.dragHandle"), moving: t("mods.moving") }}
    />
  );
}
