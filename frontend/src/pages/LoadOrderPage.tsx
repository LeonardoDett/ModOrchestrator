import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, CheckCircle2, ChevronDown, CircleAlert, GitCompareArrows, History, ListOrdered, Lock, Pin, Undo2, X } from "lucide-react";
import {
  Alert,
  Button,
  Checkbox,
  DataTable,
  Indicator,
  Inspector,
  Menu,
  Spinner,
  Stack,
  Switch,
  Toolbar,
  Typography,
  useToast,
  type DataTableColumn,
  type DataTableRowMove,
} from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useLoadOrderExplain, useLoadOrderView, useWorkspace } from "../bridge/queries";
import type { PluginRow, SortPreview } from "../bridge/types";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useAction } from "../features/games/use-action";
import { CompareDialog, ExternalLoadOrderDialog, ImportOrderDialog, SortPreviewDialog } from "../features/plugins/PluginDialogs";
import { ProblemCell, reasonText, violationText } from "../features/plugins/plugin-labels";
import { useI18n } from "../i18n/i18n";
import { useNavigation } from "../shell/navigation";
import { HonestEmpty, PageBody } from "./PageBody";

/**
 * Load Order (ui/telas/load-order.md): the order of the plugins of the active
 * profile, why each one is where it is, what the sort would change and
 * whether the game's file holds it. Never mixed with the mod order (D006,
 * INV-ORD-06). The backend validates every move (anti-pattern 1).
 */
export function LoadOrderPage() {
  const { t } = useI18n();
  const ws = useWorkspace();
  if (ws.status === "loading") return <PageBody><Spinner label={t("common.loading")} /></PageBody>;
  if (ws.status === "unavailable") {
    return (
      <PageBody>
        <Alert.Root variant="info">
          <Alert.Description>{t("app.offlineHint")}</Alert.Description>
        </Alert.Root>
      </PageBody>
    );
  }
  if (ws.status === "error") return <PageBody><ErrorAlert title="games.loadError" error={ws.error} onRetry={ws.reload} /></PageBody>;
  if (!ws.data.active) return null;
  return <LoadOrderWorkspace key={ws.data.active.id} instance={ws.data.active.id} />;
}

