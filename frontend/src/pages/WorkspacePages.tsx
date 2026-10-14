import { GitCompareArrows, HardDrive } from "lucide-react";
import { ClockIcon, PackageIcon, PlusIcon, PuzzleIcon, RocketIcon } from "dettmann-ui/icons";
import { Alert, Button, EmptyState, Icon, Tag, type IconComponent } from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useInstanceOverview, useWorkspace } from "../bridge/queries";
import type { AttentionGroup, InstanceOverview } from "../bridge/types";
import { useDeploy } from "../features/deploy/DeployContext";
import { DeployOverview } from "../features/deploy/DeployOverview";
import { formatBytes } from "../features/deploy/deploy-labels";
import { SEVERITY_LOOK, actionLabel, diagnosticTitle, historyText, shownSeverity } from "../features/diagnostics/diagnostic-labels";
import { useDiagnosticAction } from "../features/diagnostics/use-diagnostic-action";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { ForeignAlert } from "../features/games/ForeignAlert";
import { useStoreLabel } from "../features/games/GameDetails";
import { gameInitials } from "../features/games/GameSwitcher";
import { useAction } from "../features/games/use-action";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { MAIN_ID, useNavigation, type Route } from "../shell/navigation";
import { BusyBand, LoadingState, PageBody } from "./PageBody";

/**
 * Overview of the active game (ui/telas/overview.md, boards JogoVisaoGeral
 * and JogoGenerico): "is my setup ready to play? if not, what is missing?".
 * The game header (tile, name, store, version, folder, method), the four
 * numbers of the game (each opens the screen it counts), what needs
 * attention and the activity in this game. The blocks come from what the
 * backend returns: a game without plugins has no plugin number. Playing is
 * the sidebar button, not part of this screen.
 */
export function OverviewPage() {
  const { t } = useI18n();
  const ws = useWorkspace();
  if (ws.status === "loading") return <PageBody><LoadingState /></PageBody>;
  if (ws.status === "unavailable") {
    return (
      <PageBody>
        <Alert.Root intent="info">
          <Alert.Description>{t("app.offlineHint")}</Alert.Description>
        </Alert.Root>
      </PageBody>
    );
  }
  if (ws.status === "error") return <PageBody><ErrorAlert title="games.loadError" error={ws.error} onRetry={ws.reload} /></PageBody>;
  if (!ws.data.active) return <PageBody><NoActiveGame /></PageBody>;
  return <OverviewBody id={ws.data.active.id} />;
}

function NoActiveGame() {
  const { t } = useI18n();
  return (
    <EmptyState.Root className="rounded-card border border-border bg-surface">
      <EmptyState.Title>{t("overview.noGameTitle")}</EmptyState.Title>
      <EmptyState.Description>{t("overview.noGameDescription")}</EmptyState.Description>
    </EmptyState.Root>
  );
}

function OverviewBody({ id }: { id: string }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const store = useStoreLabel();
  const overview = useInstanceOverview(id);

  if (overview.status === "loading") return <PageBody><LoadingState /></PageBody>;
  if (overview.status === "error") return <PageBody><ErrorAlert title="overview.loadError" error={overview.error} onRetry={overview.reload} /></PageBody>;
  if (overview.status !== "ready") return null;
  const v = overview.data;
  const g = v.instance;
  const line = [g.custom ? t("games.generic") : g.gameName !== g.name ? g.gameName : "", store(g.store), g.version ? t("overview.version", { version: g.version }) : "", g.root].filter(Boolean).join(" · ");

  return (
    <main id={MAIN_ID} tabIndex={-1} className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-9 py-7 focus:outline-none">
      <section className="flex items-center gap-5">
        <span data-intent="brand" className="flex size-24 shrink-0 items-end rounded-card border border-intent-border bg-intent-subtle p-2.5">
          <span className="text-[1.875rem] font-bold leading-none tracking-[-0.04em] text-intent-text">{gameInitials(g.gameName || g.name)}</span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="truncate text-[1.625rem] font-semibold text-fg">{g.name}</h1>
          <span className="truncate text-[0.8125rem] text-fg-muted" title={g.root}>
            {line}
          </span>
          <span className="flex flex-wrap gap-2">
            {g.method ? (
              <Tag size="sm" shape="rounded" emphasis="low">
                {t("overview.method", { method: i18n.has(`deploy.method.${g.method}`) ? i18n.t(`deploy.method.${g.method}` as MessageKey) : g.method })}
              </Tag>
            ) : null}
          </span>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button onClick={() => void run(() => backend.openInstanceFolder(g.id, "game"))}>{t("overview.openGameFolder")}</Button>
          <Button emphasis="high" startIcon={<PlusIcon size="sm" />} onClick={() => void run(() => backend.pickImportFiles(g.id, t("mods.import.pickFiles")))}>
            {t("mods.add")}
          </Button>
        </div>
      </section>

      {g.rootMissing ? (
        <Alert.Root intent="danger">
          <Alert.Description>{t("overview.rootMissing")}</Alert.Description>
        </Alert.Root>
      ) : null}
      <ForeignAlert findings={g.foreign} onOpenFolder={() => void run(() => backend.openInstanceFolder(g.id, "game"))} onRecheck={() => overview.reload()} />
      <BusyBand />
      <DeployOverview />

      <Numbers overview={v} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-2">
        <AttentionCard overview={v} />
        <ActivityCard overview={v} />
      </div>
    </main>
  );
}

