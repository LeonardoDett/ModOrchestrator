import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { ChevronDown, FolderOpen, FolderPlus, FolderTree, History, Info, MoreHorizontal, PackagePlus, RotateCcw, Scale, Trash2 } from "lucide-react";
import {
  Alert,
  Button,
  ButtonGroup,
  ContextMenu,
  DataTableColumnPicker,
  EmptyState,
  FeaturedIcon,
  FileDropzone,
  FilterBar,
  Input,
  Menu,
  Spinner,
  Toolbar,
  Typography,
  type ContextMenuItem,
  type DataTableRowMove,
  type DataTableSort,
} from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useCategories, useConflictIndicators, useImportQueue, useModList, useModOrder, useRuleCycle } from "../bridge/queries";
import type { ConflictIndicator, EntryRef, FileLocation, InstanceFolder, ModRow, QueueItem, Separator } from "../bridge/types";
import { ConflictEditorDialog, CycleDialog, FileWinnersDialog } from "../features/conflicts/ConflictDialogs";
import { useSettings } from "../app/settings-context";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useAction } from "../features/games/use-action";
import { ImportDecisionDialog, ImportQueuePanel } from "../features/mods/ImportQueuePanel";
import { ModInspector } from "../features/mods/ModInspector";
import { CategoriesDialog, RemoveModsDialog } from "../features/mods/ModDialogs";
import { DEFAULT_HIDDEN, ModsTable, PRIORITY_SORT, sortRows, useModColumns } from "../features/mods/ModsTable";
import { MoveToDialog, OrderHistoryDialog, RulesDialog, SeparatorDialog, useMoveMods } from "../features/mods/OrderDialogs";
import { categoryOptions, matchesStatus, type StatusFilter } from "../features/mods/mod-labels";
import { entryOf, modRows, moveRequestFor, orderedRows, type ListRow } from "../features/mods/mod-order";
import { useI18n } from "../i18n/i18n";
import { PageBody } from "./PageBody";

type ConflictFilter = "all" | "any" | "unreviewed" | "fully_overwritten";
const CONFLICT_FILTERS = ["all", "any", "unreviewed", "fully_overwritten"] as const;

/** "Conflitos ▾" filter (ui/telas/mods.md §5.1) over the backend indicators. */
function matchesConflict(c: ConflictIndicator | undefined, filter: ConflictFilter) {
  switch (filter) {
    case "all":
      return true;
    case "any":
      return Boolean(c && c.indicator !== "none");
    case "unreviewed":
      return Boolean(c && c.unreviewed > 0);
    case "fully_overwritten":
      return c?.indicator === "fully_overwritten";
  }
}

/** Elements with this property receive native file drops (main.go DragAndDrop). */
export const DROP_TARGET = { "--wails-drop-target": "drop" } as CSSProperties;

/**
 * The Mods table of one game (ui/telas/mods.md): import queue, priority and
 * separators of the active profile's ModOrder, drag with refusal and
 * alternatives (DLG-11), rules (DLG-10), reversible order history (Ctrl+Z),
 * filters, Inspector, multi-selection and dropzone.
 */
