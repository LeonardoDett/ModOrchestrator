import { useEffect, useMemo, useState } from "react";
import { Plug, PowerOff, SlidersHorizontal } from "lucide-react";
import { CircleXIcon, LockIcon, LockOpenIcon, MoreHorizontalIcon, PowerIcon, SearchIcon } from "dettmann-ui/icons";
import {
  ActionBar,
  Alert,
  Badge,
  Button,
  Checkbox,
  ContextMenu,
  DataTable,
  Icon,
  Indicator,
  Input,
  Menu,
  Popover,
  ResourcePage,
  SegmentedControl,
  Stack,
  Switch,
  Typography,
  type ContextMenuItem,
  type DataTableColumn,
} from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { usePluginList, usePluginRules } from "../bridge/queries";
import type { PluginRow } from "../bridge/types";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useAction } from "../features/games/use-action";
import { PluginGroupsDialog, PluginRulesDialog } from "../features/plugins/PluginDialogs";
import { PluginPanel } from "../features/plugins/PluginInspector";
import { PluginFlags, limitLabel, originLabel, problemShort } from "../features/plugins/plugin-labels";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { MAIN_ID, useNavigation } from "../shell/navigation";
import { BusyBand, HonestEmpty, LoadingState, NoMatch, WorkspaceGate } from "./PageBody";

type QuickFilter = "all" | "active" | "inactive" | "problems";
type FlagFilter = "all" | "master" | "light" | "none";
type OriginFilter = "all" | "mod" | "base_game" | "unmanaged";

/** A limit at or above this share of its maximum is painted as a warning. */
const LIMIT_WARNING = 0.75;

/**
 * Plugins (ui/telas/plugins.md, board JogoPlugins): the inventory of the
 * active profile. Header line with active plugins, each limit of the
 * adapter and the plugins with errors; a filter row with search, Filtros,
 * the quick filter and automatic sorting; the table and, beside it, the
 * panel of the chosen plugin. The order is worked on in Load Order; here
 * the index is only informative. Every figure comes from the backend.
 */