/** One number of the game: icon tile, value and label; it opens the screen it counts. */
function NumberTile({ icon, value, label, to, attention }: { icon: IconComponent; value: string; label: string; to: Route; attention?: boolean }) {
  const { navigate } = useNavigation();
  return (
    <button
      type="button"
      data-intent={attention ? "info" : undefined}
      onClick={() => navigate(to)}
      className={`focus-ring flex min-w-0 items-center gap-3 rounded-card border bg-surface px-4 py-3.5 text-left motion-transition hover:state-layer-hover ${attention ? "border-intent-border" : "border-border"}`}
    >
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-control ${attention ? "bg-intent-subtle text-intent-text" : "bg-sunken text-fg-muted"}`}>
        <Icon icon={icon} size="sm" />
      </span>
      <span className="flex min-w-0 flex-col gap-px">
        <span className="truncate text-xl font-semibold leading-tight text-fg">{value}</span>
        <span className="truncate text-xs text-fg-muted">{label}</span>
      </span>
    </button>
  );
}

/** The numbers of the game (board JogoGenerico): mods, plugins when offered, conflicts, deployment or disk. */
function Numbers({ overview }: { overview: InstanceOverview }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const { mods, plugins, conflicts, status } = overview;
  const hasPlugins = overview.instance.sections?.includes("overview.plugins") ?? false;
  const unavailable = t("overview.unavailable");
  const tiles: React.ReactNode[] = [];
  tiles.push(
    <NumberTile
      key="mods"
      icon={PackageIcon}
      value={mods ? t("overview.modsOf", { enabled: i18n.formatNumber(mods.enabled), total: i18n.formatNumber(mods.total) }) : unavailable}
      label={t("overview.modsActive")}
      to={{ view: "mods", filter: "enabled" }}
    />,
  );
  if (hasPlugins) {
    tiles.push(
      <NumberTile
        key="plugins"
        icon={PuzzleIcon}
        value={plugins ? i18n.formatNumber(plugins.active) : unavailable}
        label={t("overview.pluginsActive")}
        to={{ view: "plugins", filter: "active" }}
      />,
    );
  }
  let conflictLabel = t("overview.conflictsNone");
  if (conflicts && conflicts.pairs > 0) conflictLabel = conflicts.unreviewed > 0 ? tp("overview.conflictsToDecide", conflicts.unreviewed) : t("overview.conflictsDecided");
  tiles.push(
    <NumberTile
      key="conflicts"
      icon={GitCompareArrows}
      value={conflicts ? i18n.formatNumber(conflicts.pairs) : unavailable}
      label={conflictLabel}
      to={conflicts && conflicts.unreviewed > 0 ? { view: "conflicts", filter: "unreviewed" } : { view: "conflicts" }}
    />,
  );
  if (!hasPlugins && status && status.kind === "pending") {
    tiles.push(<NumberTile key="deploy" icon={RocketIcon} attention value={t("overview.deployPending")} label={t("overview.deployPendingLabel")} to={{ view: "mods" }} />);
  } else {
    tiles.push(
      <NumberTile
        key="disk"
        icon={HardDrive}
        value={mods ? formatBytes(mods.size) : unavailable}
        label={mods ? tp("overview.diskFiles", mods.files) : t("overview.disk")}
        to={{ view: "mods" }}
      />,
    );
  }
  return (
    <section aria-label={t("overview.numbers")} className="grid grid-cols-4 gap-3">
      {tiles}
    </section>
  );
}

/** A card with a 44 px title line (boards). */
function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-card border border-border bg-surface">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {action}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

/** "Precisa de atenção": one row per problem code, with its main action; a pending deploy is a row too. */
function AttentionCard({ overview }: { overview: InstanceOverview }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { navigate } = useNavigation();
  const act = useDiagnosticAction();
  const { deploy } = useDeploy();
  const groups = overview.attention;
  const pending = overview.status?.kind === "pending";
  let rest: string;
  if (groups.length === 0 && !pending) rest = t("overview.nothingNeeded");
  else rest = t("overview.nothingElse");
  return (
    <Panel title={t("dashboard.attention")}>
      {pending ? (
        <AttentionRow
          icon={RocketIcon}
          intent="info"
          title={t("overview.deployWaiting")}
          detail={t("overview.deployWaitingDetail")}
          action={<Button size="sm" onClick={() => void deploy()}>{t("deploy.action.deploy")}</Button>}
        />
      ) : null}
      {groups.map((gr) => (
        <AttentionLine key={gr.code} group={gr} onAct={(i) => void act(gr.first, i)} onOpen={() => navigate({ view: "diagnostics", tab: "problems", diagnostic: gr.count > 1 ? gr.code : gr.first.key })} />
      ))}
      <p className="px-4 py-3.5 text-[0.8125rem] text-fg-muted">{rest}</p>
      {overview.attentionPartial ? <p className="px-4 pb-3.5 text-xs text-fg-muted">{t("overview.attentionPartial")}</p> : null}
    </Panel>
  );
}

function AttentionRow({ icon, intent, title, detail, action, onOpen }: { icon: IconComponent; intent: "danger" | "warning" | "info"; title: string; detail?: string; action?: React.ReactNode; onOpen?: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
      <span data-intent={intent} className="flex size-7 shrink-0 items-center justify-center rounded-control bg-intent-subtle text-intent-text">
        <Icon icon={icon} size="sm" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {onOpen ? (
          <Button size="inline" emphasis="low" className="max-w-full truncate text-sm text-fg" onClick={onOpen}>
            {title}
          </Button>
        ) : (
          <span className="truncate text-sm font-medium text-fg">{title}</span>
        )}
        {detail ? <span className="truncate text-xs text-fg-muted">{detail}</span> : null}
      </div>
      {action}
    </div>
  );
}

function AttentionLine({ group, onAct, onOpen }: { group: AttentionGroup; onAct: (index: number) => void; onOpen: () => void }) {
  const i18n = useI18n();
  const look = SEVERITY_LOOK[shownSeverity(group.first)];
  const action = group.first.actions[0];
  return (
    <AttentionRow
      icon={look.icon}
      intent={look.intent}
      title={diagnosticTitle(i18n, group.first)}
      detail={group.count > 1 ? i18n.t("overview.more", { count: group.count }) : undefined}
      onOpen={onOpen}
      action={
        action ? (
          <Button size="sm" onClick={() => onAct(0)}>
            {actionLabel(i18n, action)}
          </Button>
        ) : undefined
      }
    />
  );
}

/** "Atividade neste jogo": 40 px rows with an icon, the event and when. */
function ActivityCard({ overview }: { overview: InstanceOverview }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { navigate } = useNavigation();
  return (
    <Panel
      title={t("overview.activityHere")}
      action={
        <Button size="inline" emphasis="low" intent="brand" onClick={() => navigate({ view: "diagnostics", tab: "history" })}>
          {t("overview.seeHistory")}
        </Button>
      }
    >
      {overview.recent.length === 0 ? <p className="px-4 py-3.5 text-[0.8125rem] text-fg-muted">{t("overview.noActivity")}</p> : null}
      {overview.recent.map((e) => (
        <div key={e.id} className="grid h-10 grid-cols-[1.25rem_minmax(0,1fr)_6.25rem] items-center gap-3 border-b border-border-subtle px-4 text-[0.8125rem]">
          <span className="text-fg-muted">
            <ClockIcon size="sm" />
          </span>
          <span className="truncate text-fg">{historyText(i18n, e)}</span>
          <time className="text-right text-fg-muted" dateTime={e.at} title={i18n.formatAbsolute(e.at)}>
            {i18n.formatAgo(e.at)}
          </time>
        </div>
      ))}
    </Panel>
  );
}
