import { useEffect, useState, type ReactNode } from "react";
import { Circle } from "lucide-react";
import { CircleCheckIcon, ClockIcon, LockIcon, PinIcon } from "dettmann-ui/icons";
import { Alert, Badge, Button, Card, Icon, Loader, Progress, ReorderableList, Switch, Typography } from "dettmann-ui";
import { useSettings } from "../app/settings-context";
import { useBackend } from "../bridge/backend-context";
import { useAppInfo, useAttention, useDashboardLayout, useFirstSteps, useHistory, useOperations, useRecentGames, useWorkspace } from "../bridge/queries";
import type { Dashlet, DashletId, Diagnostic } from "../bridge/types";
import { useDeploy } from "../features/deploy/DeployContext";
import { SEVERITY_LOOK, actionLabel, diagnosticTitle, historyText, severityLabel, shownSeverity } from "../features/diagnostics/diagnostic-labels";
import { useDiagnosticAction } from "../features/diagnostics/use-diagnostic-action";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { GameAccent } from "../features/games/GameAccent";
import { useStoreLabel } from "../features/games/GameDetails";
import { gameInitials } from "../features/games/GameSwitcher";
import { useAction } from "../features/games/use-action";
import { PlayButton } from "../features/launch/PlayButton";
import { operationKindLabel, operationStepLabel } from "../features/operations/operation-labels";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { MAIN_ID, useNavigation } from "../shell/navigation";

const DEFAULT_LAYOUT: DashletId[] = ["first_steps", "attention", "recent_operations", "recent_games", "whats_new"];

/** Dashlets the board Inicio has (plus "Primeiros passos" while incomplete); the old "active game" card is gone. */
const SHOWN: ReadonlySet<DashletId> = new Set(["first_steps", "attention", "recent_operations", "recent_games", "whats_new"]);

/**
 * Home (ui/telas/dashboard.md, board Inicio): what needs attention in every
 * game, grouped by game, and the recent activity on the left; what is
 * running, the recent games and what is new on the right. Which blocks show
 * comes from the backend layout (ui.dashboard.dashlets and its rules);
 * "Personalizar" turns them on and off and reorders them.
 */
export function DashboardPage() {
  const { t, tp } = useI18n();
  const { route } = useNavigation();
  const info = useAppInfo();
  const layout = useDashboardLayout();
  const attention = useAttention();
  const [editing, setEditing] = useState(Boolean(route.customize));
  const interrupted = info.status === "ready" ? info.data.interruptedOperations : 0;

  useEffect(() => {
    if (route.customize) setEditing(true);
  }, [route.customize]);

  const dashlets: Dashlet[] = (layout.status === "ready" ? layout.data : DEFAULT_LAYOUT.map((id) => ({ id, hidden: false, pinned: false, visible: true, locked: false }))).filter((d) =>
    SHOWN.has(d.id),
  );
  const visible = (id: DashletId) => dashlets.some((d) => d.id === id && d.visible);
  const withItems = attention.status === "ready" ? attention.data.filter((g) => g.items.length > 0) : [];
  const items = withItems.reduce((n, g) => n + g.items.length, 0);

  return (
    <main id={MAIN_ID} tabIndex={-1} className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-9 py-7 focus:outline-none">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold text-fg">{t("nav.dashboard")}</h1>
          <span className="text-sm text-fg-muted">{items > 0 ? `${tp("home.items", items)} ${tp("home.inGames", withItems.length)}` : t("home.allGood")}</span>
        </div>
        {layout.status === "ready" ? (
          <Button emphasis={editing ? "high" : "medium"} aria-pressed={editing} onClick={() => setEditing((e) => !e)}>
            {t(editing ? "dashboard.customizeDone" : "dashboard.customize")}
          </Button>
        ) : null}
      </div>
      {interrupted > 0 ? (
        <Alert.Root intent="warning">
          <Alert.Title>{t("operations.interruptedTitle")}</Alert.Title>
          <Alert.Description>{tp("operations.interruptedDescription", interrupted)}</Alert.Description>
        </Alert.Root>
      ) : null}
      {editing && layout.status === "ready" ? (
        <CustomizeList dashlets={dashlets} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_25rem] items-start gap-5">
          <div className="flex min-w-0 flex-col gap-5">
            {visible("first_steps") ? <FirstStepsDashlet /> : null}
            {visible("attention") ? <AttentionPanel /> : null}
            {visible("recent_operations") ? <ActivityPanel /> : null}
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <RunningPanel />
            {visible("recent_games") ? <RecentGamesPanel /> : null}
            {visible("whats_new") ? <WhatsNewDashlet /> : null}
          </div>
        </div>
      )}
    </main>
  );
}

