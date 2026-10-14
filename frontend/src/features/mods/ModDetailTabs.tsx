import { useMemo, useState } from "react";
import { NotebookPen, Tag as TagGlyph } from "lucide-react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleXIcon,
  ClockIcon,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  LayersIcon,
  LockIcon,
  PackageIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
} from "dettmann-ui/icons";
import { Button, ContextMenu, Icon, Input, Loader, Progress, SegmentedControl, Table, Tag, Tree, type CategoryColor, type ContextMenuItem, type TreeNode } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { useModConflictFiles, useModConflicts, useModExtensions, useModHistory, useModList } from "../../bridge/queries";
import type { ConflictOpponent, FileLocation, FomodChoice, ModConflictFile, ModDetails, ModHistoryEntry } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import { formatSize } from "./mod-labels";

/** The one-line title and help over a tab body (boards JogoModConflitos, JogoModInstalacao). */
function TabTitle({ title, help, children }: { title: string; help: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[0.9375rem] font-semibold text-fg">{title}</span>
        <span className="truncate text-[0.8125rem] text-fg-muted">{help}</span>
      </div>
      {children}
    </div>
  );
}

type ConflictFilter = "all" | "loses" | "wins";

/** What this mod gets from one opponent: wins, loses, both or only identical files. */
function verdict(o: ConflictOpponent): { key: MessageKey; intent: "success" | "danger" | "warning" | "neutral"; icon?: typeof ArrowUpIcon } {
  if (o.wins > 0 && o.loses > 0) return { key: "mods.detail.pillMixed", intent: "warning" };
  if (o.wins > 0) return { key: "mods.detail.pillWins", intent: "success", icon: ArrowUpIcon };
  if (o.loses > 0) return { key: "mods.detail.pillLoses", intent: "danger", icon: ArrowDownIcon };
  return { key: "mods.detail.pillSame", intent: "neutral" };
}

/**
 * Conflicts (board JogoModConflitos): the mods that dispute files with this
 * one, how many files and who wins. Deciding happens on the Conflicts page.
 */
export function ConflictsTab({ instance, mod, onOpenConflictsPage }: { instance: string; mod: ModDetails; onOpenConflictsPage: () => void }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const data = useModConflicts(instance, mod.id);
  const mods = useModList(instance);
  const [filter, setFilter] = useState<ConflictFilter>("all");
  if (data.status === "error") return <ErrorAlert title="conflicts.loadError" error={data.error} onRetry={data.reload} />;
  if (data.status !== "ready") return <Loader label={t("common.loading")} />;
  const opponents = data.data.opponents;
  const categoryOf = new Map((mods.status === "ready" ? mods.data : []).map((m) => [m.id, m.categoryPath.join(" › ")]));
  const losing = opponents.filter((o) => o.loses > 0);
  const winning = opponents.filter((o) => o.wins > 0);
  let shown = opponents;
  if (filter === "loses") shown = losing;
  if (filter === "wins") shown = winning;
  const title = opponents.length > 0 ? tp("mods.detail.conflictsTitle", opponents.length) : t("mods.detail.conflictsNone");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 px-6 py-4.5">
      <TabTitle title={title} help={t("mods.detail.conflictsHelp")}>
        <Button emphasis="high" intent="warning" endIcon={<ChevronRightIcon size="sm" />} onClick={onOpenConflictsPage}>
          {t("mods.detail.openConflicts")}
        </Button>
      </TabTitle>
      {opponents.length > 0 ? (
        <>
          <div className="flex items-center">
            <SegmentedControl<ConflictFilter>
              size="sm"
              aria-label={t("mods.detail.conflictResult")}
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: t("mods.detail.filterAll", { count: opponents.length }) },
                { value: "loses", label: t("mods.detail.filterLoses", { count: losing.length }) },
                { value: "wins", label: t("mods.detail.filterWins", { count: winning.length }) },
              ]}
            />
          </div>
          <Table.Root density="relaxed" aria-label={t("mods.detail.involved")} className="min-h-0 flex-1 bg-raised">
            <colgroup>
              <col />
              <col className="w-45" />
              <col className="w-30" />
              <col className="w-31" />
            </colgroup>
            <Table.Header>
              <Table.Row>
                <Table.Head>{t("mods.detail.colMod")}</Table.Head>
                <Table.Head>{t("mods.detail.colCategory")}</Table.Head>
                <Table.Head>{t("mods.detail.colDisputed")}</Table.Head>
                <Table.Head>{t("mods.detail.colForThis")}</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {shown.map((o) => {
                const v = verdict(o);
                return (
                  <Table.Row key={o.opponent.id}>
                    <Table.Cell className="max-w-0 truncate font-medium">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{o.opponent.name}</span>
                        {o.lock ? (
                          <span className="text-fg-subtle" title={t("conflicts.inspector.locked", { rules: o.lock.rules.map((r) => t("conflicts.inspector.lockRule", { winner: r.winner.name, loser: r.loser.name })).join(", ") })}>
                            <LockIcon size="xs" />
                          </span>
                        ) : null}
                      </span>
                    </Table.Cell>
                    <Table.Cell className="truncate text-fg-muted">{categoryOf.get(o.opponent.id) || t("mods.noCategory")}</Table.Cell>
                    <Table.Cell className="text-fg-muted">{tp("mods.detail.fileCount", o.files)}</Table.Cell>
                    <Table.Cell>
                      <Tag size="sm" outline={false} intent={v.intent} {...(v.icon ? { icon: v.icon } : {})}>
                        {t(v.key)}
                      </Tag>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Root>
        </>
      ) : null}
    </div>
  );
}

