import { useEffect, useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { ArrowDownIcon, CircleAlertIcon, CircleCheckIcon, InfoIcon, ListOrderedIcon, LockIcon, MoreHorizontalIcon, SearchIcon, UndoIcon, XIcon } from "dettmann-ui/icons";
import { Alert, Button, DataTable, Icon, Indicator, Input, Loader, Menu, ResourcePage, Switch, useToast, type DataTableColumn, type DataTableRowMove } from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useLoadOrderExplain, useLoadOrderView } from "../bridge/queries";
import type { PluginReason, PluginRow, SortPreview } from "../bridge/types";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useAction } from "../features/games/use-action";
import { CompareDialog, ExternalLoadOrderDialog, ImportOrderDialog, SortPreviewDialog } from "../features/plugins/PluginDialogs";
import { violationText } from "../features/plugins/plugin-labels";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { MAIN_ID, useNavigation } from "../shell/navigation";
import { BusyBand, HonestEmpty, LoadingState, WorkspaceGate } from "./PageBody";

/** Rows of the board: one line of 44 px. */
const ROW_HEIGHT = 44;

/**
 * Load Order (ui/telas/load-order.md, board JogoOrdemDeCarga): the order of
 * the plugins of the active profile. Header line with whether the game file
 * holds it ("Diferente da aplicada no jogo", Comparar), "Desfazer ordenação"
 * and "Aplicar no jogo"; a row with search, inactive plugins and automatic
 * sorting; the list to drag and, beside it, why the chosen plugin is where
 * it is. Never mixed with the mod order (D006). The backend validates every
 * move (anti-pattern 1).
 */
export function LoadOrderPage() {
  return <WorkspaceGate>{(instance) => <LoadOrderWorkspace instance={instance} />}</WorkspaceGate>;
}