function LoadOrderWorkspace({ instance }: { instance: string }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const { addToast } = useToast();
  const { route, navigate } = useNavigation();
  const view = useLoadOrderView(instance);
  const [showInactive, setShowInactive] = useState(true);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [inspected, setInspected] = useState<string | null>(route.plugin ?? null);
  const [preview, setPreview] = useState<SortPreview | null>(null);
  const [dialog, setDialog] = useState<"compare" | "review" | "import" | null>(route.review ? "review" : null);
  const [refusal, setRefusal] = useState<{ text: string[]; retry: (() => void) | null } | null>(null);

  useEffect(() => {
    if (route.review) setDialog("review");
  }, [route.review]);

  const data = view.status === "ready" ? view.data : null;
  const blocked = (data?.cycle.length ?? 0) > 0;
  const canDrag = !!data && data.manualOrder && !blocked && showInactive;
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => showInactive || r.enabled), [data, showInactive]);

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
      { id: "position", label: t("loadOrder.column.position"), width: 56, numeric: true, hideable: false, cell: (r) => r.position },
      { id: "index", label: t("plugins.column.index"), width: 76, hideable: false, cell: (r) => <span className="font-mono text-xs">{r.index}</span> },
      {
        id: "name",
        label: t("loadOrder.column.plugin"),
        width: 280,
        grow: true,
        hideable: false,
        cell: (r) => (
          <span className={`flex min-w-0 items-center gap-2 ${r.enabled ? "text-fg" : "text-fg-subtle"}`}>
            <span className="truncate">{r.name}</span>
            {!r.enabled ? <span className="sr-only">{t("plugins.inactive")}</span> : null}
          </span>
        ),
      },
      { id: "group", label: t("plugins.column.group"), width: 140, cell: (r) => (r.implicit ? t("plugins.group.fixed") : r.group === "default" ? t("plugins.group.default") : r.group) },
      {
        id: "lock",
        label: t("loadOrder.column.lock"),
        width: 64,
        cell: (r) =>
          r.implicit ? (
            <Indicator icon={Pin} tone="subtle" label={t("plugins.implicitFixed")} />
          ) : r.locked ? (
            <Indicator icon={Lock} tone="subtle" label={t("plugins.locked")} />
          ) : null,
      },
      { id: "rules", label: t("loadOrder.column.rules"), width: 72, numeric: true, align: "end", cell: (r) => (r.rules > 0 ? r.rules : "") },
      { id: "problems", label: t("plugins.column.problems"), width: 90, cell: (r) => <ProblemCell row={r} i18n={i18n} /> },
    ],
    [i18n, t],
  );

  const state = data?.state;
  return (
    <PageBody fill>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Toolbar
          start={
            <>
              <Button variant="outline" startIcon={<ArrowDownUp aria-hidden="true" />} disabled={!data || blocked} onClick={() => void sort()}>
                {t("plugins.action.sort")}
              </Button>
              <Switch checked={data?.autoSort ?? false} disabled={!data} onCheckedChange={(on) => void run(() => backend.setAutoSort(instance, on))} label={t("plugins.autoSort")} />
              <Button variant="ghost" startIcon={<Undo2 aria-hidden="true" />} disabled={!data?.canUndoSort} onClick={() => void run(() => backend.undoLastSort(instance))}>
                {t("loadOrder.action.undoSort")}
              </Button>
              <Button
                variant="ghost"
                startIcon={<History aria-hidden="true" />}
                disabled={!state?.canRestorePrevious}
                onClick={() => void run(() => backend.restorePreviousLoadOrder(instance), { success: "loadOrder.restored" })}
              >
                {t("loadOrder.action.restorePrevious")}
              </Button>
              <Button variant="ghost" startIcon={<GitCompareArrows aria-hidden="true" />} disabled={!state?.supported} onClick={() => setDialog("compare")}>
                {t("loadOrder.action.compare")}
              </Button>
            </>
          }
          end={
            <Menu.Root placement="bottom-end">
              <Menu.Trigger>
                <Button variant="ghost" endIcon={<ChevronDown aria-hidden="true" />}>
                  {t("loadOrder.action.export")}
                </Button>
              </Menu.Trigger>
              <Menu.Content>
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
          }
        />

        {state?.supported ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2" role="status">
            {state.external ? (
              <>
                <Indicator icon={CircleAlert} tone="warning" label={t("diag.code.load_order_external_change")} />
                <Typography variant="body-sm" color="fg">
                  {t("diag.code.load_order_external_change")}
                </Typography>
                <Button size="sm" variant="outline" onClick={() => setDialog("review")}>
                  {t("loadOrder.review.open")}
                </Button>
              </>
            ) : state.applied ? (
              <>
                <Indicator icon={CheckCircle2} tone="success" label={t("loadOrder.state.applied")} />
                <Typography variant="body-sm" color="fg">
                  {t("loadOrder.state.applied")}
                </Typography>
              </>
            ) : (
              <>
                <Indicator icon={CircleAlert} tone="info" label={t("loadOrder.state.differs")} />
                <Typography variant="body-sm" color="fg">
                  {state.fileExists ? tp("loadOrder.state.differences", state.differences) : t("loadOrder.state.noFile")}
                </Typography>
                <Button size="sm" variant="outline" onClick={() => void run(() => backend.applyLoadOrder(instance), { success: "loadOrder.applied" })}>
                  {t("loadOrder.action.apply")}
                </Button>
              </>
            )}
          </div>
        ) : null}

        <Typography variant="body-sm" color="muted-fg">
          {t(data && !data.manualOrder ? "loadOrder.info.noManual" : "loadOrder.info")}
        </Typography>

        {blocked ? (
          <Alert.Root variant="danger">
            <Alert.Description>{t("plugins.cycle", { plugins: data!.cycle.join(" → ") })}</Alert.Description>
          </Alert.Root>
        ) : null}
        {refusal ? (
          <Alert.Root variant="warning">
            <Alert.Title>{t("loadOrder.move.refused")}</Alert.Title>
            <Alert.Description>
              <ul className="mt-1 list-disc pl-5">
                {refusal.text.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <span className="mt-2 flex gap-2">
                {refusal.retry ? (
                  <Button size="sm" variant="outline" onClick={refusal.retry}>
                    {t("loadOrder.move.nearest")}
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => setRefusal(null)}>
                  {t("common.close")}
                </Button>
              </span>
            </Alert.Description>
          </Alert.Root>
        ) : null}

        {view.status === "error" ? <ErrorAlert title="plugins.loadError" error={view.error} onRetry={view.reload} /> : null}
        {view.status === "loading" ? <Spinner label={t("common.loading")} /> : null}
        {data && data.rows.every((r) => r.implicit) ? <HonestEmpty icon={ListOrdered} title="plugins.emptyTitle" description="plugins.emptyDescription" /> : null}

        {data && !data.rows.every((r) => r.implicit) ? (
          <div className="flex min-h-0 flex-1 gap-4">
            <section aria-label={t("loadOrder.tableLabel")} className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
              <Checkbox checked={showInactive} onCheckedChange={setShowInactive} label={t("loadOrder.showInactive")} />
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
                reorderable={canDrag ? (r) => !r.locked : false}
                onRowsMove={onRowsMove}
                labels={{ resizeColumn: t("table.resizeColumn"), loading: t("common.loading"), dragHandle: t("loadOrder.dragHandle"), moving: t("loadOrder.moving") }}
              />
            </section>
            {inspected && data.rows.some((r) => r.name === inspected) ? (
              <WhyHere instance={instance} name={inspected} onClose={() => setInspected(null)} />
            ) : null}
          </div>
        ) : null}
      </div>
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
    </PageBody>
  );
}