type FileFilter = "all" | "conflicts" | `ext:${string}`;

const TYPE_COLORS: readonly CategoryColor[] = ["green", "blue", "amber", "violet"];

interface FileData {
  file?: ModConflictFile;
  size: number;
}

/** Folders first, by name; sizes add up from the files under each folder. */
function buildTree(files: readonly ModConflictFile[]): TreeNode<FileData>[] {
  interface Dir {
    id: string;
    name: string;
    size: number;
    dirs: Map<string, Dir>;
    files: TreeNode<FileData>[];
  }
  const root: Dir = { id: "", name: "", size: 0, dirs: new Map(), files: [] };
  for (const f of files) {
    const parts = f.location.path.split("/");
    const name = parts.pop() ?? f.location.path;
    let dir = root;
    dir.size += f.size;
    for (const part of parts) {
      let next = dir.dirs.get(part.toLowerCase());
      if (!next) {
        next = { id: `${dir.id}/${part.toLowerCase()}`, name: part, size: 0, dirs: new Map(), files: [] };
        dir.dirs.set(part.toLowerCase(), next);
      }
      next.size += f.size;
      dir = next;
    }
    dir.files.push({ id: `${f.location.target}:${f.location.path}`, label: name, data: { file: f, size: f.size } });
  }
  const toNodes = (dir: Dir): TreeNode<FileData>[] => [
    ...[...dir.dirs.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => ({ id: `dir:${d.id}`, label: d.name, children: toNodes(d), data: { size: d.size } })),
    ...dir.files.sort((a, b) => String(a.label).localeCompare(String(b.label))),
  ];
  return toNodes(root);
}

type FileNode = TreeNode<FileData>;

function folderIds(nodes: readonly FileNode[]): Set<string> {
  const out = new Set<string>();
  const visit = (list: readonly FileNode[]) => {
    for (const n of list) {
      if (n.children) {
        out.add(n.id);
        visit(n.children);
      }
    }
  };
  visit(nodes);
  return out;
}

/**
 * Files (board JogoModArquivos): files by type, a search, filters by type and
 * "Em conflito", and the footprint as a tree with Situação and Tamanho. The
 * menu of a file chooses its winner or hides it.
 */
