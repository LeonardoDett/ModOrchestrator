import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Eraser, FolderInput, HardDrive, LayoutList, ListChecks, ListTree, PanelsTopLeft } from "lucide-react";
import { FolderPlusIcon, InfoIcon, MoreHorizontalIcon, PackageIcon, PackagePlusIcon, RocketIcon, TrashIcon, UndoIcon } from "dettmann-ui/icons";
import { ActionBar, Alert, Button, ContextMenu, DataTableColumnPicker, EmptyState, FeaturedIcon, FileDropzone, FilterBar, Icon, Indicator, Input, Menu, SegmentedControl, Tabs, Typography, useToast, type ContextMenuItem, type DataTableRowMove, type DataTableSort } from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useCategories, useConflictIndicators, useImportQueue, useInstanceSettings, useModList, useModOrder, useRuleCycle, useTags } from "../bridge/queries";
import type { ConflictIndicator, EntryRef, FileLocation, InstanceFolder, ModRow, QueueItem, Separator } from "../bridge/types";
import { ConflictEditorDialog, CycleDialog, FileWinnersDialog } from "../features/conflicts/ConflictDialogs";
import { useSettings } from "../app/settings-context";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useAction } from "../features/games/use-action";
import { ImportDecisionDialog } from "../features/mods/ImportDecisionDialog";
import { InstallQueueDialog, waitingMods } from "../features/mods/InstallQueueDialog";
import { ModDetailDialog } from "../features/mods/ModDetailDialog";
import { RemoveModsDialog } from "../features/mods/ModDialogs";
import { OrganizationDialog, type OrganizationTab } from "../features/mods/OrganizationDialog";
import { DEFAULT_HIDDEN, ModsTable, PRIORITY_SORT, sortRows, useModColumns } from "../features/mods/ModsTable";
import { MoveToDialog, OrderHistoryDialog, RulesDialog, SeparatorDialog, useMoveMods } from "../features/mods/OrderDialogs";
import { categoryOptions, formatSize, matchesStatus } from "../features/mods/mod-labels";
import { categoryIcon, paletteColor, tagIndex, topLevel } from "../features/mods/category-look";
import { entryOf, modRows, moveRequestFor, orderedRows, type ListRow } from "../features/mods/mod-order";
import { useDeploy } from "../features/deploy/DeployContext";
import { ProblemBand } from "../features/diagnostics/ProblemBand";
import { useI18n } from "../i18n/i18n";
import { useNavigation } from "../shell/navigation";
import { BusyBand, LoadingState, NoMatch, PageBody } from "./PageBody";

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

/** Quick filter of the list (board JogoMods): all, enabled, disabled. */
type QuickFilter = "all" | "enabled" | "disabled";

/** The three views of the list (D123, setting mods.view). Only the list reorders priority. */
type ModsView = "list" | "nested" | "tabs";
const VIEWS = ["list", "nested", "tabs"] as const;
const VIEW_ICONS = { list: LayoutList, nested: ListTree, tabs: PanelsTopLeft } as const;