/** Inspector "Por que está aqui" (ui/telas/load-order.md §3). */
function WhyHere({ instance, name, onClose }: { instance: string; name: string; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const ex = useLoadOrderExplain(instance, name);
  const data = ex.status === "ready" ? ex.data : null;
  return (
    <Inspector
      sticky={false}
      aria-label={name}
      title={name}
      description={data ? t("loadOrder.why.position", { position: data.position }) : undefined}
      className="flex w-[22rem] shrink-0 flex-col overflow-auto rounded-xl border"
      actions={
        <Button variant="ghost" size="icon-sm" aria-label={t("common.close")} onClick={onClose}>
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      }
    >
      {ex.status === "loading" ? <Spinner label={t("common.loading")} /> : null}
      {ex.status === "error" ? <ErrorAlert title="plugins.loadError" error={ex.error} onRetry={ex.reload} /> : null}
      {data ? (
        <Stack gap="md">
          <Typography variant="heading-6" color="fg">
            {t("loadOrder.why.title")}
          </Typography>
          {data.fixed ? <Typography variant="body-sm" color="fg">{t("loadOrder.why.fixed")}</Typography> : null}
          {data.locked ? <Typography variant="body-sm" color="fg">{t("loadOrder.why.locked")}</Typography> : null}
          {data.after.length === 0 && !data.fixed && !data.locked ? (
            <Typography variant="body-sm" color="muted-fg">
              {t("loadOrder.why.free")}
            </Typography>
          ) : null}
          <ul className="flex flex-col gap-1 text-sm text-fg">
            {data.after.map((r) => (
              <li key={`${r.kind}:${r.other}:${r.rule}`}>{reasonText(i18n, r)}</li>
            ))}
          </ul>
          <Typography variant="body-sm" color="muted-fg">
            {t("loadOrder.why.group", { group: data.group === "default" ? t("plugins.group.default") : data.group })}
          </Typography>
          {data.dependents.length > 0 ? (
            <>
              <Typography variant="heading-6" color="fg">
                {t("loadOrder.why.dependents")}
              </Typography>
              <ul className="flex flex-col gap-1 text-sm text-fg">
                {data.dependents.map((r) => (
                  <li key={`${r.kind}:${r.other}:${r.rule}`}>{reasonText(i18n, r)}</li>
                ))}
              </ul>
            </>
          ) : null}
          {!data.fixed ? (
            <div>
              <Button size="sm" variant="outline" startIcon={<Lock aria-hidden="true" />} onClick={() => void run(() => backend.setIndexLock(instance, [name], !data.locked))}>
                {t(data.locked ? "plugins.action.unlock" : "plugins.action.lock")}
              </Button>
            </div>
          ) : null}
        </Stack>
      ) : null}
    </Inspector>
  );
}
