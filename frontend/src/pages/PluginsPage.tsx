import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, ChevronDown, FolderOpen, Group, ListChecks, Lock, LockOpen, Plug, Power, PowerOff } from "lucide-react";
import {
  ActionBar,
  Alert,
  Button,
  Checkbox,
  DataTable,
  DataTableColumnPicker,
  FilterBar,
  Input,
  Menu,
  SegmentedControl,
  Spinner,
  StatusToggle,
  Switch,
  Toolbar,
  Typography,
  type DataTableColumn,
} from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { usePluginList, usePluginRules, useWorkspace } from "../bridge/queries";
import type { PluginRow } from "../bridge/types";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useAction } from "../features/games/use-action";
import { toggleLabels } from "../features/mods/mod-labels";
import { PluginGroupsDialog, PluginRulesDialog } from "../features/plugins/PluginDialogs";
import { PluginInspector } from "../features/plugins/PluginInspector";
import { FlagTags, ProblemCell, limitText, originLabel } from "../features/plugins/plugin-labels";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { useNavigation } from "../shell/navigation";
import { HonestEmpty, PageBody } from "./PageBody";

type StatusFilter = "all" | "active" | "inactive";
type FlagFilter = "all" | "master" | "light" | "none";
type OriginFilter = "all" | "mod" | "base_game" | "unmanaged";

/** Columns hidden by default (ui/telas/plugins.md §3). */
const HIDDEN = ["masters", "author", "version", "description"];

/**
 * Plugins (ui/telas/plugins.md): the inventory of the active profile, which
 * plugins are active, where they come from and what is wrong with them. The
 * order is worked on in Load Order (divergência 2); here the index is only
 * informative. Every figure comes from the backend (core/08 §9).
 */
export function PluginsPage() {
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
  if (!ws.data.active) return null; // Routes sends the user back to Games
  return <PluginsWorkspace key={ws.data.active.id} instance={ws.data.active.id} />;
}

