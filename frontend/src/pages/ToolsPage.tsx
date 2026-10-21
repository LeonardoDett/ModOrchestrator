import { useCallback, useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { MoreHorizontalIcon, PlayIcon, PlusIcon, XIcon } from "dettmann-ui/icons";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Indicator,
  Menu,
  ReorderableList,
  ResourcePage,
  Tag,
  Typography,
  type ReorderableListItem,
} from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useTools, useWorkspace } from "../bridge/queries";
import type { KnownTool, ToolEntry } from "../bridge/types";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useAction } from "../features/games/use-action";
import { ToolEditDialog } from "../features/tools/ToolEditDialog";
import { DotIcon, RunningMark, ToolIcon, toInput, useLocateTool, useStartTool, type MissingExe } from "../features/tools/tool-parts";
import { useI18n } from "../i18n/i18n";
import { MAIN_ID, useNavigation } from "../shell/navigation";
import { HonestEmpty, LoadingState, WorkspaceGate } from "./PageBody";

/**
 * Ferramentas (board JogoFerramentas, D146): the external tools of the
 * instance, in the order of the top bar menu (drag to change it), the
 * panel of the chosen tool and the tools the adapter knows. Tools are
 * optional: the list shows no status column (the user's call on the
 * board); a missing executable only shows when the user starts the tool.
 * Running state, the blocking tool and the variables come from the backend.
 */
export function ToolsPage() {
  return <WorkspaceGate>{(instance) => <ToolsWorkspace instance={instance} />}</WorkspaceGate>;
}

type Editing = { tool: ToolEntry | null } | null;