export function FilesTab({
  instance,
  mod,
  onChooseWinner,
}: {
  instance: string;
  mod: ModDetails;
  onChooseWinner: (pair: { a: string; b: string; focus: FileLocation }) => void;
}) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FileFilter>("all");
  const [selected, setSelected] = useState<string | undefined>();
  const [menuFor, setMenuFor] = useState<ModConflictFile | null>(null);
  const files = useModConflictFiles(instance, mod.id, search);
  const ext = useModExtensions(mod.id);

  const all = files.status === "ready" ? files.data.files : [];
  const disputed = all.filter((f) => f.state === "wins" || f.state === "loses" || f.state === "redundant").length;
  const types = ext.status === "ready" ? ext.data : [];
  const top = types.slice(0, 3);
  const rest = types.slice(3).reduce((n, e) => n + e.files, 0);
  const segments = [
    ...top.map((e, i) => ({ label: e.ext || t("mods.detail.noExtension"), value: e.files, color: TYPE_COLORS[i]! })),
    ...(rest > 0 ? [{ label: t("mods.detail.legendOther"), value: rest, color: "gray" as const }] : []),
  ];
  const visible = useMemo(() => {
    if (filter === "conflicts") return all.filter((f) => f.state === "wins" || f.state === "loses" || f.state === "redundant");
    if (filter.startsWith("ext:")) {
      const e = filter.slice(4);
      return all.filter((f) => f.location.path.toLowerCase().endsWith(e));
    }
    return all;
  }, [all, filter]);
  const nodes = useMemo(() => buildTree(visible), [visible]);
  const expanded = useMemo(() => folderIds(nodes), [nodes]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const open = useMemo(() => new Set([...expanded].filter((id) => !collapsed.has(id))), [expanded, collapsed]);

  if (mod.state !== "installed") {
    return <p className="px-6 py-4.5 text-sm text-fg-muted">{t("mods.installation.none")}</p>;
  }

  const state = (f: ModConflictFile): { text: string; tone: string } => {
    if (f.state === "hidden") return { text: t("mods.detail.fileHidden"), tone: "text-fg-subtle" };
    if (f.state === "redundant") return { text: t("mods.detail.fileRedundant"), tone: "text-fg-muted" };
    if (f.state === "loses") return { text: t("mods.detail.fileLoses", { name: f.winner?.name ?? "" }), tone: "text-intent-text" };
    if (!mod.enabled) return { text: t("mods.detail.fileOff"), tone: "text-fg-muted" };
    if (f.state === "wins") return { text: tp("mods.detail.fileWins", f.opponents.length), tone: "text-intent-text" };
    return { text: t("mods.detail.fileInGame"), tone: "text-intent-text" };
  };

  const menu: ContextMenuItem[] = [];
  if (menuFor) {
    const rival = menuFor.winner?.id ?? menuFor.opponents[0]?.id;
    if (rival && menuFor.state !== "hidden") {
      menu.push({ id: "winner", label: t("conflicts.chooseWinner"), onSelect: () => onChooseWinner({ a: mod.id, b: rival, focus: menuFor.location }) });
    }
    menu.push({
      id: "hide",
      label: t(menuFor.state === "hidden" ? "conflicts.showFile" : "conflicts.hideFile"),
      onSelect: () => void run(() => backend.setFileExclusions(instance, mod.id, [menuFor.location], menuFor.state !== "hidden")),
    });
  }

  let body: React.ReactNode;
  if (files.status === "error") {
    body = (
      <div className="px-6 py-4">
        <ErrorAlert title="mods.loadError" error={files.error} onRetry={files.reload} />
      </div>
    );
  } else if (files.status !== "ready") {
    body = <Loader label={t("common.loading")} />;
  } else {
    body = (
      <ContextMenu items={menu}>
        <Tree<FileData>
          aria-label={t("mods.detail.modFiles")}
          variant="rows"
          indent={18}
          nodes={nodes}
          expanded={open}
          onExpandedChange={(next) => setCollapsed(new Set([...expanded].filter((id) => !next.has(id))))}
          selectedId={selected}
          onSelect={(n) => setSelected(n.id)}
          onContextMenu={(e) => {
            const item = (e.target as HTMLElement).closest("[role=treeitem]");
            const id = item ? findId(item) : null;
            const f = id ? visible.find((x) => `${x.location.target}:${x.location.path}` === id) : undefined;
            setMenuFor(f ?? null);
            if (!f) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          renderIcon={(n) => (n.children ? <FolderIcon size="sm" className="text-fg-muted" /> : <FileIcon size="sm" />)}
          renderEnd={(n) => {
            const f = n.data?.file;
            const s = f ? state(f) : null;
            return (
              <>
                <span data-intent={f?.state === "loses" ? "danger" : "success"} className={`w-60 truncate text-xs ${s?.tone ?? ""}`} data-file-id={n.id}>
                  {s?.text}
                </span>
                <span className="w-25 text-right text-xs text-fg-muted">{formatSize(i18n.language, n.data?.size ?? 0)}</span>
              </>
            );
          }}
        />
      </ContextMenu>
    );
  }

  const options: { value: FileFilter; label: React.ReactNode }[] = [
    { value: "all", label: t("mods.detail.fileAll") },
    ...top.slice(0, 2).filter((e) => e.ext).map((e) => ({ value: `ext:${e.ext}` as FileFilter, label: e.ext })),
    { value: "conflicts", label: t("mods.detail.fileConflicts", { count: disputed }) },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 px-6 pb-3 pt-4">
        {segments.length > 0 ? (
          <Progress.Stacked label={t("mods.detail.byType")} legend segments={segments} formatValue={(v: number) => tp("mods.detail.fileCount", v)} />
        ) : null}
        <div className="flex items-center gap-2.5">
          <Input.Root value={search} onChange={setSearch}>
            <Input.Box className="h-8 w-60">
              <SearchIcon size="sm" className="text-fg-muted" />
              <Input.Field aria-label={t("mods.detail.searchFile")} placeholder={t("mods.detail.searchFile")} />
            </Input.Box>
          </Input.Root>
          <SegmentedControl<FileFilter> size="sm" aria-label={t("mods.detail.fileFilter")} value={filter} onChange={setFilter} options={options} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col border-t border-border">
        <div data-layer="medium" className="flex h-8 shrink-0 items-center gap-3 border-b border-border bg-structure px-6 text-xs font-semibold text-fg-muted">
          <span className="flex-1">{t("mods.detail.colName")}</span>
          <span className="w-60">{t("mods.detail.colState")}</span>
          <span className="w-25 text-right">{t("mods.detail.colSize")}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{body}</div>
      </div>
    </div>
  );
}

/** The id of a tree row, read from the end column that carries it. */
function findId(item: Element): string | null {
  return item.querySelector("[data-file-id]")?.getAttribute("data-file-id") ?? null;
}

/** FOMOD choices by step, in the order of the installer. */
function fomodSteps(choices: readonly FomodChoice[]) {
  const steps = new Map<number, { name: string; groups: FomodChoice[] }>();
  for (const c of choices) {
    const step = steps.get(c.step) ?? { name: c.stepName, groups: [] };
    step.groups.push(c);
    steps.set(c.step, step);
  }
  return [...steps.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * Installation (board JogoModInstalacao): how the mod was installed and, for
 * a FOMOD, every choice by step, collapsible, with a search over options.
 */
export function InstallationTab({ instance, mod }: { instance: string; mod: ModDetails }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const [search, setSearch] = useState("");
  const [closed, setClosed] = useState<ReadonlySet<number>>(new Set());
  const inst = mod.installation;
  if (!inst) return <p className="px-6 py-4.5 text-sm text-fg-muted">{t("mods.installation.none")}</p>;
  const choices = inst.choices ?? [];
  const steps = fomodSteps(choices);
  const fomod = steps.length > 0;
  const chosen = choices.reduce((n, c) => n + c.names.length, 0);
  const from = t("mods.detail.installedFrom", { ago: i18n.formatAgo(inst.createdAt), archive: mod.archive?.name ?? mod.source });
  const help = fomod
    ? [tp("mods.detail.stepCount", steps.length), tp("mods.detail.chosenCount", chosen), from].join(" · ")
    : [tp("mods.detail.fileCount", inst.files), from].join(" · ");
  const q = search.trim().toLowerCase();

  let body: React.ReactNode;
  if (fomod) {
    body = (
      <ol className="flex min-h-0 flex-1 flex-col overflow-auto rounded-t-card border border-b-0 border-border">
        {steps.map(([n, step]) => {
          const groups = step.groups
            .map((g) => ({ ...g, names: q ? g.names.filter((x) => x.toLowerCase().includes(q)) : g.names }))
            .filter((g) => !q || g.names.length > 0 || g.groupName.toLowerCase().includes(q));
          if (q && groups.length === 0) return null;
          const name = step.name || t("mods.detail.fomodStep", { n: n + 1 });
          const isOpen = q !== "" || !closed.has(n);
          const toggle = () => {
            const next = new Set(closed);
            if (next.has(n)) next.delete(n);
            else next.add(n);
            setClosed(next);
          };
          return (
            <li key={n} className="flex shrink-0 flex-col">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-label={t(isOpen ? "mods.detail.collapseStep" : "mods.detail.expandStep", { name })}
                onClick={toggle}
                data-layer="medium"
                className="focus-ring-inset flex h-10 items-center gap-2.5 border-b border-border bg-sunken px-3.5 text-left motion-transition hover:state-layer-hover"
              >
                {isOpen ? <ChevronDownIcon size="sm" className="text-fg-muted" /> : <ChevronRightIcon size="sm" className="text-fg-muted" />}
                <span data-intent="brand" className="flex size-5.5 items-center justify-center rounded-pill bg-intent-subtle text-[0.6875rem] font-bold text-intent-text">
                  {n + 1}
                </span>
                <span className="flex-1 text-sm font-semibold text-fg">{name}</span>
                <span className="text-xs text-fg-muted">{tp("mods.detail.optionCount", step.groups.reduce((k, g) => k + g.names.length, 0))}</span>
              </button>
              {isOpen
                ? groups.map((g) => (
                    <div key={g.group} className="grid grid-cols-[15rem_minmax(0,1fr)] items-start gap-4 border-b border-border-subtle py-2.5 pl-15 pr-3.5">
                      <span className="text-[0.8125rem] text-fg">{g.groupName}</span>
                      <ul className="flex min-w-0 flex-col gap-1.5">
                        {g.names.length > 0 ? (
                          g.names.map((x) => (
                            <li key={x} className="flex items-center gap-2 text-[0.8125rem] text-fg-muted">
                              <span data-intent="success" className="text-intent-text">
                                <CheckIcon size="xs" />
                              </span>
                              <span className="truncate">{x}</span>
                            </li>
                          ))
                        ) : (
                          <li className="text-[0.8125rem] text-fg-subtle">{t("mods.detail.fomodNone")}</li>
                        )}
                      </ul>
                    </div>
                  ))
                : null}
            </li>
          );
        })}
      </ol>
    );
  } else {
    const rows: { label: MessageKey; value: React.ReactNode }[] = [
      { label: "mods.archive.name", value: mod.archive?.name ?? t("common.empty") },
      { label: "mods.archive.size", value: mod.archive ? formatSize(i18n.language, mod.archive.size) : t("common.empty") },
      { label: "mods.archive.retained", value: t(mod.archive?.retained ? "common.yes" : "common.no") },
      { label: "mods.installation.root", value: inst.options.root === undefined ? t("common.empty") : inst.options.root || t("mods.installation.archiveRoot") },
      { label: "mods.installation.date", value: i18n.formatDateTime(inst.createdAt) },
      { label: "mods.archive.hash", value: mod.archive ? <span className="font-mono text-xs">{mod.archive.hash.slice(0, 16)}…</span> : t("common.empty") },
    ];
    body = (
      <dl className="flex flex-col overflow-hidden rounded-card border border-border">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[15rem_minmax(0,1fr)] items-center gap-4 border-b border-border-subtle px-3.5 py-2.5 text-[0.8125rem] last:border-b-0">
            <dt className="text-fg-muted">{t(r.label)}</dt>
            <dd className="min-w-0 truncate text-fg">{r.value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 px-6 pt-4.5">
      <TabTitle title={t(fomod ? "mods.detail.installedByFomod" : "mods.detail.installedDirect")} help={help}>
        {fomod ? (
          <Input.Root value={search} onChange={setSearch}>
            <Input.Box className="h-8.5 w-55">
              <SearchIcon size="sm" className="text-fg-muted" />
              <Input.Field aria-label={t("mods.detail.searchOption")} placeholder={t("mods.detail.searchOption")} />
            </Input.Box>
          </Input.Root>
        ) : null}
        {mod.state === "installed" ? (
          <Button
            disabled={mod.queued || !mod.archive?.retained}
            title={!mod.archive?.retained ? t("error.reinstall_archive_missing") : undefined}
            startIcon={<RefreshIcon size="sm" />}
            onClick={() => void run(() => backend.reinstallMods(instance, [mod.id]))}
          >
            {t("mods.action.reinstall")}
          </Button>
        ) : null}
      </TabTitle>
      {body}
    </div>
  );
}

const HISTORY_ICON: Record<string, React.ReactNode> = {
  "mod.imported": <DownloadIcon size="sm" />,
  "mod.installed": <PackageIcon size="sm" />,
  "mod.reinstalled": <RefreshIcon size="sm" />,
  "mod.install_aborted": <CircleXIcon size="sm" />,
  "mod.removed": <TrashIcon size="sm" />,
  "mod.attributes_changed": <Icon icon={NotebookPen} size="sm" />,
  "mod.category_changed": <Icon icon={TagGlyph} size="sm" />,
  "mod.type_changed": <LayersIcon size="sm" />,
};

/** Event types are stable codes; the catalog phrases them with their params. */
function historyText(i18n: ReturnType<typeof useI18n>, e: ModHistoryEntry): string {
  const key = `mods.history.${e.type}`;
  return i18n.has(key) ? i18n.t(key, e.params) : e.type;
}

/** History (board JogoModHistorico): 48 px rows with an icon, the event and when. */
export function HistoryTab({ id }: { id: string }) {
  const i18n = useI18n();
  const { t } = i18n;
  const history = useModHistory(id);
  if (history.status === "error") return <ErrorAlert title="mods.loadError" error={history.error} onRetry={history.reload} />;
  if (history.status !== "ready") return <Loader label={t("common.loading")} />;
  if (history.data.length === 0) return <p className="px-6 py-4.5 text-sm text-fg-muted">{t("mods.history.empty")}</p>;
  return (
    <ol className="flex min-h-0 flex-1 flex-col overflow-auto px-6 pt-2">
      {history.data.map((e) => (
        <li key={e.id} className="grid h-12 shrink-0 grid-cols-[1.25rem_minmax(0,1fr)_10.625rem] items-center gap-3.5 border-b border-border-subtle text-sm">
          <span className="text-fg-muted">{HISTORY_ICON[e.type] ?? <ClockIcon size="sm" />}</span>
          <span className="truncate text-fg">{historyText(i18n, e)}</span>
          <time className="text-right text-[0.8125rem] text-fg-muted" dateTime={e.occurredAt} title={i18n.formatDateTime(e.occurredAt)}>
            {i18n.formatAgo(e.occurredAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}