/** A card with a 44 px title line (boards). */
function Panel({ title, aside, children, grow }: { title: string; aside?: ReactNode; children: ReactNode; grow?: boolean }) {
  return (
    <section aria-label={title} className={`flex min-h-0 flex-col overflow-hidden rounded-card border border-border bg-surface ${grow ? "flex-1" : ""}`}>
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {aside}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

/** A small square in the game's accent, beside its name. */
function GameDot({ id, accent }: { id: string; accent?: string }) {
  return (
    <GameAccent id={id} accent={accent} className="inline-flex">
      <span data-intent="brand" className="inline-block size-2 rounded-chip bg-intent-fill" />
    </GameAccent>
  );
}

/** "Precisa de atenção" of every game (board Inicio): one row per item, its game under the title. */
function AttentionPanel() {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const { instance: active } = useDeploy();
  const act = useDiagnosticAction();
  const attention = useAttention();
  const games = useWorkspace();
  const accentOf = new Map((games.status === "ready" ? games.data.instances : []).map((g) => [g.id, g.accent]));
  const run = async (d: Diagnostic, index: number) => {
    // Places (dialogs, screens) belong to the active game: switch first.
    if (d.actions[index]?.navigateTo && d.instance !== active) await backend.setActiveInstance(d.instance).catch(() => undefined);
    await act(d, index);
  };
  let body: ReactNode;
  if (attention.status !== "ready") {
    body = (
      <div className="p-4">
        <QueryState status={attention.status} error={attention.status === "error" ? attention.error : undefined} onRetry={attention.reload} title="diag.loadError" />
      </div>
    );
  } else {
    const withItems = attention.data.filter((g) => g.items.length > 0);
    const clean = attention.data.filter((g) => g.items.length === 0).map((g) => g.name ?? g.instance);
    let footer = "";
    if (withItems.length === 0) footer = t("dashboard.attentionNone");
    else if (clean.length > 0) footer = t("home.clean", { games: clean.join(", ") });
    body = (
      <>
        {withItems.flatMap((g) =>
          g.items.map((d) => {
            const look = SEVERITY_LOOK[shownSeverity(d)];
            return (
              <div key={d.key} className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
                <span data-intent={look.intent} className="flex size-7 shrink-0 items-center justify-center rounded-control bg-intent-subtle text-intent-text">
                  <Icon icon={look.icon} size="sm" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-fg">{diagnosticTitle(i18n, d)}</span>
                  <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                    <GameDot id={g.instance} accent={accentOf.get(g.instance)} />
                    {g.name ?? g.instance} · {severityLabel(i18n, shownSeverity(d))}
                  </span>
                </div>
                {d.actions[0] ? (
                  <Button size="sm" onClick={() => void run(d, 0)}>
                    {actionLabel(i18n, d.actions[0])}
                  </Button>
                ) : null}
              </div>
            );
          }),
        )}
        {footer ? <p className="px-4 py-2.5 text-xs text-fg-muted">{footer}</p> : null}
      </>
    );
  }
  return (
    <Panel title={t("dashboard.attention")} aside={<span className="text-xs text-fg-muted">{t("home.byGame")}</span>}>
      {body}
    </Panel>
  );
}

/** "Atividade recente" of every game: 40 px rows with the event, its game and when. */
function ActivityPanel() {
  const i18n = useI18n();
  const { t } = i18n;
  const { navigate } = useNavigation();
  const history = useHistory({ instance: "", profile: "", mod: "", types: [], origin: "", from: "", to: "", before: 0, limit: 8 });
  const games = useWorkspace();
  const known = new Map((games.status === "ready" ? games.data.instances : []).map((g) => [g.id, g]));
  let body: ReactNode;
  if (history.status !== "ready") {
    body = (
      <div className="p-4">
        <QueryState status={history.status} error={history.status === "error" ? history.error : undefined} onRetry={history.reload} title="dashboard.loadError" />
      </div>
    );
  } else if (history.data.length === 0) {
    body = <p className="px-4 py-3.5 text-[0.8125rem] text-fg-muted">{t("overview.noActivity")}</p>;
  } else {
    body = history.data.map((e) => {
      const id = e.params.instance ?? (e.subject?.kind === "instance" ? e.subject.id : "");
      const g = id ? known.get(id) : undefined;
      return (
        <div key={e.id} className="grid h-10 grid-cols-[1.25rem_minmax(0,1fr)_10.625rem_6.875rem] items-center gap-3 border-b border-border-subtle px-4 text-[0.8125rem]">
          <span className="text-fg-muted">
            <ClockIcon size="sm" />
          </span>
          <span className="truncate text-fg">{historyText(i18n, e)}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-fg-muted">
            {g ? <GameDot id={g.id} accent={g.accent} /> : null}
            {g ? <span className="truncate">{g.name}</span> : null}
          </span>
          <time className="text-right text-fg-muted" dateTime={e.at} title={i18n.formatAbsolute(e.at)}>
            {i18n.formatAgo(e.at)}
          </time>
        </div>
      );
    });
  }
  return (
    <Panel
      title={t("dashboard.dashlet.recent_operations")}
      grow
      aside={
        <Button size="inline" emphasis="low" intent="brand" onClick={() => navigate({ view: "diagnostics", tab: "history" })}>
          {t("overview.seeHistory")}
        </Button>
      }
    >
      {body}
    </Panel>
  );
}

/** "Em andamento": the operations running now, with their progress. Absent when nothing runs. */
function RunningPanel() {
  const i18n = useI18n();
  const { t } = i18n;
  const ops = useOperations(20);
  const running = ops.status === "ready" ? ops.data.filter((o) => o.status === "running") : [];
  if (running.length === 0) return null;
  return (
    <Panel title={t("home.running")}>
      {running.map((o) => {
        const pct = o.progress.total > 0 ? Math.round((o.progress.current / o.progress.total) * 100) : 0;
        let step = o.currentStep ? operationStepLabel(i18n, o.currentStep) : "";
        if (step && o.progress.total > 0) step = `${step} · ${t("home.progress", { current: i18n.formatNumber(o.progress.current), total: i18n.formatNumber(o.progress.total) })}`;
        return (
          <div key={o.id} className="flex flex-col gap-2 border-b border-border-subtle px-4 py-3.5 last:border-b-0">
            <div className="flex justify-between gap-2 text-[0.8125rem]">
              <span className="truncate font-medium text-fg">{operationKindLabel(i18n, o.kind)}</span>
              {o.progress.total > 0 ? <span className="text-fg-muted">{pct}%</span> : null}
            </div>
            <Progress.Root value={pct} aria-label={operationKindLabel(i18n, o.kind)} className="h-1.5" />
            {step ? <span className="text-xs text-fg-muted">{step}</span> : null}
          </div>
        );
      })}
    </Panel>
  );
}

/** "Jogos recentes": the tile in the game's color, name, store and last use, Entrar and Jogar. */
function RecentGamesPanel() {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const store = useStoreLabel();
  const { navigate } = useNavigation();
  const q = useRecentGames();
  const enter = async (id: string, active: boolean) => {
    if (!active) {
      const r = await run(() => backend.setActiveInstance(id));
      if (!r.ok) return;
    }
    navigate({ view: "overview" });
  };
  let body: ReactNode;
  if (q.status !== "ready") {
    body = (
      <div className="p-4">
        <QueryState status={q.status} error={q.status === "error" ? q.error : undefined} onRetry={q.reload} title="dashboard.loadError" />
      </div>
    );
  } else if (q.data.length === 0) {
    body = <p className="px-4 py-3.5 text-[0.8125rem] text-fg-muted">{t("dashboard.noGameDescription")}</p>;
  } else {
    body = q.data.map((r) => {
      const g = r.instance;
      return (
        <GameAccent key={g.id} id={g.id} accent={g.accent}>
          <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-2.5">
            <span data-intent="brand" className="flex size-8 shrink-0 items-center justify-center rounded-control border border-intent-border bg-intent-subtle text-[0.6875rem] font-bold text-intent-text">
              {gameInitials(g.gameName || g.name)}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="truncate text-sm font-medium text-fg">{g.name}</span>
              <span className="truncate text-xs text-fg-muted">{[store(g.store), r.lastUsed ? t("library.used", { when: i18n.formatAgo(r.lastUsed) }) : ""].filter(Boolean).join(" · ")}</span>
            </div>
            <Button size="sm" onClick={() => void enter(g.id, g.active)}>
              {t("library.enter")}
            </Button>
            {g.active ? <PlayButton layout="icon" /> : null}
          </div>
        </GameAccent>
      );
    });
  }
  return <Panel title={t("dashboard.dashlet.recent_games")}>{body}</Panel>;
}

function DashletCard({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <Card.Root>
      <Card.Header>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Card.Title>{title}</Card.Title>
          </div>
          {actions}
        </div>
      </Card.Header>
      <Card.Body>{children}</Card.Body>
    </Card.Root>
  );
}

/** Common states of a dashlet query: loading, offline, error. */
function QueryState({ status, error, onRetry, title }: { status: string; error?: unknown; onRetry: () => void; title: MessageKey }) {
  const { t } = useI18n();
  if (status === "loading") return <Loader label={t("common.loading")} />;
  if (status === "unavailable") {
    return (
      <Alert.Root intent="info">
        <Alert.Description>{t("app.offlineHint")}</Alert.Description>
      </Alert.Root>
    );
  }
  if (status === "error" && error) return <ErrorAlert title={title} error={error as never} onRetry={onRetry} />;
  return null;
}

/** "Personalizar": order (drag or keyboard) and visibility, stored in ui.dashboard.dashlets. */
function CustomizeList({ dashlets }: { dashlets: Dashlet[] }) {
  const { t } = useI18n();
  const settings = useSettings();
  const store = (items: Dashlet[]) =>
    void settings.set(
      "ui.dashboard.dashlets",
      items.map((d) => (d.hidden ? "-" : d.pinned ? "+" : "") + d.id).join(","),
    );
  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>{t("dashboard.customizeTitle")}</Card.Title>
        <Card.Description>{t("dashboard.customizeHelp")}</Card.Description>
      </Card.Header>
      <Card.Body>
        <ReorderableList
          aria-label={t("dashboard.customizeTitle")}
          labels={{
            dragHandle: t("dashboard.customizeDrag"),
            moveUp: t("dashboard.customizeMoveUp"),
            moveDown: t("dashboard.customizeMoveDown"),
          }}
          items={dashlets.map((d) => ({ id: d.id, data: d }))}
          onReorder={(items) => store(items.map((i) => i.data))}
          renderItem={(item) => {
            const d = item.data;
            const label = t(`dashboard.dashlet.${d.id}` as MessageKey);
            const on = !d.hidden;
            return (
              <div className="flex flex-1 items-center gap-3">
                <span className="flex-1 text-sm text-fg">{label}</span>
                {d.locked ? (
                  <Badge emphasis="low" className="gap-1">
                    <LockIcon size="xs" />
                    {t("dashboard.locked")}
                  </Badge>
                ) : null}
                {d.id === "first_steps" && d.pinned ? (
                  <Badge emphasis="low" className="gap-1">
                    <PinIcon size="xs" />
                    {t("dashboard.pinned")}
                  </Badge>
                ) : null}
                <Switch
                  checked={on}
                  disabled={d.locked}
                  aria-label={t("dashboard.show", { name: label })}
                  onCheckedChange={(show) =>
                    store(dashlets.map((x) => (x.id === d.id ? { ...x, hidden: !show, pinned: show && x.id === "first_steps" } : x)))
                  }
                />
              </div>
            );
          }}
        />
      </Card.Body>
    </Card.Root>
  );
}

const STEP_ICON = { done: CircleCheckIcon, todo: Circle };

/** "Primeiros passos" (ui/02 F-01): manage a game → import a mod → deploy → play. */
function FirstStepsDashlet() {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const deploy = useDeploy();
  const steps = useFirstSteps();
  const go: Record<string, () => void> = {
    manage_game: () => navigate({ view: "games" }),
    import_mod: () => navigate({ view: "mods" }),
    deploy: () => void deploy.deploy(),
    play: () => navigate({ view: "overview" }),
  };
  return (
    <DashletCard title={t("dashboard.dashlet.first_steps")}>
      {steps.status === "ready" ? (
        <ol className="space-y-2">
          {steps.data.steps.map((s, i) => {
            const GlyphIcon = s.done ? STEP_ICON.done : STEP_ICON.todo;
            const reachable = s.id === "manage_game" || Boolean(deploy.instance);
            return (
              <li key={s.id} className="flex items-center gap-3">
                <Icon icon={GlyphIcon} size="sm" className={`shrink-0 ${s.done ? "text-success-text" : "text-fg-subtle"}`} />
                <Typography variant="body-sm" className={`flex-1 ${s.done ? "text-fg-muted line-through" : ""}`}>
                  {i + 1}. {t(`dashboard.step.${s.id}` as MessageKey)}
                  <span className="sr-only"> — {t(s.done ? "dashboard.step.done" : "dashboard.step.todo")}</span>
                </Typography>
                {!s.done && reachable ? (
                  <Button size="sm" onClick={go[s.id]}>
                    {t(`dashboard.step.${s.id}.action` as MessageKey)}
                  </Button>
                ) : null}
              </li>
            );
          })}
          {steps.data.complete ? (
            <li>
              <Typography variant="caption" color="muted-fg">
                {t("dashboard.stepsComplete")}
              </Typography>
            </li>
          ) : null}
        </ol>
      ) : (
        <QueryState status={steps.status} error={steps.status === "error" ? steps.error : undefined} onRetry={steps.reload} title="dashboard.loadError" />
      )}
    </DashletCard>
  );
}

/** Highlights of the installed version (changelog-dashlet), shipped with the app: no network. */
const NEWS: MessageKey[] = ["news.item.local", "news.item.order", "news.item.conflicts", "news.item.deploy", "news.item.plugins", "news.item.play"];

function WhatsNewDashlet() {
  const { t } = useI18n();
  const info = useAppInfo();
  const version = info.status === "ready" ? info.data.version : "";
  return (
    <section aria-label={t("dashboard.dashlet.whats_new")} className="flex flex-col gap-1.5 rounded-card border border-border bg-surface px-4 py-3.5">
      <h2 className="text-sm font-semibold text-fg">{version ? t("home.news", { version }) : t("dashboard.dashlet.whats_new")}</h2>
      <ul className="flex flex-col gap-1">
        {NEWS.map((k) => (
          <li key={k} className="text-[0.8125rem] leading-normal text-fg-muted">
            {t(k)}
          </li>
        ))}
      </ul>
    </section>
  );
}