function ToolsWorkspace({ instance }: { instance: string }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const { route, navigate } = useNavigation();
  const list = useTools(instance);
  const ws = useWorkspace();
  const gameName = ws.status === "ready" ? (ws.data.active?.gameName ?? "") : "";
  const [inspected, setInspected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<ToolEntry | null>(null);
  const [missing, setMissing] = useState<MissingExe | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const onMissing = useCallback((m: MissingExe) => setMissing(m), []);
  const start = useStartTool(instance, onMissing);
  const locate = useLocateTool(instance);

  const data = list.status === "ready" ? list.data : null;
  const tools = data?.tools ?? [];
  useEffect(() => {
    // From the top bar menu: the tool to show and, when its executable was
    // not found, the message with "Localizar…".
    if (!route.tool || !data) return;
    const tool = data.tools.find((x) => x.id === route.tool);
    if (!tool) return;
    setInspected(tool.id);
    if (route.missingPath !== undefined) setMissing({ tool, path: route.missingPath });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.tool, route.missingPath, data === null]);
  useEffect(() => {
    // The first tool opens in the panel, as in the board; a tool that left
    // the list closes it. A local drag order lasts until the backend answers.
    if (!data) return;
    setOrder(null);
    if (inspected && !tools.some((x) => x.id === inspected)) setInspected(null);
    else if (!inspected && tools.length > 0) setInspected(tools[0]!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const ordered = order ? order.map((id) => tools.find((x) => x.id === id)).filter((x): x is ToolEntry => Boolean(x)) : tools;
  const running = tools.filter((x) => x.running).length;
  const current = tools.find((x) => x.id === inspected) ?? null;

  const reorder = (items: ReorderableListItem<ToolEntry>[]) => {
    const ids = items.map((i) => i.id);
    const moved = ids.find((id, i) => ordered[i]?.id !== id && ordered.findIndex((x) => x.id === id) !== i);
    setOrder(ids);
    if (!moved) return;
    // The dragged tool is the one whose new place differs most from the old.
    let best = moved;
    let dist = 0;
    for (const id of ids) {
      const d = Math.abs(ids.indexOf(id) - ordered.findIndex((x) => x.id === id));
      if (d > dist) {
        dist = d;
        best = id;
      }
    }
    void run(() => backend.moveTool(instance, best, ids.indexOf(best)));
  };
  const moveBy = (tool: ToolEntry, delta: number) => {
    const at = ordered.findIndex((x) => x.id === tool.id);
    const to = at + delta;
    if (to < 0 || to >= ordered.length) return;
    void run(() => backend.moveTool(instance, tool.id, to));
  };
  const duplicate = (tool: ToolEntry) =>
    void run(() => backend.saveTool(instance, { ...toInput(tool), id: "", known: "", name: t("tools.duplicateName", { name: tool.name }) }), { success: "tools.saved" });

  let meta: React.ReactNode = null;
  if (data) {
    meta = (
      <>
        <Indicator variant="chip" icon={Wrench} intent="brand" value={i18n.formatNumber(tools.length)} label={tp("tools.header.count", tools.length)} />
        {running > 0 ? <Indicator variant="chip" icon={DotIcon} intent="success" value={i18n.formatNumber(running)} label={t("tools.header.running")} /> : null}
      </>
    );
  }

  return (
    <ResourcePage
      id={MAIN_ID}
      tabIndex={-1}
      layout="workspace"
      className="focus:outline-none"
      title={t("nav.tools")}
      meta={meta}
      primaryActions={
        <>
          <Button emphasis="high" startIcon={<PlusIcon size="sm" />} onClick={() => setEditing({ tool: null })}>
            {t("tools.action.add")}
          </Button>
          <Menu.Root placement="bottom-end">
            <Menu.Trigger>
              <Button size="icon" aria-label={t("tools.action.more")} title={t("tools.action.more")}>
                <MoreHorizontalIcon size="sm" />
              </Button>
            </Menu.Trigger>
            <Menu.Content>
              <Menu.Item onSelect={() => list.reload()}>{t("tools.action.reload")}</Menu.Item>
              <Menu.Item onSelect={() => navigate({ view: "instance_settings" })}>{t("tools.action.instanceSettings")}</Menu.Item>
            </Menu.Content>
          </Menu.Root>
        </>
      }
    >
      {/* No busy band (board): editing the list never takes the instance lock, and
          the exclusive tool that holds it is shown in the menu card. */}
      {list.status === "error" ? <ErrorAlert title="tools.loadError" error={list.error} onRetry={list.reload} /> : null}
      {list.status === "loading" ? <LoadingState /> : null}
      {data ? (
        <div className={`mb-6 grid min-h-0 flex-1 gap-4 ${current ? "grid-cols-[minmax(0,1fr)_21.25rem]" : "grid-cols-1"}`}>
          <div className="flex min-h-0 min-w-0 flex-col gap-4.5 overflow-auto">
            {missing ? (
              <Alert.Root
                intent="warning"
                compact
                action={
                  <Button
                    size="sm"
                    onClick={() =>
                      void locate(missing.tool).then((ok) => {
                        if (ok) setMissing(null);
                      })
                    }
                  >
                    {t("tools.action.locate")}
                  </Button>
                }
                onDismiss={() => setMissing(null)}
                dismissLabel={t("common.close")}
              >
                <Alert.Title>{t("tools.missing.title", { name: missing.tool.name })}</Alert.Title>
                <Alert.Description>{t("tools.missing.description", { path: missing.path })}</Alert.Description>
              </Alert.Root>
            ) : null}
            {tools.length === 0 ? (
              <HonestEmpty icon={Wrench} title="tools.empty.title" description="tools.empty.description">
                <Button startIcon={<PlusIcon size="sm" />} onClick={() => setEditing({ tool: null })}>
                  {t("tools.action.add")}
                </Button>
              </HonestEmpty>
            ) : (
              <div className="flex shrink-0 flex-col overflow-hidden rounded-card border border-border bg-surface">
                <div data-layer="medium" className="flex h-9 items-center border-b border-border bg-structure px-4 text-xs text-fg-muted">{t("tools.orderHint")}</div>
                <ReorderableList<ToolEntry>
                  aria-label={t("tools.listLabel")}
                  className="rounded-none border-0"
                  keyboardControls={false}
                  items={ordered.map((x) => ({ id: x.id, data: x }))}
                  onReorder={reorder}
                  labels={{ dragHandle: t("tools.drag"), moveUp: t("tools.moveUp"), moveDown: t("tools.moveDown") }}
                  renderItem={(item, index) => (
                    <ToolRow
                      instance={instance}
                      tool={item.data}
                      selected={item.id === inspected}
                      first={index === 0}
                      last={index === ordered.length - 1}
                      blocker={data.blocker}
                      onSelect={() => setInspected(item.id)}
                      onStart={() => void start(item.data)}
                      onEdit={() => setEditing({ tool: item.data })}
                      onDuplicate={() => duplicate(item.data)}
                      onMove={(delta) => moveBy(item.data, delta)}
                      onRemove={() => setRemoving(item.data)}
                    />
                  )}
                />
              </div>
            )}
            {data.suggestions.length > 0 ? <KnownTools instance={instance} gameName={gameName} known={data.suggestions} /> : null}
          </div>
          {current ? (
            <ToolPanel
              instance={instance}
              tool={current}
              onClose={() => setInspected(null)}
              onEdit={() => setEditing({ tool: current })}
              onDuplicate={() => duplicate(current)}
              onRemove={() => setRemoving(current)}
            />
          ) : null}
        </div>
      ) : null}
      {editing && data ? <ToolEditDialog instance={instance} gameName={gameName} tool={editing.tool} variables={data.variables} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        type="danger"
        title={t("tools.remove.title", { name: removing?.name ?? "" })}
        description={t("tools.remove.description")}
        confirmLabel={t("tools.action.remove")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          const id = removing?.id ?? "";
          setRemoving(null);
          void run(() => backend.deleteTool(instance, id), { success: "tools.removed" });
        }}
      />
    </ResourcePage>
  );
}

/** One line of the list (58 px): icon, name, tags, path, Iniciar and the row menu. */
function ToolRow({
  instance,
  tool,
  selected,
  first,
  last,
  blocker,
  onSelect,
  onStart,
  onEdit,
  onDuplicate,
  onMove,
  onRemove,
}: {
  instance: string;
  tool: ToolEntry;
  selected: boolean;
  first: boolean;
  last: boolean;
  blocker: string;
  onSelect: () => void;
  onStart: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const blocked = !tool.running && blocker !== "";
  const path = tool.args ? `${tool.exe} ${tool.args}` : tool.exe;
  return (
    <div
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      className={`relative flex h-14.5 cursor-default items-center gap-3 pr-3 ${selected ? "bg-selected before:absolute before:inset-y-1 before:-left-9 before:w-0.5 before:rounded-pill before:bg-brand-fill" : ""}`}
    >
      {/* The name is the keyboard way to open the panel; Iniciar and the menu stay separate buttons. */}
      <button type="button" aria-pressed={selected} onClick={onSelect} className="focus-ring-inset flex min-w-0 flex-1 items-center gap-3 self-stretch rounded-chip text-left">
        <ToolIcon instance={instance} tool={tool} size="md" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.75">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-fg">{tool.name}</span>
            {tool.running ? <RunningMark label={t("tools.running")} /> : null}
            {tool.exclusive ? <Tag size="xs">{t("tools.tag.exclusive")}</Tag> : null}
            {tool.deployBefore ? <Tag size="xs">{t("tools.tag.deployBefore")}</Tag> : null}
          </span>
          <span className="truncate font-mono text-xs text-fg-muted" title={path}>
            {path}
          </span>
        </span>
      </button>
      <span onClick={(e) => e.stopPropagation()} className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          intent={tool.running ? undefined : "brand"}
          emphasis={tool.running ? "low" : "medium"}
          className="w-24"
          disabled={tool.running || blocked}
          title={blocked ? t("tools.menu.blockedTip", { name: blocker }) : undefined}
          startIcon={tool.running ? undefined : <PlayIcon size="xs" />}
          onClick={onStart}
        >
          {t(tool.running ? "tools.action.open" : "tools.action.start")}
        </Button>
        <Menu.Root placement="bottom-end">
          <Menu.Trigger>
            <Button size="icon-sm" emphasis="low" aria-label={t("tools.action.rowMenu", { name: tool.name })} title={t("tools.action.rowMenu", { name: tool.name })}>
              <MoreHorizontalIcon size="sm" className="rotate-90" />
            </Button>
          </Menu.Trigger>
          <Menu.Content>
            <Menu.Item onSelect={onEdit}>{t("tools.action.edit")}</Menu.Item>
            <Menu.Item onSelect={onDuplicate}>{t("tools.action.duplicate")}</Menu.Item>
            <Menu.Separator />
            <Menu.Item disabled={first} onSelect={() => onMove(-1)}>
              {t("tools.moveUp")}
            </Menu.Item>
            <Menu.Item disabled={last} onSelect={() => onMove(1)}>
              {t("tools.moveDown")}
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item onSelect={onRemove}>{t("tools.action.remove")}</Menu.Item>
          </Menu.Content>
        </Menu.Root>
      </span>
    </div>
  );
}

/** "Ferramentas conhecidas de {jogo}": the adapter's suggestions, found or optional. */
function KnownTools({ instance, gameName, known }: { instance: string; gameName: string; known: KnownTool[] }) {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const add = async (k: KnownTool) => {
    let exe = "";
    if (!k.found) {
      exe = await backend.pickToolExecutable(t("tools.edit.pickExe"));
      if (!exe) return;
    }
    void run(() => backend.addKnownTool(instance, k.id, exe), { success: "tools.known.added" });
  };
  return (
    <section aria-labelledby="known-tools" className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2.5">
        <h2 id="known-tools" className="m-0 text-md font-semibold text-fg">
          {t("tools.known.title", { game: gameName })}
        </h2>
        <Typography variant="body-sm" color="muted-fg" className="text-xs">
          {t("tools.known.hint")}
        </Typography>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {known.map((k) => (
          <Card.Root key={k.id} className="flex items-center gap-3 px-3.5 py-3">
            <span className="flex min-w-0 flex-1 flex-col gap-0.75">
              <span className="truncate font-semibold text-fg">{k.name}</span>
              <span className={`truncate text-xs ${k.found ? "text-fg-muted" : "text-fg-subtle"}`}>{t(k.found ? "tools.known.found" : "tools.known.optional")}</span>
            </span>
            <Button size="sm" intent={k.found ? "brand" : undefined} className="shrink-0" onClick={() => void add(k)}>
              {t(k.found ? "tools.known.add" : "tools.action.locate")}
            </Button>
          </Card.Root>
        ))}
      </div>
    </section>
  );
}

/** The panel of the chosen tool (board JogoFerramentas, aside 340 px). */
function ToolPanel({
  instance,
  tool,
  onClose,
  onEdit,
  onDuplicate,
  onRemove,
}: {
  instance: string;
  tool: ToolEntry;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const elapsed = tool.running && tool.startedAt ? Math.max(0, Date.now() - Date.parse(tool.startedAt)) : 0;
  // Whole seconds under a minute, whole minutes after ("há 12 min").
  const since = tool.running && tool.startedAt ? i18n.formatDuration(elapsed < 60_000 ? Math.round(elapsed / 1000) * 1000 : Math.round(elapsed / 60_000) * 60_000) : "";
  return (
    <aside aria-label={t("tools.panel.label")} className="flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface">
      <div className="flex shrink-0 items-start gap-3 border-b border-border p-4">
        <ToolIcon instance={instance} tool={tool} size="lg" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-md font-semibold text-fg">{tool.name}</span>
          {tool.running ? <RunningMark label={t("tools.runningSince", { duration: since })} /> : null}
        </span>
        <Button size="icon-sm" emphasis="low" aria-label={t("tools.panel.close")} title={t("tools.panel.close")} onClick={onClose}>
          <XIcon size="sm" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-col gap-3.5 overflow-auto px-4 py-3.5 text-sm">
        <dl className="grid grid-cols-[6.75rem_minmax(0,1fr)] gap-x-3 gap-y-2.25">
          <dt className="text-fg-muted">{t("tools.panel.exe")}</dt>
          <dd className="break-all font-mono text-xs text-fg">{tool.exe}</dd>
          <dt className="text-fg-muted">{t("tools.panel.args")}</dt>
          <dd className={tool.args ? "break-all font-mono text-xs text-fg" : "text-fg-muted"}>{tool.args || t("tools.panel.argsNone")}</dd>
          <dt className="text-fg-muted">{t("tools.panel.workDir")}</dt>
          <dd className={tool.workDir ? "break-all font-mono text-xs text-fg" : "text-fg"}>{tool.workDir || t("tools.panel.workDirDefault")}</dd>
          <dt className="text-fg-muted">{t("tools.panel.env")}</dt>
          <dd className={tool.env.length > 0 ? "break-all font-mono text-xs text-fg" : "text-fg-muted"}>
            {tool.env.length > 0 ? tool.env.map((e) => `${e.name}=${e.value}`).join("\n") : t("tools.panel.envNone")}
          </dd>
          <dt className="text-fg-muted">{t("tools.panel.exclusive")}</dt>
          <dd className="text-fg">{t(tool.exclusive ? "tools.panel.yes" : "tools.panel.no")}</dd>
          <dt className="text-fg-muted">{t("tools.panel.deployBefore")}</dt>
          <dd className="text-fg">{t(tool.deployBefore ? "tools.panel.yes" : "tools.panel.no")}</dd>
        </dl>
        <Alert.Root intent="info">
          <Alert.Description>{t(tool.exclusive ? "tools.panel.exclusiveHelp" : "tools.panel.sharedHelp", { name: tool.name })}</Alert.Description>
        </Alert.Root>
      </div>
      <span className="flex-1" />
      <div className="flex h-13 shrink-0 items-center gap-2 border-t border-border-subtle bg-surface-sunken pl-4 pr-3">
        <Button size="sm" onClick={onEdit}>
          {t("tools.action.edit")}
        </Button>
        <Button size="sm" onClick={onDuplicate}>
          {t("tools.action.duplicate")}
        </Button>
        <span className="flex-1" />
        <Button size="sm" emphasis="low" intent="danger" onClick={onRemove}>
          {t("tools.action.remove")}
        </Button>
      </div>
    </aside>
  );
}