function LoadOrderWorkspace({ instance }: { instance: string }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const { addToast } = useToast();
  const { route, navigate } = useNavigation();
  const view = useLoadOrderView(instance);
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [inspected, setInspected] = useState<string | null>(route.plugin ?? null);
  const [preview, setPreview] = useState<SortPreview | null>(null);
  const [dialog, setDialog] = useState<"compare" | "review" | "import" | null>(route.review ? "review" : null);
  const [refusal, setRefusal] = useState<{ text: string[]; retry: (() => void) | null } | null>(null);

  useEffect(() => {
    if (route.review) setDialog("review");
  }, [route.review]);
  useEffect(() => {
    if (route.plugin) setInspected(route.plugin);
  }, [route.plugin]);

  const data = view.status === "ready" ? view.data : null;
  const blocked = (data?.cycle.length ?? 0) > 0;
  const q = query.trim().toLowerCase();
  // A drop lands before or after a row by its place in the full order, so a
  // filtered list can be dragged too.
  const canDrag = !!data && data.manualOrder && !blocked;
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => (showInactive || r.enabled) && (!q || r.name.toLowerCase().includes(q))), [data, showInactive, q]);

  const sort = async () => {
    const p = await run(() => backend.sortPreview(instance), { quiet: true });
    if (!p.ok) return;
    if (p.value.moves.length === 0) {
      addToast({ title: t("loadOrder.sort.nothing"), variant: "success", duration: 3000 });
      return;
    }
    if (p.value.moves.length > p.value.confirmAbove) {
      setPreview(p.value);
      return;
    }
    await applySort();
  };
  const applySort = async () => {
    setPreview(null);
    const r = await run(() => backend.sortPlugins(instance));
    if (r.ok && r.value.moved > 0) {
      addToast({
        title: tp("loadOrder.sort.moved", r.value.moved),
        variant: "success",
        duration: 6000,
        action: { label: t("loadOrder.action.undoSort"), onClick: () => void run(() => backend.undoLastSort(instance)) },
      });
    }
  };

  const move = async (names: string[], index: number) => {
    const r = await run(() => backend.movePlugins(instance, names, index));
    if (r.ok && !r.value.applied) {
      const nearest = r.value.nearest;
      setRefusal({
        text: r.value.violated.map((v) => violationText(i18n, v)),
        retry: nearest >= 0 ? () => void move(names, nearest) : null,
      });
    } else if (r.ok) setRefusal(null);
  };
  const onRowsMove = async (request: DataTableRowMove) => {
    const target = rows.find((r) => r.name === request.targetId);
    if (!target) return;
    // The backend takes the 0-based index of the full order before which
    // the block lands (the block itself is not counted).
    await move(request.ids, request.position === "before" ? target.position - 1 : target.position);
  };

  const columns = useMemo<DataTableColumn<PluginRow>[]>(
    () => [
      { id: "index", label: t("plugins.column.index"), width: 74, cell: (r) => <span className="font-mono text-xs text-fg-muted">{r.index}</span> },
      {
        id: "name",
        label: t("loadOrder.column.plugin"),
        width: 280,
        grow: true,
        cell: (r) => (
          <span className={`flex min-w-0 items-center gap-2 ${r.enabled ? "text-fg" : "text-fg-subtle"}`}>
            <span className="truncate font-medium">{r.name}</span>
            {!r.enabled ? <span className="sr-only">{t("plugins.inactive")}</span> : null}
          </span>
        ),
      },
      {
        id: "group",
        label: t("plugins.column.group"),
        width: 112,
        cell: (r) => <span className="truncate text-fg-muted">{r.implicit ? t("plugins.group.fixed") : r.group === "default" ? t("plugins.group.default") : r.group}</span>,
      },
      { id: "rules", label: t("loadOrder.column.rules"), width: 82, cell: (r) => (r.rules > 0 ? <span className="text-xs text-fg-muted">{tp("loadOrder.rulesCount", r.rules)}</span> : null) },
      {
        id: "lock",
        label: t("loadOrder.column.lock"),
        width: 64,
        cell: (r) => {
          if (r.implicit) return <Indicator icon={LockIcon} intent="subtle" label={t("loadOrder.lock.fixed")} />;
          if (r.locked) return <Indicator icon={LockIcon} intent="subtle" label={t("loadOrder.lock.yours")} />;
          return null;
        },
      },
    ],
    [t, tp],
  );

  const state = data?.state;
  let stateChip: React.ReactNode = null;
  if (state?.supported) {
    if (state.external) {
      stateChip = (
        <>
          <Indicator variant="chip" intent="danger" icon={CircleAlertIcon} label={t("loadOrder.state.external")} />
          <Button size="inline" emphasis="low" intent="brand" onClick={() => setDialog("review")}>
            {t("loadOrder.review.open")}
          </Button>
        </>
      );
    } else if (state.applied) {
      stateChip = <Indicator variant="chip" intent="success" icon={CircleCheckIcon} label={t("loadOrder.state.applied")} />;
    } else {
      stateChip = (
        <>
          <Indicator
            variant="chip"
            intent="warning"
            icon={CircleAlertIcon}
            lead={state.fileExists ? t("loadOrder.state.differsGame") : t("loadOrder.state.noFile")}
            {...(state.fileExists ? { value: tp("loadOrder.state.differenceCount", state.differences) } : {})}
            label=""
          />
          <Button size="inline" emphasis="low" intent="brand" onClick={() => setDialog("compare")}>
            {t("loadOrder.action.compareShort")}
          </Button>
        </>
      );
    }
  }

  return (
    <ResourcePage
      id={MAIN_ID}
      tabIndex={-1}
      layout="workspace"
      className="focus:outline-none"
      title={t("nav.loadOrder")}
      meta={stateChip}
      primaryActions={
        <>
          <Menu.Root placement="bottom-end">
            <Menu.Trigger>
              <Button size="icon" aria-label={t("mods.toolbar.more")} title={t("mods.toolbar.more")}>
                <MoreHorizontalIcon size="sm" />
              </Button>
            </Menu.Trigger>
            <Menu.Content>
              <Menu.Item disabled={!state?.canRestorePrevious} onSelect={() => void run(() => backend.restorePreviousLoadOrder(instance), { success: "loadOrder.restored" })}>
                {t("loadOrder.action.restorePrevious")}
              </Menu.Item>
              <Menu.Item disabled={!state?.supported} onSelect={() => setDialog("compare")}>
                {t("loadOrder.action.compare")}
              </Menu.Item>
              <Menu.Item
                onSelect={() =>
                  void run(() => backend.exportLoadOrder(instance)).then(async (r) => {
                    if (!r.ok) return;
                    try {
                      await navigator.clipboard.writeText(r.value);
                      addToast({ title: t("loadOrder.export.copied"), variant: "success", duration: 3000 });
                    } catch {
                      addToast({ title: t("loadOrder.export.failed"), variant: "danger" });
                    }
                  })
                }
              >
                {t("loadOrder.export.copy")}
              </Menu.Item>
              <Menu.Item onSelect={() => setDialog("import")}>{t("loadOrder.import.title")}</Menu.Item>
            </Menu.Content>
          </Menu.Root>
          <Button startIcon={<UndoIcon size="sm" />} disabled={!data?.canUndoSort} onClick={() => void run(() => backend.undoLastSort(instance))}>
            {t("loadOrder.action.undoSortShort")}
          </Button>
          <Button
            emphasis="high"
            disabled={!state?.supported || state.applied || state.external}
            onClick={() => void run(() => backend.applyLoadOrder(instance), { success: "loadOrder.applied" })}
          >
            {t("loadOrder.action.applyGame")}
          </Button>
        </>
      }
    >
      <BusyBand />
      {blocked ? (
        <Alert.Root intent="danger" className="mb-2">
          <Alert.Description>{t("plugins.cycle", { plugins: data!.cycle.join(" → ") })}</Alert.Description>
        </Alert.Root>
      ) : null}
      {refusal ? (
        <Alert.Root intent="warning" className="mb-2">
          <Alert.Title>{t("loadOrder.move.refused")}</Alert.Title>
          <Alert.Description>
            <ul className="mt-1 list-disc pl-5">
              {refusal.text.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <span className="mt-2 flex gap-2">
              {refusal.retry ? (
                <Button size="sm" onClick={refusal.retry}>
                  {t("loadOrder.move.nearest")}
                </Button>
              ) : null}
              <Button size="sm" emphasis="low" onClick={() => setRefusal(null)}>
                {t("common.close")}
              </Button>
            </span>
          </Alert.Description>
        </Alert.Root>
      ) : null}
      {view.status === "error" ? <ErrorAlert title="plugins.loadError" error={view.error} onRetry={view.reload} /> : null}
      {view.status === "loading" ? <LoadingState /> : null}
      {data && data.rows.every((r) => r.implicit) ? <HonestEmpty icon={ListOrderedIcon} title="plugins.emptyTitle" description="plugins.emptyDescription" /> : null}

      {data && !data.rows.every((r) => r.implicit) ? (
        <>
          <div className="flex h-12 shrink-0 items-center gap-2.5">
            <div className="w-65 shrink-0">
              <Input.Root fullWidth value={query} onChange={setQuery}>
                <Input.Box>
                  <SearchIcon size="sm" className="text-fg-muted" />
                  <Input.Field data-page-search aria-label={t("loadOrder.search")} placeholder={t("loadOrder.search")} />
                </Input.Box>
              </Input.Root>
            </div>
            <span className="ml-1.5 shrink-0 whitespace-nowrap">
              <Switch size="xs" checked={showInactive} onCheckedChange={setShowInactive} label={t("loadOrder.showInactive")} />
            </span>
            <span className="ml-2.5 min-w-0 flex-1 truncate text-[0.8125rem] text-fg-muted">{t(data.manualOrder ? "loadOrder.info" : "loadOrder.info.noManual")}</span>
            <span className="shrink-0 whitespace-nowrap">
              <Switch size="xs" checked={data.autoSort} onCheckedChange={(on) => void run(() => backend.setAutoSort(instance, on))} label={t("plugins.autoSort")} />
            </span>
            <Button intent="brand" className="shrink-0 whitespace-nowrap" disabled={blocked} onClick={() => void sort()}>
              {t("plugins.action.sort")}
            </Button>
          </div>
          <div className={`mt-2 grid min-h-0 flex-1 gap-4 ${inspected ? "grid-cols-[minmax(0,1fr)_22.5rem]" : "grid-cols-1"}`}>
            <DataTable
              aria-label={t("loadOrder.tableLabel")}
              className="min-h-0 flex-1"
              columns={columns}
              rows={rows}
              getRowId={(r) => r.name}
              selectionMode="multiple"
              selectedIds={selected}
              onSelectedIdsChange={setSelected}
              onFocusedIdChange={(id) => id && setInspected(id)}
              onRowActivate={(r) => setInspected(r.name)}
              density="relaxed"
              rowHeight={ROW_HEIGHT}
              reorderable={canDrag ? (r) => !r.locked && !r.implicit : false}
              onRowsMove={onRowsMove}
              labels={{ resizeColumn: t("table.resizeColumn"), loading: t("common.loading"), dragHandle: t("loadOrder.dragHandle"), moving: t("loadOrder.moving") }}
            />
            {inspected && data.rows.some((r) => r.name === inspected) ? (
              <WhyHere instance={instance} name={inspected} row={data.rows.find((r) => r.name === inspected)!} onClose={() => setInspected(null)} />
            ) : null}
          </div>
        </>
      ) : null}
      <SortPreviewDialog preview={preview} onConfirm={() => void applySort()} onClose={() => setPreview(null)} />
      <CompareDialog instance={instance} open={dialog === "compare"} onClose={() => setDialog(null)} />
      <ExternalLoadOrderDialog
        instance={instance}
        open={dialog === "review"}
        onClose={() => {
          setDialog(null);
          if (route.review) navigate({ view: "load_order" });
        }}
      />
      <ImportOrderDialog instance={instance} open={dialog === "import"} onClose={() => setDialog(null)} />
    </ResourcePage>
  );
}