function PluginsWorkspace({ instance }: { instance: string }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const { route, navigate } = useNavigation();
  const list = usePluginList(instance);
  const rules = usePluginRules(instance);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>(route.filter === "active" ? "active" : "all");
  useEffect(() => {
    if (route.filter === "active") setStatus("active");
  }, [route.filter]);
  const [flag, setFlag] = useState<FlagFilter>("all");
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [showDisabled, setShowDisabled] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [inspected, setInspected] = useState<string | null>(route.plugin ?? null);
  const [dialog, setDialog] = useState<"rules" | "groups" | null>(route.pluginDialog ?? null);
  const [groupFor, setGroupFor] = useState("");
  const [hidden, setHidden] = useState<readonly string[]>(HIDDEN);

  useEffect(() => {
    if (route.plugin) setInspected(route.plugin);
    if (route.pluginDialog) setDialog(route.pluginDialog);
  }, [route.plugin, route.pluginDialog]);

  const data = list.status === "ready" ? list.data : null;
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.modName.toLowerCase().includes(q)) return false;
      if (status === "active" && !r.enabled) return false;
      if (status === "inactive" && r.enabled) return false;
      if (flag === "master" && !r.flags.includes("master")) return false;
      if (flag === "light" && !r.flags.includes("light")) return false;
      if (flag === "none" && r.flags.length > 0) return false;
      if (origin !== "all" && r.origin !== origin) return false;
      if (problemsOnly && r.problems === 0) return false;
      return true;
    });
  }, [data, query, status, flag, origin, problemsOnly]);

  const setEnabled = (names: string[], enabled: boolean) => void run(() => backend.setPluginsEnabled(instance, names, enabled));
  const groups = rules.status === "ready" ? rules.data.groups : [];
  const states = toggleLabels(i18n);

  const columns = useMemo<DataTableColumn<PluginRow>[]>(
    () => [
      {
        id: "status",
        label: t("plugins.column.status"),
        width: 84,
        hideable: false,
        cell: (r) => (
          <span onClick={(e) => e.stopPropagation()}>
            <StatusToggle
              state={r.implicit ? "unavailable" : r.enabled ? "on" : "off"}
              label={t(r.implicit ? "plugins.implicitToggle" : "plugins.toggleLabel", { name: r.name })}
              stateLabels={states}
              onCheckedChange={(next) => !r.implicit && setEnabled([r.name], next)}
            />
          </span>
        ),
      },
      { id: "index", label: t("plugins.column.index"), width: 76, sortable: true, hideable: false, cell: (r) => <span className="font-mono text-xs">{r.index}</span> },
      {
        id: "name",
        label: t("plugins.column.plugin"),
        width: 280,
        grow: true,
        sortable: true,
        hideable: false,
        cell: (r) => <span className={`truncate ${r.enabled ? "text-fg" : "text-fg-muted"}`}>{r.name}</span>,
      },
      { id: "flags", label: t("plugins.column.flags"), width: 150, cell: (r) => <FlagTags row={r} i18n={i18n} /> },
      {
        id: "group",
        label: t("plugins.column.group"),
        width: 150,
        sortable: true,
        cell: (r) =>
          r.implicit ? (
            <span className="text-fg-muted">{t("plugins.group.fixed")}</span>
          ) : (
            <span onClick={(e) => e.stopPropagation()}>
              <Input.Root value={r.group} onChange={(g: string) => g !== r.group && void run(() => backend.setPluginGroup(instance, [r.name], g))}>
                <Input.Select
                  aria-label={t("plugins.groupOf", { name: r.name })}
                  options={groups.map((g) => ({ value: g.name, label: g.default ? t("plugins.group.default") : g.name }))}
                />
              </Input.Root>
            </span>
          ),
      },
      {
        id: "mod",
        label: t("plugins.column.mod"),
        width: 200,
        sortable: true,
        cell: (r) =>
          r.mod ? (
            <Button
              size="sm"
              variant="ghost"
              className="max-w-full truncate"
              onClick={(e) => {
                e.stopPropagation();
                navigate({ view: "mods", focusMod: r.mod });
              }}
            >
              {r.modName}
            </Button>
          ) : (
            <span className="text-fg-muted">{originLabel(i18n, r.origin)}</span>
          ),
      },
      { id: "problems", label: t("plugins.column.problems"), width: 90, sortable: true, cell: (r) => <ProblemCell row={r} i18n={i18n} /> },
      { id: "masters", label: t("plugins.column.masters"), width: 80, numeric: true, align: "end", cell: (r) => r.masters },
      { id: "author", label: t("plugins.column.author"), width: 140, cell: (r) => r.author },
      { id: "version", label: t("plugins.column.version"), width: 90, cell: (r) => r.version },
      { id: "description", label: t("plugins.column.description"), width: 240, cell: (r) => <span className="truncate" title={r.description}>{r.description}</span> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n, t, groups, instance],
  );

  const chosen = [...selected];
  const summary = data
    ? [
        tp("plugins.summary.total", data.rows.length),
        tp("plugins.summary.active", data.active),
        ...data.limits.map((l) => limitText(i18n, l)),
        tp("plugins.summary.errors", data.errors),
      ].join(" · ")
    : "";

  return (
    <PageBody fill>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Toolbar
          start={
            <>
              <Button
                variant="outline"
                startIcon={<ArrowDownUp aria-hidden="true" />}
                disabled={!data || data.cycle.length > 0}
                onClick={() =>
                  void run(() => backend.sortPlugins(instance)).then((r) => {
                    if (r.ok) navigate({ view: "plugins" });
                  })
                }
              >
                {t("plugins.action.sort")}
              </Button>
              <Switch checked={data?.autoSort ?? false} disabled={!data} onCheckedChange={(on) => void run(() => backend.setAutoSort(instance, on))} label={t("plugins.autoSort")} />
              <Button variant="ghost" startIcon={<ListChecks aria-hidden="true" />} onClick={() => setDialog("rules")}>
                {t("plugins.action.rules")}
              </Button>
              <Button variant="ghost" startIcon={<Group aria-hidden="true" />} onClick={() => setDialog("groups")}>
                {t("plugins.action.groups")}
              </Button>
              <Button variant="ghost" startIcon={<Power aria-hidden="true" />} disabled={!data} onClick={() => data && setEnabled(data.rows.filter((r) => !r.implicit && !r.enabled).map((r) => r.name), true)}>
                {t("plugins.action.enableAll")}
              </Button>
              <Button variant="ghost" startIcon={<PowerOff aria-hidden="true" />} disabled={!data} onClick={() => data && setEnabled(data.rows.filter((r) => !r.implicit && r.enabled).map((r) => r.name), false)}>
                {t("plugins.action.disableAll")}
              </Button>
            </>
          }
          end={
            <Menu.Root placement="bottom-end">
              <Menu.Trigger>
                <Button variant="ghost" startIcon={<FolderOpen aria-hidden="true" />} endIcon={<ChevronDown aria-hidden="true" />}>
                  {t("plugins.action.open")}
                </Button>
              </Menu.Trigger>
              <Menu.Content>
                <Menu.Item onSelect={() => void run(() => backend.openInstanceFolder(instance, "game"))}>{t("mods.open.game")}</Menu.Item>
                <Menu.Item onSelect={() => navigate({ view: "load_order" })}>{t("plugins.action.openLoadOrder")}</Menu.Item>
              </Menu.Content>
            </Menu.Root>
          }
        />

        {data ? (
          <Typography variant="body-sm" color="fg" role="status">
            {summary}
          </Typography>
        ) : null}

        {data?.external ? (
          <Alert.Root variant="warning">
            <Alert.Description>
              <span className="flex flex-wrap items-center gap-2">
                {t("diag.code.load_order_external_change")}
                <Button size="sm" variant="outline" onClick={() => navigate({ view: "load_order", review: true })}>
                  {t("loadOrder.review.open")}
                </Button>
              </span>
            </Alert.Description>
          </Alert.Root>
        ) : null}
        {data && data.cycle.length > 0 ? (
          <Alert.Root variant="danger">
            <Alert.Description>{t("plugins.cycle", { plugins: data.cycle.join(" → ") })}</Alert.Description>
          </Alert.Root>
        ) : null}

        {list.status === "error" ? <ErrorAlert title="plugins.loadError" error={list.error} onRetry={list.reload} /> : null}
        {list.status === "loading" ? <Spinner label={t("common.loading")} /> : null}

        {data && data.rows.every((r) => r.implicit) && data.disabled.length === 0 ? (
          <HonestEmpty icon={Plug} title="plugins.emptyTitle" description="plugins.emptyDescription" />
        ) : null}

        {data && !data.rows.every((r) => r.implicit) ? (
          <div className="flex min-h-0 flex-1 gap-4">
            <section aria-label={t("plugins.tableLabel")} className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
              <FilterBar
                className="rounded-xl border"
                query={query}
                onQueryChange={setQuery}
                queryPlaceholder={t("plugins.search")}
                filters={
                  <>
                    <SegmentedControl
                      size="sm"
                      aria-label={t("plugins.filter.status")}
                      value={status}
                      onChange={setStatus}
                      options={(["all", "active", "inactive"] as const).map((v) => ({ value: v, label: t(`plugins.filter.status.${v}` as MessageKey) }))}
                    />
                    <SegmentedControl
                      size="sm"
                      aria-label={t("plugins.filter.flags")}
                      value={flag}
                      onChange={setFlag}
                      options={(["all", "master", "light", "none"] as const).map((v) => ({ value: v, label: t(`plugins.filter.flags.${v}` as MessageKey) }))}
                    />
                    <SegmentedControl
                      size="sm"
                      aria-label={t("plugins.filter.origin")}
                      value={origin}
                      onChange={setOrigin}
                      options={(["all", "mod", "base_game", "unmanaged"] as const).map((v) => ({
                        value: v,
                        label: v === "all" ? t("plugins.filter.origin.all") : originLabel(i18n, v),
                      }))}
                    />
                  </>
                }
                actions={
                  <>
                    <DataTableColumnPicker label={t("table.columns")} columns={columns} hiddenColumns={hidden} onHiddenColumnsChange={setHidden} />
                    <Checkbox checked={problemsOnly} onCheckedChange={setProblemsOnly} label={t("plugins.filter.problems")} />
                    <Checkbox checked={showDisabled} onCheckedChange={setShowDisabled} label={tp("plugins.filter.disabledMods", data.disabled.length)} />
                  </>
                }
              />
              {chosen.length > 0 ? (
                <ActionBar role="toolbar" aria-label={tp("plugins.selection", chosen.length)} className="rounded-xl border sm:justify-start">
                  <Typography variant="body-sm" color="fg" className="mr-auto">
                    {tp("plugins.selection", chosen.length)}
                  </Typography>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEnabled(chosen, true)}>
                      {t("plugins.action.activate")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEnabled(chosen, false)}>
                      {t("plugins.action.deactivate")}
                    </Button>
                    <Input.Root value={groupFor} onChange={(g: string) => {
                      setGroupFor("");
                      if (g) void run(() => backend.setPluginGroup(instance, chosen, g));
                    }}>
                      <Input.Select aria-label={t("plugins.action.setGroup")} placeholder={t("plugins.action.setGroup")} options={groups.map((g) => ({ value: g.name, label: g.default ? t("plugins.group.default") : g.name }))} />
                    </Input.Root>
                    <Button size="sm" variant="outline" startIcon={<Lock aria-hidden="true" />} onClick={() => void run(() => backend.setIndexLock(instance, chosen, true))}>
                      {t("plugins.action.lock")}
                    </Button>
                    <Button size="sm" variant="outline" startIcon={<LockOpen aria-hidden="true" />} onClick={() => void run(() => backend.setIndexLock(instance, chosen, false))}>
                      {t("plugins.action.unlock")}
                    </Button>
                  </div>
                </ActionBar>
              ) : null}
              <DataTable
                aria-label={t("plugins.tableLabel")}
                className="min-h-0 flex-1"
                columns={columns}
                rows={rows}
                getRowId={(r) => r.name}
                hiddenColumns={hidden}
                selectionMode="multiple"
                selectedIds={selected}
                onSelectedIdsChange={setSelected}
                onFocusedIdChange={(id) => id && setInspected(id)}
                onRowActivate={(r) => setInspected(r.name)}
                empty={<div className="p-6 text-sm text-fg-muted">{t("plugins.noMatch")}</div>}
                labels={{ resizeColumn: t("table.resizeColumn"), loading: t("common.loading") }}
              />
              {showDisabled && data.disabled.length > 0 ? (
                <section aria-label={t("plugins.disabledTitle")} className="rounded-xl border border-border bg-surface p-3">
                  <Typography variant="heading-6" color="fg">
                    {t("plugins.disabledTitle")}
                  </Typography>
                  <ul className="mt-2 flex flex-col gap-1 text-sm">
                    {data.disabled.map((d) => (
                      <li key={`${d.mod}:${d.name}`} className="flex items-center gap-2 text-fg-muted">
                        <span className="text-fg">{d.name}</span>·
                        <span>{t(d.losing ? "plugins.disabled.losing" : "plugins.disabled.mod", { mod: d.modName })}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </section>
            {inspected && data.rows.some((r) => r.name.toLowerCase() === inspected.toLowerCase()) ? (
              <PluginInspector instance={instance} name={inspected} onClose={() => setInspected(null)} />
            ) : null}
          </div>
        ) : null}
      </div>
      <PluginRulesDialog instance={instance} open={dialog === "rules"} onClose={() => setDialog(null)} />
      <PluginGroupsDialog instance={instance} open={dialog === "groups"} onClose={() => setDialog(null)} />
    </PageBody>
  );
}