export function PluginsPage() {
  return <WorkspaceGate>{(instance) => <PluginsWorkspace instance={instance} />}</WorkspaceGate>;
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
  const [quick, setQuick] = useState<QuickFilter>(route.filter === "active" ? "active" : "all");
  useEffect(() => {
    if (route.filter === "active") setQuick("active");
  }, [route.filter]);
  const [flag, setFlag] = useState<FlagFilter>("all");
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const [showDisabled, setShowDisabled] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [inspected, setInspected] = useState<string | null>(route.plugin ?? null);
  const [dialog, setDialog] = useState<"rules" | "groups" | null>(route.pluginDialog ?? null);
  const [groupFor, setGroupFor] = useState("");
  const [contextRow, setContextRow] = useState<PluginRow | null>(null);
  const filterCount = (flag !== "all" ? 1 : 0) + (origin !== "all" ? 1 : 0) + (showDisabled ? 1 : 0);
  const filtered = query.trim() !== "" || quick !== "all" || flag !== "all" || origin !== "all";
  const clearFilters = () => {
    setQuery("");
    setQuick("all");
    setFlag("all");
    setOrigin("all");
  };

  useEffect(() => {
    if (route.plugin) setInspected(route.plugin);
    if (route.pluginDialog) setDialog(route.pluginDialog);
  }, [route.plugin, route.pluginDialog]);

  const data = list.status === "ready" ? list.data : null;
  const all = data?.rows ?? [];
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.modName.toLowerCase().includes(q)) return false;
      if (quick === "active" && !r.enabled) return false;
      if (quick === "inactive" && r.enabled) return false;
      if (quick === "problems" && r.problems === 0) return false;
      if (flag === "master" && !r.flags.includes("master")) return false;
      if (flag === "light" && !r.flags.includes("light")) return false;
      if (flag === "none" && r.flags.length > 0) return false;
      if (origin !== "all" && r.origin !== origin) return false;
      return true;
    });
  }, [all, query, quick, flag, origin]);

  const setEnabled = (names: string[], enabled: boolean) => void run(() => backend.setPluginsEnabled(instance, names, enabled));
  // Only the user's groups can be chosen; a provider's (LOOT) are read-only (D143).
  const groups = rules.status === "ready" ? rules.data.groups.filter((g) => !g.source) : [];
  const withProblems = all.filter((r) => r.problems > 0).length;

  const columns = useMemo<DataTableColumn<PluginRow>[]>(
    () => [
      {
        id: "status",
        label: t("plugins.column.active"),
        width: 64,
        cell: (r) => (
          <span onClick={(e) => e.stopPropagation()}>
            <Switch
              size="xs"
              checked={r.enabled}
              disabled={r.implicit}
              aria-label={t(r.implicit ? "plugins.implicitToggle" : r.enabled ? "plugins.toggleOff" : "plugins.toggleLabel", { name: r.name })}
              onCheckedChange={(next) => !r.implicit && setEnabled([r.name], next)}
            />
          </span>
        ),
      },
      { id: "index", label: t("plugins.column.index"), width: 74, cell: (r) => <span className="font-mono text-xs text-fg-muted">{r.index}</span> },
      {
        id: "name",
        label: t("plugins.column.plugin"),
        width: 280,
        grow: true,
        cell: (r) => {
          const problem = problemShort(i18n, r);
          return (
            <span className="flex min-w-0 flex-col gap-1.25">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`truncate text-sm font-medium ${r.enabled ? "text-fg" : "text-fg-muted"}`}>{r.name}</span>
                {problem ? (
                  <span data-intent="danger" className="flex shrink-0 items-center gap-1.25 text-xs font-medium text-intent-text">
                    <CircleXIcon size="xs" />
                    {problem}
                  </span>
                ) : null}
              </span>
              <PluginFlags row={r} i18n={i18n} />
            </span>
          );
        },
      },
      {
        id: "group",
        label: t("plugins.column.group"),
        width: 124,
        cell: (r) => <span className="truncate text-fg-muted">{r.implicit ? t("plugins.group.fixed") : r.group || t("plugins.group.default")}</span>,
      },
      {
        id: "mod",
        label: t("plugins.column.mod"),
        width: 204,
        cell: (r) =>
          r.mod ? (
            <Button
              size="inline"
              emphasis="low"
              intent="brand"
              className="max-w-full truncate font-normal"
              onClick={(e) => {
                e.stopPropagation();
                navigate({ view: "mods", focusMod: r.mod });
              }}
            >
              {r.modName}
            </Button>
          ) : (
            <span className="truncate text-fg-muted">{originLabel(i18n, r.origin)}</span>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n, t, instance],
  );

  const chosen = [...selected];
  const contextItems: ContextMenuItem[] = [];
  if (contextRow && !contextRow.implicit) {
    contextItems.push({
      id: "toggle",
      label: t(contextRow.enabled ? "plugins.action.deactivate" : "plugins.action.activate"),
      onSelect: () => setEnabled([contextRow.name], !contextRow.enabled),
    });
    contextItems.push({
      id: "lock",
      label: t(contextRow.locked ? "plugins.action.unlock" : "plugins.action.lock"),
      onSelect: () => void run(() => backend.setIndexLock(instance, [contextRow.name], !contextRow.locked)),
    });
    for (const g of groups) {
      if (g.name === contextRow.group) continue;
      contextItems.push({
        id: `group:${g.name}`,
        label: t("plugins.action.moveToGroup", { group: g.default ? t("plugins.group.default") : g.name }),
        onSelect: () => void run(() => backend.setPluginGroup(instance, [contextRow.name], g.name)),
      });
    }
    contextItems.push({ id: "order", label: t("plugins.panel.seeInOrder"), onSelect: () => navigate({ view: "load_order", plugin: contextRow.name }) });
  }

  let meta: React.ReactNode = null;
  if (data) {
    meta = (
      <>
        <Indicator variant="chip" icon={Plug} value={String(data.active)} label={t("plugins.header.active", { total: all.length })} />
        {data.limits.map((l) => {
          const share = l.max > 0 ? l.used / l.max : 0;
          const near = share >= LIMIT_WARNING;
          return (
            <Indicator
              key={l.kind}
              variant="chip"
              lead={limitLabel(i18n, l)}
              value={i18n.formatNumber(l.used)}
              label={t("plugins.header.of", { max: i18n.formatNumber(l.max) })}
              {...(near ? { meter: share, meterIntent: share >= 1 ? ("danger" as const) : ("warning" as const) } : {})}
            />
          );
        })}
        {data.errors > 0 ? <Indicator variant="chip" intent="danger" icon={CircleXIcon} value={String(data.errors)} label={t("plugins.header.errors")} /> : null}
      </>
    );
  }

  return (
    <ResourcePage
      id={MAIN_ID}
      tabIndex={-1}
      layout="workspace"
      className="focus:outline-none"
      title={t("nav.plugins")}
      meta={meta}
      primaryActions={
        <>
          <Button onClick={() => setDialog("rules")}>{t("plugins.action.rules")}</Button>
          <Button onClick={() => setDialog("groups")}>{t("plugins.action.groups")}</Button>
          <Menu.Root placement="bottom-end">
            <Menu.Trigger>
              <Button size="icon" aria-label={t("mods.toolbar.more")} title={t("mods.toolbar.more")}>
                <MoreHorizontalIcon size="sm" />
              </Button>
            </Menu.Trigger>
            <Menu.Content>
              <Menu.Item disabled={!data} onSelect={() => data && setEnabled(data.rows.filter((r) => !r.implicit && !r.enabled).map((r) => r.name), true)}>
                {t("plugins.action.enableAll")}
              </Menu.Item>
              <Menu.Item disabled={!data} onSelect={() => data && setEnabled(data.rows.filter((r) => !r.implicit && r.enabled).map((r) => r.name), false)}>
                {t("plugins.action.disableAll")}
              </Menu.Item>
              <Menu.Item onSelect={() => void run(() => backend.openInstanceFolder(instance, "game"))}>{t("mods.open.game")}</Menu.Item>
              <Menu.Item onSelect={() => navigate({ view: "load_order" })}>{t("plugins.action.openLoadOrder")}</Menu.Item>
            </Menu.Content>
          </Menu.Root>
        </>
      }
    >
      <BusyBand />
      {data?.external ? (
        <Alert.Root intent="warning" className="mb-2">
          <Alert.Description>
            <span className="flex flex-wrap items-center gap-2">
              {t("diag.code.load_order_external_change")}
              <Button size="sm" onClick={() => navigate({ view: "load_order", review: true })}>
                {t("loadOrder.review.open")}
              </Button>
            </span>
          </Alert.Description>
        </Alert.Root>
      ) : null}
      {data && data.cycle.length > 0 ? (
        <Alert.Root intent="danger" className="mb-2">
          <Alert.Description>{t("plugins.cycle", { plugins: data.cycle.join(" → ") })}</Alert.Description>
        </Alert.Root>
      ) : null}
      {list.status === "error" ? <ErrorAlert title="plugins.loadError" error={list.error} onRetry={list.reload} /> : null}
      {list.status === "loading" ? <LoadingState /> : null}
      {data && data.rows.every((r) => r.implicit) && data.disabled.length === 0 ? (
        <HonestEmpty icon={Plug} title="plugins.emptyTitle" description="plugins.emptyDescription" />
      ) : null}

      {data && !data.rows.every((r) => r.implicit) ? (
        <>
          <div className="flex h-12 shrink-0 items-center gap-2.5">
            <div className="w-70 shrink-0">
              <Input.Root fullWidth value={query} onChange={setQuery}>
                <Input.Box>
                  <SearchIcon size="sm" className="text-fg-muted" />
                  <Input.Field data-page-search aria-label={t("plugins.search")} placeholder={t("plugins.search")} />
                </Input.Box>
              </Input.Root>
            </div>
            <Popover.Root placement="bottom-start">
              <Popover.Trigger>
                <Button startIcon={<Icon icon={SlidersHorizontal} size="sm" />}>
                  {t("mods.filter.button")}
                  {filterCount > 0 ? <Badge intent="info">{filterCount}</Badge> : null}
                </Button>
              </Popover.Trigger>
              <Popover.Content className="w-80 p-4">
                <Stack gap="md">
                  <Input.Root fullWidth value={flag} onChange={(v: string) => setFlag(v as FlagFilter)}>
                    <Input.Label>{t("plugins.filter.flags")}</Input.Label>
                    <Input.Select options={(["all", "master", "light", "none"] as const).map((v) => ({ value: v, label: t(`plugins.filter.flags.${v}` as MessageKey) }))} />
                  </Input.Root>
                  <Input.Root fullWidth value={origin} onChange={(v: string) => setOrigin(v as OriginFilter)}>
                    <Input.Label>{t("plugins.filter.origin")}</Input.Label>
                    <Input.Select
                      options={(["all", "mod", "base_game", "unmanaged"] as const).map((v) => ({ value: v, label: v === "all" ? t("plugins.filter.origin.all") : originLabel(i18n, v) }))}
                    />
                  </Input.Root>
                  <Checkbox checked={showDisabled} onCheckedChange={setShowDisabled} label={tp("plugins.filter.disabledMods", data.disabled.length)} />
                </Stack>
              </Popover.Content>
            </Popover.Root>
            <SegmentedControl<QuickFilter>
              aria-label={t("mods.quick.label")}
              className="ml-1.5"
              value={quick}
              onChange={setQuick}
              options={[
                { value: "all", label: <>{t("plugins.filter.status.all")} <span className="text-xs text-fg-muted">{all.length}</span></> },
                { value: "active", label: <>{t("plugins.filter.status.active")} <span className="text-xs text-fg-muted">{data.active}</span></> },
                { value: "inactive", label: <>{t("plugins.filter.status.inactive")} <span className="text-xs text-fg-muted">{all.length - data.active}</span></> },
                {
                  value: "problems",
                  label: (
                    <>
                      {t("plugins.filter.problems")}{" "}
                      <span data-intent={withProblems > 0 ? "danger" : undefined} className={`text-xs ${withProblems > 0 ? "font-semibold text-intent-text" : "text-fg-muted"}`}>
                        {withProblems}
                      </span>
                    </>
                  ),
                },
              ]}
            />
            <span className="flex-1" />
            <span className="shrink-0 whitespace-nowrap">
              <Switch size="xs" checked={data.autoSort} onCheckedChange={(on) => void run(() => backend.setAutoSort(instance, on))} label={t("plugins.autoSort")} />
            </span>
            <Button
              intent="brand"
              className="shrink-0 whitespace-nowrap"
              disabled={data.cycle.length > 0}
              onClick={() =>
                void run(() => backend.sortPlugins(instance)).then((r) => {
                  if (r.ok) navigate({ view: "plugins" });
                })
              }
            >
              {t("plugins.action.sort")}
            </Button>
          </div>

          {chosen.length >= 2 ? (
            <ActionBar role="toolbar" aria-label={tp("plugins.selection", chosen.length)} className="mb-2 rounded-card border sm:justify-start">
              <Typography variant="body-sm" color="fg" className="mr-auto">
                {tp("plugins.selection", chosen.length)}
              </Typography>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" startIcon={<PowerIcon size="sm" />} onClick={() => setEnabled(chosen, true)}>
                  {t("plugins.action.activate")}
                </Button>
                <Button size="sm" startIcon={<Icon icon={PowerOff} size="sm" />} onClick={() => setEnabled(chosen, false)}>
                  {t("plugins.action.deactivate")}
                </Button>
                <Input.Root
                  value={groupFor}
                  onChange={(g: string) => {
                    setGroupFor("");
                    if (g) void run(() => backend.setPluginGroup(instance, chosen, g));
                  }}
                >
                  <Input.Select aria-label={t("plugins.action.setGroup")} placeholder={t("plugins.action.setGroup")} options={groups.map((g) => ({ value: g.name, label: g.default ? t("plugins.group.default") : g.name }))} />
                </Input.Root>
                <Button size="sm" startIcon={<LockIcon size="sm" />} onClick={() => void run(() => backend.setIndexLock(instance, chosen, true))}>
                  {t("plugins.action.lock")}
                </Button>
                <Button size="sm" startIcon={<LockOpenIcon size="sm" />} onClick={() => void run(() => backend.setIndexLock(instance, chosen, false))}>
                  {t("plugins.action.unlock")}
                </Button>
              </div>
            </ActionBar>
          ) : null}

          <div className={`mt-2 grid min-h-0 flex-1 gap-4 ${inspected ? "grid-cols-[minmax(0,1fr)_20.625rem]" : "grid-cols-1"}`}>
            <ContextMenu items={contextItems} className="flex min-h-0 min-w-0 flex-col">
              <DataTable
                aria-label={t("plugins.tableLabel")}
                className="min-h-0 flex-1"
                columns={columns}
                rows={rows}
                getRowId={(r) => r.name}
                selectionMode="multiple"
                selectedIds={selected}
                onSelectedIdsChange={setSelected}
                onFocusedIdChange={(id) => id && setInspected(id)}
                onRowActivate={(r) => setInspected(r.name)}
                onRowContextMenu={(_, r) => setContextRow(r)}
                density="relaxed"
                onRowKeyDown={(event, r) => {
                  if (event.key !== " " || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
                  event.preventDefault();
                  if (!r.implicit) setEnabled([r.name], !r.enabled);
                }}
                empty={<NoMatch message="plugins.noMatch" onClear={filtered ? clearFilters : undefined} />}
                labels={{ resizeColumn: t("table.resizeColumn"), loading: t("common.loading") }}
              />
            </ContextMenu>
            {inspected && data.rows.some((r) => r.name.toLowerCase() === inspected.toLowerCase()) ? (
              <PluginPanel instance={instance} name={inspected} onClose={() => setInspected(null)} />
            ) : null}
          </div>
          {showDisabled && data.disabled.length > 0 ? (
            <section aria-label={t("plugins.disabledTitle")} className="mt-3 rounded-card border border-border bg-surface p-3">
              <Typography variant="heading-6" color="fg">
                {t("plugins.disabledTitle")}
              </Typography>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {data.disabled.map((d) => (
                  <li key={`${d.mod}:${d.name}`} className="flex items-center gap-2 text-fg-muted">
                    <span className="text-fg">{d.name}</span>·<span>{t(d.losing ? "plugins.disabled.losing" : "plugins.disabled.mod", { mod: d.modName })}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
      <PluginRulesDialog instance={instance} open={dialog === "rules"} onClose={() => setDialog(null)} />
      <PluginGroupsDialog instance={instance} open={dialog === "groups"} onClose={() => setDialog(null)} />
    </ResourcePage>
  );
}