/** Tab of the Abas view: every mod, a top-level category, or mods without one. */
const ALL_TAB = "\u0000all";
const NO_CATEGORY = "\u0000none";

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
  const { addToast } = useToast();
  const { navigate, route } = useNavigation();
  const { density, get } = useSettings();
  const mods = useModList(instance);
  const order = useModOrder(instance);
  const queue = useImportQueue(instance);
  const categories = useCategories(instance);
  const { move, dialog: refusalDialog } = useMoveMods(instance);
  const indicators = useConflictIndicators(instance);
  const cycle = useRuleCycle(instance);
  const tags = useTags(instance);
  const instanceSettings = useInstanceSettings(instance);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<QuickFilter>(route.filter === "enabled" || route.filter === "disabled" ? route.filter : "all");
  useEffect(() => {
    if (route.filter === "enabled" || route.filter === "disabled") setStatus(route.filter);
  }, [route.filter]);
  const [category, setCategory] = useState("");
  const savedView = instanceSettings.status === "ready" ? instanceSettings.data.find((s) => s.key === "mods.view")?.value : undefined;
  const [view, setView] = useState<ModsView>("list");
  useEffect(() => {
    if (savedView === "list" || savedView === "nested" || savedView === "tabs") setView(savedView);
  }, [savedView]);
  const changeView = (next: ModsView) => {
    setView(next);
    void run(() => backend.setInstanceSetting(instance, "mods.view", next), { quiet: true });
  };
  const [tab, setTab] = useState(ALL_TAB);
  const [sort, setSort] = useState<DataTableSort | null>(PRIORITY_SORT);
  const [hidden, setHidden] = useState<string[]>(DEFAULT_HIDDEN);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [inspected, setInspected] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<QueueItem | null>(null);
  const [removing, setRemoving] = useState<string[] | null>(null);
  const [organizing, setOrganizing] = useState<OrganizationTab | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
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
  const cats = categories.status === "ready" ? categories.data : [];
  const tagDefs = useMemo(() => tagIndex(tags.status === "ready" ? tags.data : []), [tags]);
  const waiting = waitingMods(rows);
  const asking = items.filter((i) => i.decision);
  const enabledCount = rows.filter((r) => r.state === "installed" && r.enabled).length;
  const diskSize = rows.reduce((sum, r) => sum + (r.state === "installed" ? r.size : 0), 0);
  const conflicts = useMemo<ReadonlyMap<string, ConflictIndicator>>(
    () => new Map(indicators.status === "ready" ? indicators.data.map((c) => [c.modId, c]) : []),
    [indicators],
  );

  // Separators and dragging exist only in plain priority order with nothing
  // hidden between rows (ui/telas/mods.md §5.2).
  const filtered = query.trim() !== "" || status !== "all" || category !== "" || conflictFilter !== "all" || (view === "tabs" && tab !== ALL_TAB);
  const byPriority = sort?.columnId === PRIORITY_SORT.columnId && sort.direction === "asc" && view === "list";
  const reorderable = byPriority && !filtered && modOrder !== null;

  // Filtering and ordering are presentation of rows the backend returned.
  const visible = useMemo<readonly ListRow[]>(() => {
    if (reorderable && modOrder) return orderedRows(rows, modOrder);
    const text = query.trim().toLowerCase();
    const matching = rows.filter(
      (r) =>
        matchesStatus(r, status) &&
        matchesConflict(conflicts.get(r.id), conflictFilter) &&
        (category === "" || (category === NO_CATEGORY ? r.category === "" : r.category === category)) &&
        (view !== "tabs" || tab === ALL_TAB || (tab === NO_CATEGORY ? r.category === "" : topLevel(cats, r.category)?.id === tab)) &&
        (!text ||
          r.name.toLowerCase().includes(text) ||
          r.author.toLowerCase().includes(text) ||
          r.source.toLowerCase().includes(text) ||
          (r.tags ?? []).some((g) => g.toLowerCase().includes(text))),
    );
    return sortRows(modRows(matching, modOrder), sort, conflicts);
  }, [rows, modOrder, reorderable, query, status, category, sort, conflicts, conflictFilter, view, tab, cats]);

  // Tabs of the Abas view: the top-level categories with their counts.
  const tabs = useMemo(() => {
    const counts = new Map<string, number>();
    let none = 0;
    for (const r of rows) {
      const top = r.category ? topLevel(cats, r.category) : undefined;
      if (top) counts.set(top.id, (counts.get(top.id) ?? 0) + 1);
      else none++;
    }
    const top = cats.filter((c) => !c.parent || !cats.some((p) => p.id === c.parent));
    return { top, counts, none };
  }, [rows, cats]);
  const resetFilters = () => {
    setQuery("");
    setStatus("all");
    setCategory("");
    setConflictFilter("all");
    setTab(ALL_TAB);
  };

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const ids = selectedRows.map((r) => r.id);
  const selectedEntries = visible.filter((r) => selected.has(r.id)).flatMap((r) => entryOf(r) ?? []);

  // "Mod de origem" of a plugin opens the mod (ui/telas/plugins.md §9).
  const focusMod = route.focusMod;
  useEffect(() => {
    if (focusMod && rows.some((r) => r.id === focusMod)) {
      setSelected(new Set([focusMod]));
      setInspected(focusMod);
    }
  }, [focusMod, rows]);

  const inspectedRow = inspected ? rows.find((r) => r.id === inspected) : undefined;
  // Header actions about "the selected mod" follow the focused row.
  const focusedRow = focused ? rows.find((r) => r.id === focused) : undefined;
  const inspectedPriority = useMemo(() => {
    if (!inspected || !modOrder) return undefined;
    const listed = modRows(rows, modOrder).filter((r) => r.kind === "mod" && r.priority != null);
    const own = listed.find((r) => r.id === inspected);
    return own && own.kind === "mod" && own.priority != null ? { value: own.priority, of: listed.length } : undefined;
  }, [inspected, rows, modOrder]);

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

  // Requirements never block enabling; the backend tells what else the mod
  // needs ("Também habilitar: X, Y") or who depends on it (core/06 §6), and
  // nothing more is enabled unless the user asks.
  const onToggle = useCallback(
    (row: ModRow, enabled: boolean) =>
      void (async () => {
        const result = await run(() => backend.setModsEnabled(instance, [row.id], enabled));
        if (!result.ok) return;
        const impact = await backend.enableImpact(instance, [row.id], enabled).catch(() => null);
        if (!impact) return;
        if (enabled && impact.alsoEnable.length > 0) {
          const ids = impact.alsoEnable.map((m) => m.id);
          addToast({
            title: t("mods.deps.alsoEnable", { mod: row.name, names: impact.alsoEnable.map((m) => m.name).join(", ") }),
            variant: "info",
            duration: 10000,
            action: { label: t("mods.deps.alsoEnableAction"), onClick: () => void run(() => backend.setModsEnabled(instance, ids, true)) },
          });
        }
        if (!enabled && impact.affected.length > 0) {
          addToast({ title: t("mods.deps.affected", { names: impact.affected.map((m) => m.name).join(", ") }), variant: "warning", duration: 8000 });
        }
      })(),
    [run, backend, instance, addToast, t],
  );
  const onToggleSeparator = useCallback(
    (sep: Separator) => void run(() => backend.updateSeparator(instance, { ...sep, collapsed: !sep.collapsed })),
    [run, backend, instance],
  );
  const columns = useModColumns(onToggle, onToggleSeparator, lastOnly, conflicts, setEditingConflicts, tagDefs);
  const importFiles = () => void run(() => backend.pickImportFiles(instance, t("mods.import.pickFiles")));
  const importFolder = () => void run(() => backend.pickImportFolder(instance, t("mods.import.pickFolder")));
  const openFolder = (folder: InstanceFolder) => void run(() => backend.openInstanceFolder(instance, folder));
  const moveTo = (entries: EntryRef[], kind: "top" | "bottom") => void move({ entries, anchor: { kind, entry: {} }, mode: "exact" });

  // Row keys (ui/00 §5): Space toggles the focused mod, Delete asks to
  // remove the selection (or the focused mod), Shift+F10 / the menu key
  // opens the row menu on the focused row.
  const onRowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, row: ListRow) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      setContextRow(row);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (event.key === " ") {
      event.preventDefault();
      if (row.kind === "separator") onToggleSeparator(row.separator);
      else if (row.mod.state === "installed" && !row.mod.queued) onToggle(row.mod, !row.mod.enabled);
    } else if (event.key === "Delete" && row.kind === "mod") {
      event.preventDefault();
      const chosen = selected.has(row.id) ? ids : [row.mod.id];
      if (chosen.length > 0 && !rows.some((r) => chosen.includes(r.id) && r.queued)) setRemoving(chosen);
    }
  };

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
        <Button type="button" emphasis="low" size="sm" startIcon={<FolderPlusIcon size="sm" />} onClick={importFolder}>
          {t("mods.import.folder")}
        </Button>
      }
    />
  );

  const installedIds = (list: readonly ModRow[]) => list.filter((r) => r.state === "installed").map((r) => r.id);

  return (
    <PageBody fill>
      <div className="flex min-h-0 flex-1 flex-col gap-3" style={DROP_TARGET}>
        <header className="flex flex-wrap items-center gap-3">
          {rows.length > 0 ? (
            <>
              <Indicator variant="chip" icon={PackageIcon} value={String(enabledCount)} label={t("mods.header.active", { total: rows.length })} />
              <Indicator variant="chip" icon={HardDrive} value={formatSize(i18n.language, diskSize)} label={t("mods.header.disk")} />
            </>
          ) : null}
          <span className="flex-1" />
          <Button
            size="icon"
            emphasis="low"
            badge={items.length + waiting.length || undefined}
            badgeIntent={asking.length > 0 ? "warning" : undefined}
            tooltip={t("mods.queue.dialogTitle")}
            aria-label={tp("mods.queue.button", items.length + waiting.length)}
            onClick={() => setQueueOpen(true)}
          >
            <Icon icon={ListChecks} size="sm" />
          </Button>
          <Menu.Root placement="bottom-end">
            <Menu.Trigger>
              <Button size="icon" emphasis="low" title={t("mods.import.title")} aria-label={t("mods.import.title")}>
                <Icon icon={FolderInput} size="sm" />
              </Button>
            </Menu.Trigger>
            <Menu.Content>
              <Menu.Item onSelect={importFiles}>{t("mods.import.file")}</Menu.Item>
              <Menu.Item onSelect={importFolder}>{t("mods.import.folder")}</Menu.Item>
            </Menu.Content>
          </Menu.Root>
          <DeployMenu />
          <Menu.Root placement="bottom-end">
            <Menu.Trigger>
              <Button size="icon" emphasis="low" title={t("mods.toolbar.more")} aria-label={t("mods.toolbar.more")}>
                <MoreHorizontalIcon size="sm" />
              </Button>
            </Menu.Trigger>
            <Menu.Content>
              <Menu.Item onSelect={() => setOrganizing("categories")}>{t("mods.organize.menu")}</Menu.Item>
              <Menu.Item onSelect={() => setRulesFor({ mod: null })}>{t("mods.toolbar.rules")}</Menu.Item>
              <Menu.Item onSelect={() => setSeparatorEdit({})}>{t("mods.action.newSeparator")}</Menu.Item>
              <Menu.Item onSelect={() => setHistoryOpen(true)}>{t("mods.orderHistory.title")}</Menu.Item>
              <Menu.Item
                onSelect={() => navigate({ view: "diagnostics", tab: "history", mod: focusedRow ? { id: focusedRow.id, name: focusedRow.name } : undefined })}
              >
                {t("mods.toolbar.history")}
              </Menu.Item>
              <Menu.Item onSelect={() => openFolder("game")}>{t("mods.open.game")}</Menu.Item>
              <Menu.Item onSelect={() => openFolder("staging")}>{t("mods.open.staging")}</Menu.Item>
              <Menu.Item onSelect={() => openFolder("archives")}>{t("mods.open.archives")}</Menu.Item>
              {focusedRow?.state === "installed" ? (
                <Menu.Item onSelect={() => void run(() => backend.openModFolder(focusedRow.id))}>{t("mods.open.mod", { name: focusedRow.name })}</Menu.Item>
              ) : null}
            </Menu.Content>
          </Menu.Root>
          <Button emphasis="high" startIcon={<PackagePlusIcon size="sm" />} onClick={importFiles}>
            {t("mods.add")}
          </Button>
        </header>
        <BusyBand />

        {asking.length > 0 ? (
          <Alert.Root
            intent="warning"
            compact
            action={
              <Button size="sm" onClick={() => setQueueOpen(true)}>
                {t("mods.queue.open")}
              </Button>
            }
          >
            <Alert.Description>{tp("mods.queue.waitingChoice", asking.length)}</Alert.Description>
          </Alert.Root>
        ) : null}

        <ProblemBand modules={["rules", "library", "game"]} exclude={["rule_cycle"]} />

        {cycle.status === "ready" && cycle.data ? (
          <Alert.Root intent="danger">
            <Alert.Title>{t("conflicts.cycle.bannerTitle")}</Alert.Title>
            <Alert.Description>
              {t("conflicts.cycle.banner", { cycle: [...cycle.data.mods, cycle.data.mods[0]!].map((m) => m.name).join(" → ") })}
            </Alert.Description>
            <Button size="sm" onClick={() => setCycleOpen(true)}>
              {t("conflicts.cycle.open")}
            </Button>
          </Alert.Root>
        ) : null}

        {mods.status === "error" ? <ErrorAlert title="mods.loadError" error={mods.error} onRetry={mods.reload} /> : null}
        {order.status === "error" ? <ErrorAlert title="mods.loadError" error={order.error} onRetry={order.reload} /> : null}
        {mods.status === "loading" ? <LoadingState /> : null}

        {mods.status === "ready" && rows.length === 0 ? (
          <EmptyState.Root className="rounded-card border border-border bg-surface">
            <EmptyState.Icon>
              <FeaturedIcon icon={PackagePlusIcon} intent="neutral" />
            </EmptyState.Icon>
            <EmptyState.Title>{t("mods.emptyTitle")}</EmptyState.Title>
            <EmptyState.Description>{t("mods.emptyDescription")}</EmptyState.Description>
            <EmptyState.Actions>{dropzone(true)}</EmptyState.Actions>
          </EmptyState.Root>
        ) : null}

        {mods.status === "ready" && rows.length > 0 ? (
          <>
            <FilterBar
              data-page-search
              className="rounded-card border"
              query={query}
              onQueryChange={setQuery}
              queryPlaceholder={t("mods.filter.search")}
              filters={
                <>
                  <SegmentedControl<QuickFilter>
                    aria-label={t("mods.quick.label")}
                    size="sm"
                    value={status}
                    onChange={setStatus}
                    options={[
                      { value: "all", label: <>{t("mods.quick.all")} <span className="text-fg-muted">{rows.length}</span></> },
                      { value: "enabled", label: <>{t("mods.quick.enabled")} <span className="text-fg-muted">{enabledCount}</span></> },
                      {
                        value: "disabled",
                        label: <>{t("mods.quick.disabled")} <span className="text-fg-muted">{rows.filter((r) => r.state === "installed" && !r.enabled).length}</span></>,
                      },
                    ]}
                  />
                  <Input.Root value={category} onChange={setCategory}>
                    <Input.Select
                      aria-label={t("mods.filter.category")}
                      options={[{ value: "", label: t("mods.filter.category.all") }, { value: NO_CATEGORY, label: t("mods.noCategory") }, ...categoryOptions(cats)]}
                    />
                  </Input.Root>
                  <Input.Root value={conflictFilter} onChange={(v: string) => setConflictFilter(v as ConflictFilter)}>
                    <Input.Select
                      aria-label={t("mods.filter.conflicts")}
                      options={CONFLICT_FILTERS.map((c) => ({ value: c, label: t(`mods.filter.conflicts.${c}`) }))}
                    />
                  </Input.Root>
                </>
              }
              actions={
                <>
                  <SegmentedControl<ModsView>
                    aria-label={t("mods.view.label")}
                    size="sm"
                    value={view}
                    onChange={changeView}
                    options={VIEWS.map((v) => ({
                      value: v,
                      label: (
                        <span className="flex items-center gap-1.5">
                          <Icon icon={VIEW_ICONS[v]} size="sm" />
                          {t(`mods.view.${v}`)}
                        </span>
                      ),
                    }))}
                  />
                  <DataTableColumnPicker label={t("table.columns")} columns={columns} hiddenColumns={hidden} onHiddenColumnsChange={setHidden} />
                </>
              }
            />

            {!reorderable && modOrder ? (
              <div role="note" className="flex items-center gap-2 px-1 text-sm text-fg-muted">
                <InfoIcon size="sm" className="shrink-0" />
                <span>{t(view !== "list" ? "mods.reorder.notList" : byPriority ? "mods.reorder.filtered" : "mods.reorder.notByPriority")}</span>
                <Button
                  size="sm"
                  emphasis="low"
                  onClick={() => {
                    setSort(PRIORITY_SORT);
                    changeView("list");
                    resetFilters();
                  }}
                >
                  {t("mods.reorder.reset")}
                </Button>
              </div>
            ) : null}

            {selected.size >= 2 ? (
              <ActionBar role="toolbar" aria-label={t("mods.multi.label")} className="flex-wrap rounded-card border sm:justify-start">
                <Typography variant="body-sm" color="fg" className="mr-2">
                  {tp("mods.multi.selected", selected.size)}
                </Typography>
                <Button size="sm" onClick={() => void run(() => backend.setModsEnabled(instance, installedIds(selectedRows), true))}>
                  {t("mods.action.enable")}
                </Button>
                <Button size="sm" onClick={() => void run(() => backend.setModsEnabled(instance, installedIds(selectedRows), false))}>
                  {t("mods.action.disable")}
                </Button>
                <Button size="sm" disabled={selectedEntries.length === 0} onClick={() => setMovingTo(selectedEntries)}>
                  {t("mods.action.moveTo")}
                </Button>
                <Input.Root value="" onChange={(v: string) => void run(() => backend.setModsCategory(instance, ids, v === NO_CATEGORY ? "" : v))}>
                  <Input.Select
                    aria-label={t("mods.multi.category")}
                    placeholder={t("mods.multi.category")}
                    options={[{ value: NO_CATEGORY, label: t("mods.noCategory") }, ...categoryOptions(cats)]}
                  />
                </Input.Root>
                <Button size="sm" startIcon={<UndoIcon size="sm" />} onClick={() => void run(() => backend.reinstallMods(instance, installedIds(selectedRows)))}>
                  {t("mods.action.reinstall")}
                </Button>
                <Button size="sm" intent="danger" startIcon={<TrashIcon size="sm" />} disabled={ids.length === 0} onClick={() => setRemoving(ids)}>
                  {t("mods.action.remove")}
                </Button>
                <Button size="sm" emphasis="low" onClick={() => setSelected(new Set())}>
                  {t("mods.multi.clear")}
                </Button>
              </ActionBar>
            ) : null}

            {view === "tabs" ? (
              <Tabs.Root value={tab} onValueChange={setTab}>
                <Tabs.List aria-label={t("mods.view.tabsLabel")} className="shrink-0 overflow-x-auto overflow-y-hidden">
                  <Tabs.Trigger value={ALL_TAB}>
                    {t("mods.quick.all")} <span className="text-xs text-fg-muted">{rows.length}</span>
                  </Tabs.Trigger>
                  {tabs.top.map((c) => {
                    const g = categoryIcon(c.icon);
                    const pc = paletteColor(c.color);
                    return (
                      <Tabs.Trigger key={c.id} value={c.id}>
                        {g ? (
                          <span data-category={pc} className={`flex size-5 items-center justify-center rounded-chip ${pc ? "bg-intent-subtle text-intent-text" : "text-fg-muted"}`}>
                            <Icon icon={g} size="xs" />
                          </span>
                        ) : null}
                        {c.name} <span className="text-xs text-fg-muted">{tabs.counts.get(c.id) ?? 0}</span>
                      </Tabs.Trigger>
                    );
                  })}
                  {tabs.none > 0 ? (
                    <Tabs.Trigger value={NO_CATEGORY}>
                      {t("mods.noCategory")} <span className="text-xs text-fg-muted">{tabs.none}</span>
                    </Tabs.Trigger>
                  ) : null}
                </Tabs.List>
              </Tabs.Root>
            ) : null}
            {view === "tabs" && tabs.top.length === 0 ? (
              <Alert.Root
                intent="info"
                compact
                action={
                  <Button size="sm" onClick={() => setOrganizing("categories")}>
                    {t("mods.categories.add")}
                  </Button>
                }
              >
                <Alert.Description>{t("mods.view.noCategories")}</Alert.Description>
              </Alert.Root>
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
                  onRowKeyDown={onRowKeyDown}
                  reorderable={reorderable}
                  onRowsMove={onRowsMove}
                  categoryLastOnly={lastOnly}
                  conflicts={conflicts}
                  onOpenConflicts={setEditingConflicts}
                  density={density}
                  groupByCategory={view === "nested"}
                  tagDefs={tagDefs}
                  empty={
                    <NoMatch message="mods.filter.noMatch" onClear={resetFilters} />
                  }
                />
              </ContextMenu>

            </div>
            {dropzone(false)}
          </>
        ) : null}
      </div>

      <ImportDecisionDialog item={deciding ? (items.find((i) => i.operationId === deciding.operationId) ?? null) : null} onClose={() => setDeciding(null)} />
      <ModDetailDialog
        instance={instance}
        id={inspectedRow ? inspectedRow.id : null}
        order={visible.flatMap((r) => (r.kind === "mod" ? [r.mod.id] : []))}
        priority={inspectedPriority}
        onNavigate={setInspected}
        onClose={() => setInspected(null)}
        onRemove={(ids) => {
          setInspected(null);
          setRemoving(ids);
        }}
        onEditConflicts={setEditingConflicts}
        onChooseWinner={setFilesPair}
        onOpenConflictsPage={() => {
          setInspected(null);
          navigate({ view: "conflicts" });
        }}
      />
      <RemoveModsDialog
        instance={instance}
        ids={removing}
        onClose={() => {
          setRemoving(null);
          setSelected(new Set());
          if (inspected && removing?.includes(inspected)) setInspected(null);
        }}
      />
      <OrganizationDialog
        instance={instance}
        open={organizing !== null}
        initialTab={organizing ?? "categories"}
        onShowTag={(name) => {
          setOrganizing(null);
          resetFilters();
          setQuery(name);
        }}
        onClose={() => setOrganizing(null)}
      />
      <InstallQueueDialog
        instance={instance}
        open={queueOpen}
        items={items}
        waiting={waiting}
        onDecide={(item) => {
          setQueueOpen(false);
          setDeciding(item);
        }}
        onClose={() => setQueueOpen(false)}
      />
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

/** Deploy icon of the header (ui/telas/mods.md §3): availability as the backend reports it. */
function DeployMenu() {
  const { t } = useI18n();
  const { status, deploy, openPurge, openPreview } = useDeploy();
  if (!status) return null;
  const busy = Boolean(status.busy);
  const deployReason = busy
    ? t("deploy.disabled.busy")
    : status.kind === "in_sync"
      ? t("deploy.disabled.inSync")
      : status.kind === "unknown"
        ? t("deploy.disabled.unknown")
        : status.foreign.length > 0
          ? t("deploy.disabled.foreign")
          : "";
  const label = busy ? t("mods.deploy.running") : t("mods.deploy.menu");
  return (
    <Menu.Root placement="bottom-end">
      <Menu.Trigger>
        <Button size="icon" emphasis="low" title={label} aria-label={label}>
          <RocketIcon size="sm" loop={busy} />
        </Button>
      </Menu.Trigger>
      <Menu.Content>
        <Menu.Item disabled={deployReason !== ""} onSelect={() => void deploy()}>
          {deployReason ? `${t("deploy.action.deploy")} (${deployReason})` : t("deploy.action.deploy")}
        </Menu.Item>
        <Menu.Item onSelect={openPreview}>{t("deploy.action.preview")}</Menu.Item>
        <Menu.Item disabled={busy || status.entries === 0} onSelect={openPurge}>
          <Icon icon={Eraser} size="sm" />
          {t("deploy.action.purge")}
        </Menu.Item>
      </Menu.Content>
    </Menu.Root>
  );
}