/** Small uppercase title of a block (boards). */
function BlockTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-fg-muted">{children}</h3>;
}

/** A constraint as two lines: what ("Depois de Lib.esm") and its kind ("master: este plugin precisa dele"). */
function Reason({ r }: { r: PluginReason }) {
  const { t } = useI18n();
  let text = t(r.before ? "loadOrder.why.afterPlugin" : "loadOrder.why.beforePlugin", { other: r.other });
  if (r.kind === "group") text = t("loadOrder.why.groupAfter", { group: r.group, after: r.afterGroup });
  const kindKey = `loadOrder.why.kind.${r.kind}` as MessageKey;
  const icon = r.kind === "group" ? <Icon icon={Layers} size="sm" /> : <ArrowDownIcon size="sm" />;
  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-2.5">
      <span className="mt-0.5 text-fg-muted">{icon}</span>
      <div className="flex min-w-0 flex-col gap-px">
        <span className="text-fg">{text}</span>
        <span className="text-xs text-fg-muted">{t(kindKey)}</span>
      </div>
    </div>
  );
}

/** Panel "Por que está aqui" (board JogoOrdemDeCarga). */
function WhyHere({ instance, name, row, onClose }: { instance: string; name: string; row: PluginRow; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const { navigate } = useNavigation();
  const ex = useLoadOrderExplain(instance, name);
  const data = ex.status === "ready" ? ex.data : null;
  const group = row.implicit ? t("plugins.group.fixed") : row.group === "default" ? t("plugins.group.default") : row.group;
  const sub = [t("loadOrder.why.positionShort", { position: row.position }), row.index ? t("plugins.panel.index", { index: row.index }) : t("plugins.inactive"), t("loadOrder.why.groupShort", { group })].join(" · ");
  return (
    <aside aria-label={t("loadOrder.why.title")} className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface">
      <div data-layer="medium" className="flex shrink-0 flex-col gap-1 border-b border-border bg-structure px-4 py-3.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="break-all text-[0.9375rem] font-semibold text-fg">{name}</h2>
          <Button size="icon-sm" emphasis="low" aria-label={t("plugins.panel.close")} title={t("plugins.panel.close")} onClick={onClose}>
            <XIcon size="sm" />
          </Button>
        </div>
        <span className="text-xs text-fg-muted">{sub}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {ex.status === "loading" ? <Loader label={t("common.loading")} /> : null}
        {ex.status === "error" ? (
          <div className="p-4">
            <ErrorAlert title="plugins.loadError" error={ex.error} onRetry={ex.reload} />
          </div>
        ) : null}
        {data ? (
          <div className="flex flex-col gap-4 px-4 py-3.5 text-[0.8125rem]">
            <section className="flex flex-col gap-2">
              <BlockTitle>{t("loadOrder.why.title")}</BlockTitle>
              {data.fixed ? <p className="text-fg">{t("loadOrder.why.fixed")}</p> : null}
              {data.locked ? <p className="text-fg">{t("loadOrder.why.locked")}</p> : null}
              {data.after.length === 0 && !data.fixed && !data.locked ? <p className="text-fg-muted">{t("loadOrder.why.free")}</p> : null}
              {data.after.map((r) => (
                <Reason key={`${r.kind}:${r.other}:${r.rule}`} r={r} />
              ))}
            </section>
            <section className="flex flex-col gap-2">
              <BlockTitle>{t("loadOrder.why.dependentsTitle")}</BlockTitle>
              {data.dependents.length === 0 ? <p className="text-fg-muted">{t("loadOrder.why.noDependents")}</p> : null}
              {data.dependents.map((r) => (
                <Reason key={`${r.kind}:${r.other}:${r.rule}`} r={r} />
              ))}
            </section>
            <div data-layer="medium" className="flex items-start gap-2.5 rounded-control border border-border-subtle bg-sunken px-3 py-2.5">
              <span className="mt-0.5 text-fg-muted">
                <InfoIcon size="sm" />
              </span>
              <p className="text-xs leading-normal text-fg-muted">{t("loadOrder.why.dragHelp")}</p>
            </div>
            {!data.fixed ? (
              <div className="flex gap-2">
                <Button size="sm" startIcon={<LockIcon size="sm" />} onClick={() => void run(() => backend.setIndexLock(instance, [name], !data.locked))}>
                  {t(data.locked ? "plugins.action.unlock" : "plugins.action.lock")}
                </Button>
                <Button size="sm" onClick={() => navigate({ view: "plugins", plugin: name })}>
                  {t("plugins.rule.add")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