export function ModsWorkspace({ instance }: { instance: string }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const { density, get } = useSettings();
  const mods = useModList(instance);
  const order = useModOrder(instance);
  const queue = useImportQueue(instance);
  const categories = useCategories(instance);
  const { move, dialog: refusalDialog } = useMoveMods(instance);
  const indicators = useConflictIndicators(instance);
  const cycle = useRuleCycle(instance);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState("");
  const [group, setGroup] = useState("none");
  const [sort, setSort] = useState<DataTableSort | null>(PRIORITY_SORT);
  const [hidden, setHidden] = useState<string[]>(DEFAULT_HIDDEN);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [inspected, setInspected] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<QueueItem | null>(null);
  const [removing, setRemoving] = useState<string[] | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [contextRow, setContextRow] = useState<ListRow | null>(null);
  const [movingTo, setMovingTo] = useState<EntryRef[] | null>(null);
  const [separatorEdit, setSeparatorEdit] = useState<{ separator?: Separator; before?: EntryRef } | null>(null);
  const [rulesFor, setRulesFor] = useState<{ mod: string | null } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conflictFilter, setConflictFilter] = useState<ConflictFilter>("all");
  const [editingConflicts, setEditingConflicts] = useState<string | null>(null);
  const [filesPair, setFilesPair] = useState<{ a: string; b: string; focus?: FileLocation } | null>(null);
  const [cycleOpen, setCycleOpen] = useState(false);

  // Native drops (files and folders) go to the import queue (§8).
  useEffect(() => backend.onFileDrop((paths) => void run(() => backend.importFiles(instance, paths))), [backend, run, instance]);

  const rows = mods.status === "ready" ? mods.data : [];
  const modOrder = order.status === "ready" ? order.data : null;
  const items = queue.status === "ready" ? queue.data : [];
  const lastOnly = get("ui.hideTopLevelCategory")?.value === "true";
  const conflicts = useMemo<ReadonlyMap<string, ConflictIndicator>>(
    () => new Map(indicators.status === "ready" ? indicators.data.map((c) => [c.modId, c]) : []),
    [indicators],
  );

  // Separators and dragging exist only in plain priority order with nothing
  // hidden between rows (ui/telas/mods.md §5.2).
  const filtered = query.trim() !== "" || status !== "all" || category !== "" || conflictFilter !== "all";
  const byPriority = sort?.columnId === PRIORITY_SORT.columnId && sort.direction === "asc" && group === "none";
  const reorderable = byPriority && !filtered && modOrder !== null;

  // Filtering and ordering are presentation of rows the backend returned.
  const visible = useMemo<readonly ListRow[]>(() => {
    if (reorderable && modOrder) return orderedRows(rows, modOrder);
    const text = query.trim().toLowerCase();
    const matching = rows.filter(
      (r) =>
        matchesStatus(r, status) &&
        matchesConflict(conflicts.get(r.id), conflictFilter) &&
        (category === "" || (category === "\u0000none" ? r.category === "" : r.category === category)) &&
        (!text || r.name.toLowerCase().includes(text) || r.author.toLowerCase().includes(text) || r.source.toLowerCase().includes(text)),
    );
    return sortRows(modRows(matching, modOrder), sort, conflicts);
  }, [rows, modOrder, reorderable, query, status, category, sort, conflicts, conflictFilter]);

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const ids = selectedRows.map((r) => r.id);
  const selectedEntries = visible.filter((r) => selected.has(r.id)).flatMap((r) => entryOf(r) ?? []);

  // The Inspector follows the focused mod row.
  useEffect(() => {
    if (focused && rows.some((r) => r.id === focused)) setInspected(focused);
  }, [focused, rows]);
  const inspectedRow = inspected ? rows.find((r) => r.id === inspected) : undefined;

  // Ctrl+Z reverts the latest order change through history (ui/02 F-04).
  const undo = modOrder?.undo;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true], [role=dialog]")) return;
      event.preventDefault();
      if (undo) void run(() => backend.undoOrderChange(instance), { success: "mods.orderHistory.revertedToast" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, run, backend, instance]);

  const onToggle = useCallback(
    (row: ModRow, enabled: boolean) => void run(() => backend.setModsEnabled(instance, [row.id], enabled)),
    [run, backend, instance],
  );
  const onToggleSeparator = useCallback(
    (sep: Separator) => void run(() => backend.updateSeparator(instance, { ...sep, collapsed: !sep.collapsed })),
    [run, backend, instance],
  );
  const columns = useModColumns(onToggle, onToggleSeparator, lastOnly, conflicts, setEditingConflicts);
  const importFiles = () => void run(() => backend.pickImportFiles(instance, t("mods.import.pickFiles")));
  const importFolder = () => void run(() => backend.pickImportFolder(instance, t("mods.import.pickFolder")));
  const openFolder = (folder: InstanceFolder) => void run(() => backend.openInstanceFolder(instance, folder));
  const moveTo = (entries: EntryRef[], kind: "top" | "bottom") => void move({ entries, anchor: { kind, entry: {} }, mode: "exact" });

  const onRowsMove = async (request: DataTableRowMove) => {
    const req = moveRequestFor(request, visible);
    if (req) await move(req);
  };

  const contextItems: ContextMenuItem[] = (() => {
    if (!contextRow) return [];
    if (contextRow.kind === "separator") {
      const sep = contextRow.separator;
      const entry = { separator: sep.id };
      return [
        { id: "edit", label: t("mods.separator.edit"), onSelect: () => setSeparatorEdit({ separator: sep }) },
        {
          id: "collapse",
          label: t(sep.collapsed ? "mods.separator.expand" : "mods.separator.collapse", { name: sep.label }),
          onSelect: () => onToggleSeparator(sep),
        },
        { id: "enableAll", label: t("mods.separator.enableAll"), onSelect: () => void run(() => backend.setSeparatorBlockEnabled(instance, sep.id, true)) },
        { id: "disableAll", label: t("mods.separator.disableAll"), onSelect: () => void run(() => backend.setSeparatorBlockEnabled(instance, sep.id, false)) },
        { id: "top", label: t("mods.action.moveTop"), onSelect: () => moveTo([entry], "top") },
        { id: "bottom", label: t("mods.action.moveBottom"), onSelect: () => moveTo([entry], "bottom") },
        { id: "delete", label: t("mods.separator.delete"), destructive: true, onSelect: () => void run(() => backend.deleteSeparator(instance, sep.id)) },
      ];
    }
    const row = contextRow.mod;
    const entry = entryOf(contextRow);
    return [
      row.state === "installed"
        ? { id: "toggle", label: t(row.enabled ? "mods.action.disable" : "mods.action.enable"), disabled: row.queued, onSelect: () => onToggle(row, !row.enabled) }
        : { id: "install", label: t("mods.action.install"), disabled: row.queued, onSelect: () => void run(() => backend.installMods(instance, [row.id])) },
      { id: "reinstall", label: t("mods.action.reinstall"), disabled: row.state !== "installed" || row.queued, onSelect: () => void run(() => backend.reinstallMods(instance, [row.id])) },
      { id: "top", label: t("mods.action.moveTop"), disabled: !entry, onSelect: () => entry && moveTo([entry], "top") },
      { id: "bottom", label: t("mods.action.moveBottom"), disabled: !entry, onSelect: () => entry && moveTo([entry], "bottom") },
      { id: "moveTo", label: t("mods.action.moveTo"), disabled: !entry, onSelect: () => entry && setMovingTo([entry]) },
      { id: "conflicts", label: t("mods.action.editConflicts"), disabled: row.state !== "installed", onSelect: () => setEditingConflicts(row.id) },
      { id: "rules", label: t("mods.action.rules"), disabled: row.state !== "installed", onSelect: () => setRulesFor({ mod: row.id }) },
      { id: "separator", label: t("mods.action.separatorAbove"), disabled: !entry, onSelect: () => entry && setSeparatorEdit({ before: entry }) },
      { id: "open", label: t("mods.action.openFolder"), disabled: row.state !== "installed", onSelect: () => void run(() => backend.openModFolder(row.id)) },
      { id: "archive", label: t("mods.action.openArchive"), onSelect: () => void run(() => backend.openModArchive(row.id)) },
      { id: "details", label: t("mods.action.details"), onSelect: () => setInspected(row.id) },
      { id: "remove", label: t("mods.action.remove"), destructive: true, disabled: row.queued, onSelect: () => setRemoving([row.id]) },
    ];
  })();

  const dropzone = (big: boolean) => (
    <FileDropzone
      style={DROP_TARGET}
      size={big ? "default" : "compact"}
      title={t("mods.dropzone.title")}
      hint={t("mods.dropzone.hint")}
      browseLabel={t("mods.import.file")}
      onBrowse={importFiles}
      showSelection={false}
      actions={
        <Button type="button" variant="ghost" size="sm" startIcon={<FolderPlus aria-hidden="true" />} onClick={importFolder}>
          {t("mods.import.folder")}
        </Button>
      }
    />
  );

  const installedIds = (list: readonly ModRow[]) => list.filter((r) => r.state === "installed").map((r) => r.id);

  return (
    <PageBody fill>
      <div className="flex min-h-0 flex-1 flex-col gap-3" style={DROP_TARGET}>
        <Toolbar
          start={
            <>
              <ButtonGroup>
                <Button startIcon={<PackagePlus aria-hidden="true" />} onClick={importFiles}>
                  {t("mods.import.file")}
                </Button>
                <Menu.Root>
                  <Menu.Trigger>
                    <Button aria-label={t("mods.import.more")} size="icon">
                      <ChevronDown aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  </Menu.Trigger>
                  <Menu.Content>
                    <Menu.Item onSelect={importFolder}>{t("mods.import.folder")}</Menu.Item>
                  </Menu.Content>
                </Menu.Root>
              </ButtonGroup>
              <Button variant="outline" startIcon={<Scale aria-hidden="true" />} onClick={() => setRulesFor({ mod: null })}>
                {t("mods.toolbar.rules")}
              </Button>
              <Button variant="outline" startIcon={<FolderTree aria-hidden="true" />} onClick={() => setCategoriesOpen(true)}>
                {t("mods.toolbar.categories")}
              </Button>
              <Button variant="outline" startIcon={<History aria-hidden="true" />} onClick={() => setHistoryOpen(true)}>
                {t("mods.toolbar.history")}
              </Button>
            </>
          }
          end={
            <>
              <Menu.Root>
                <Menu.Trigger>
                  <Button variant="outline" startIcon={<FolderOpen aria-hidden="true" />}>
                    {t("mods.toolbar.open")}
                  </Button>
                </Menu.Trigger>
                <Menu.Content>
                  <Menu.Item onSelect={() => openFolder("game")}>{t("mods.open.game")}</Menu.Item>
                  <Menu.Item onSelect={() => openFolder("staging")}>{t("mods.open.staging")}</Menu.Item>
                  <Menu.Item onSelect={() => openFolder("archives")}>{t("mods.open.archives")}</Menu.Item>
                  {inspectedRow?.state === "installed" ? (
                    <Menu.Item onSelect={() => void run(() => backend.openModFolder(inspectedRow.id))}>{t("mods.open.mod", { name: inspectedRow.name })}</Menu.Item>
                  ) : null}
                </Menu.Content>
              </Menu.Root>
              <Menu.Root placement="bottom-end">
                <Menu.Trigger>
                  <Button variant="ghost" size="icon" aria-label={t("mods.toolbar.more")}>
                    <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </Menu.Trigger>
                <Menu.Content>
                  <Menu.Item onSelect={() => setSeparatorEdit({})}>{t("mods.action.newSeparator")}</Menu.Item>
                </Menu.Content>
              </Menu.Root>
            </>
          }
        />

        <ImportQueuePanel items={items} onDecide={setDeciding} />

        {cycle.status === "ready" && cycle.data ? (
          <Alert.Root variant="danger">
            <Alert.Title>{t("conflicts.cycle.bannerTitle")}</Alert.Title>
            <Alert.Description>
              {t("conflicts.cycle.banner", { cycle: [...cycle.data.mods, cycle.data.mods[0]!].map((m) => m.name).join(" → ") })}
            </Alert.Description>
            <Button size="sm" variant="outline" onClick={() => setCycleOpen(true)}>
              {t("conflicts.cycle.open")}
            </Button>
          </Alert.Root>
        ) : null}

        {mods.status === "error" ? <ErrorAlert title="mods.loadError" error={mods.error} onRetry={mods.reload} /> : null}
        {order.status === "error" ? <ErrorAlert title="mods.loadError" error={order.error} onRetry={order.reload} /> : null}
        {mods.status === "loading" ? <Spinner label={t("common.loading")} /> : null}

        {mods.status === "ready" && rows.length === 0 ? (
          <EmptyState.Root className="rounded-xl border border-border bg-surface">
            <EmptyState.Icon>
              <FeaturedIcon icon={PackagePlus} color="neutral" />
            </EmptyState.Icon>
            <EmptyState.Title>{t("mods.emptyTitle")}</EmptyState.Title>
            <EmptyState.Description>{t("mods.emptyDescription")}</EmptyState.Description>
            <EmptyState.Actions>{dropzone(true)}</EmptyState.Actions>
          </EmptyState.Root>
        ) : null}

        {mods.status === "ready" && rows.length > 0 ? (
          <>
            <FilterBar
              className="rounded-xl border"
              query={query}
              onQueryChange={setQuery}
              queryPlaceholder={t("mods.filter.search")}
              filters={
                <>
                  <Input.Root value={status} onChange={(v: string) => setStatus(v as StatusFilter)}>
                    <Input.Select
                      aria-label={t("mods.filter.status")}
                      options={(["all", "enabled", "disabled", "notInstalled"] as const).map((s) => ({ value: s, label: t(`mods.filter.status.${s}`) }))}
                    />
                  </Input.Root>
                  <Input.Root value={category} onChange={setCategory}>
                    <Input.Select
                      aria-label={t("mods.filter.category")}
                      options={[
                        { value: "", label: t("mods.filter.category.all") },
                        { value: "\u0000none", label: t("mods.noCategory") },
                        ...(categories.status === "ready" ? categoryOptions(categories.data) : []),
                      ]}
                    />
                  </Input.Root>
                  <Input.Root value={conflictFilter} onChange={(v: string) => setConflictFilter(v as ConflictFilter)}>
                    <Input.Select
                      aria-label={t("mods.filter.conflicts")}
                      options={CONFLICT_FILTERS.map((c) => ({ value: c, label: t(`mods.filter.conflicts.${c}`) }))}
                    />
                  </Input.Root>
                  <Input.Root value={group} onChange={setGroup}>
                    <Input.Select
                      aria-label={t("mods.filter.group")}
                      options={[
                        { value: "none", label: t("mods.filter.group.none") },
                        { value: "category", label: t("mods.filter.group.category") },
                      ]}
                    />
                  </Input.Root>
                </>
              }
              actions={<DataTableColumnPicker label={t("table.columns")} columns={columns} hiddenColumns={hidden} onHiddenColumnsChange={setHidden} />}
            />

            {!reorderable && modOrder ? (
              <div role="note" className="flex items-center gap-2 px-1 text-sm text-fg-muted">
                <Info aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span>{t(byPriority ? "mods.reorder.filtered" : "mods.reorder.notByPriority")}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSort(PRIORITY_SORT);
                    setGroup("none");
                    setQuery("");
                    setStatus("all");
                    setCategory("");
                    setConflictFilter("all");
                  }}
                >
                  {t("mods.reorder.reset")}
                </Button>
              </div>
            ) : null}

            {selected.size >= 2 ? (
              <div role="toolbar" aria-label={t("mods.multi.label")} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-raised px-3 py-2">
                <Typography variant="body-sm" color="fg" className="mr-2">
                  {tp("mods.multi.selected", selected.size)}
                </Typography>
                <Button size="sm" variant="outline" onClick={() => void run(() => backend.setModsEnabled(instance, installedIds(selectedRows), true))}>
                  {t("mods.action.enable")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => void run(() => backend.setModsEnabled(instance, installedIds(selectedRows), false))}>
                  {t("mods.action.disable")}
                </Button>
                <Button size="sm" variant="outline" disabled={selectedEntries.length === 0} onClick={() => setMovingTo(selectedEntries)}>
                  {t("mods.action.moveTo")}
                </Button>
                <Input.Root value="" onChange={(v: string) => void run(() => backend.setModsCategory(instance, ids, v === "\u0000none" ? "" : v))}>
                  <Input.Select
                    aria-label={t("mods.multi.category")}
                    placeholder={t("mods.multi.category")}
                    options={[{ value: "\u0000none", label: t("mods.noCategory") }, ...(categories.status === "ready" ? categoryOptions(categories.data) : [])]}
                  />
                </Input.Root>
                <Button size="sm" variant="outline" startIcon={<RotateCcw aria-hidden="true" />} onClick={() => void run(() => backend.reinstallMods(instance, installedIds(selectedRows)))}>
                  {t("mods.action.reinstall")}
                </Button>
                <Button size="sm" variant="outline" tone="danger" startIcon={<Trash2 aria-hidden="true" />} disabled={ids.length === 0} onClick={() => setRemoving(ids)}>
                  {t("mods.action.remove")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  {t("mods.multi.clear")}
                </Button>
              </div>
            ) : null}

            <div className="flex min-h-0 flex-1 gap-4">
              <ContextMenu items={contextItems} className="flex min-h-0 min-w-0 flex-1 flex-col">
                <ModsTable
                  rows={visible}
                  sort={sort}
                  onSortChange={setSort}
                  hidden={hidden}
                  selected={selected}
                  onSelectedChange={setSelected}
                  onFocusedChange={setFocused}
                  onToggle={onToggle}
                  onToggleSeparator={onToggleSeparator}
                  onActivate={(row) => (row.kind === "mod" ? setInspected(row.mod.id) : setSeparatorEdit({ separator: row.separator }))}
                  onContextMenu={setContextRow}
                  reorderable={reorderable}
                  onRowsMove={onRowsMove}
                  categoryLastOnly={lastOnly}
                  conflicts={conflicts}
                  onOpenConflicts={setEditingConflicts}
                  density={density}
                  groupByCategory={group === "category"}
                  empty={
                    <div className="flex flex-col items-center gap-2 p-6 text-sm text-fg-muted">
                      {t("mods.filter.noMatch")}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setQuery("");
                          setStatus("all");
                          setCategory("");
                          setConflictFilter("all");
                        }}
                      >
                        {t("mods.filter.clear")}
                      </Button>
                    </div>
                  }
                />
              </ContextMenu>
              {inspectedRow ? <ModInspector
                  instance={instance}
                  id={inspectedRow.id}
                  onClose={() => setInspected(null)}
                  onRemove={setRemoving}
                  onEditConflicts={setEditingConflicts}
                  onChooseWinner={setFilesPair}
                /> : null}
            </div>
            {dropzone(false)}
          </>
        ) : null}
      </div>

      <ImportDecisionDialog item={deciding ? (items.find((i) => i.operationId === deciding.operationId) ?? null) : null} onClose={() => setDeciding(null)} />
      <RemoveModsDialog
        instance={instance}
        ids={removing}
        onClose={() => {
          setRemoving(null);
          setSelected(new Set());
          if (inspected && removing?.includes(inspected)) setInspected(null);
        }}
      />
      <CategoriesDialog instance={instance} open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
      <MoveToDialog entries={movingTo} mods={rows} order={modOrder} onMove={move} onClose={() => setMovingTo(null)} />
      <SeparatorDialog instance={instance} editing={separatorEdit} onClose={() => setSeparatorEdit(null)} />
      <RulesDialog instance={instance} open={rulesFor !== null} mods={rows} focusMod={rulesFor?.mod ?? null} onClose={() => setRulesFor(null)} />
      <OrderHistoryDialog instance={instance} open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <ConflictEditorDialog instance={instance} mod={editingConflicts} onClose={() => setEditingConflicts(null)} onFiles={(a, b) => setFilesPair({ a, b })} />
      <FileWinnersDialog instance={instance} pair={filesPair} onClose={() => setFilesPair(null)} />
      <CycleDialog instance={instance} open={cycleOpen} onClose={() => setCycleOpen(false)} />
      {refusalDialog}
    </PageBody>
  );
}
