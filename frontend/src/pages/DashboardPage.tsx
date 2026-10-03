import { useEffect, useState, type ReactNode } from "react";
import { Activity, CheckCircle2, Circle, Gamepad2, Lock, Pin, Settings2, Sparkles } from "lucide-react";
import { Alert, Badge, Button, Card, ReorderableList, Spinner, Stack, Switch, Typography } from "dettmann-ui";
import { useSettings } from "../app/settings-context";
import { useBackend } from "../bridge/backend-context";
import { useActiveGameStatus, useAppInfo, useDashboardLayout, useFirstSteps, useOperations, useRecentGames } from "../bridge/queries";
import type { Dashlet, DashletId } from "../bridge/types";
import { AttentionDashlet } from "../features/diagnostics/AttentionDashlet";
import { useDeploy } from "../features/deploy/DeployContext";
import { formatBytes } from "../features/deploy/deploy-labels";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useAction } from "../features/games/use-action";
import { PlayButton } from "../features/launch/PlayButton";
import { OperationsTable } from "../features/operations/OperationsTable";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { useNavigation } from "../shell/navigation";
import { HonestEmpty, PageBody } from "./PageBody";

const DEFAULT_LAYOUT: DashletId[] = ["first_steps", "attention", "active_game", "recent_games", "recent_operations", "whats_new"];

/**
 * Dashboard (ui/telas/dashboard.md): a triage center of dashlets. Which
 * dashlets show, in which order, comes from the backend (setting
 * ui.dashboard.dashlets plus its rules: "Primeiros passos" hides itself
 * once complete unless pinned; "Precisa de atenção" cannot be hidden while
 * something blocks; without games only "Primeiros passos" and "Novidades").
 * "Personalizar" shows and hides dashlets and reorders them by dragging or
 * with the keyboard; each change is stored at once. If the layout cannot be
 * read, every dashlet shows its own state (offline, error), never data.
 */
export function DashboardPage() {
  const { t, tp } = useI18n();
  const { route } = useNavigation();
  const info = useAppInfo();
  const layout = useDashboardLayout();
  const [editing, setEditing] = useState(Boolean(route.customize));
  const interrupted = info.status === "ready" ? info.data.interruptedOperations : 0;

  useEffect(() => {
    if (route.customize) setEditing(true);
  }, [route.customize]);

  const dashlets: Dashlet[] =
    layout.status === "ready" ? layout.data : DEFAULT_LAYOUT.map((id) => ({ id, hidden: false, pinned: false, visible: true, locked: false }));

  return (
    <PageBody>
      <Stack gap="lg">
        <div className="flex items-center gap-2">
          <div className="flex-1" />
          {layout.status === "ready" ? (
            <Button size="sm" variant={editing ? "primary" : "outline"} startIcon={<Settings2 aria-hidden="true" className="h-4 w-4" />} aria-pressed={editing} onClick={() => setEditing((e) => !e)}>
              {t(editing ? "dashboard.customizeDone" : "dashboard.customize")}
            </Button>
          ) : null}
        </div>
        {interrupted > 0 ? (
          <Alert.Root variant="warning">
            <Alert.Title>{t("operations.interruptedTitle")}</Alert.Title>
            <Alert.Description>{tp("operations.interruptedDescription", interrupted)}</Alert.Description>
          </Alert.Root>
        ) : null}
        {editing && layout.status === "ready" ? (
          <CustomizeList dashlets={layout.data} />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {dashlets
              .filter((d) => d.visible)
              .map((d) => (
                <div key={d.id} className={d.id === "recent_operations" || d.id === "attention" ? "xl:col-span-2" : undefined}>
                  <DashletBody id={d.id} />
                </div>
              ))}
          </div>
        )}
      </Stack>
    </PageBody>
  );
}

function DashletBody({ id }: { id: DashletId }) {
  switch (id) {
    case "first_steps":
      return <FirstStepsDashlet />;
    case "attention":
      return <AttentionDashlet />;
    case "active_game":
      return <ActiveGameDashlet />;
    case "recent_games":
      return <RecentGamesDashlet />;
    case "recent_operations":
      return <RecentOperationsDashlet />;
    case "whats_new":
      return <WhatsNewDashlet />;
  }
}

function DashletCard({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <Card.Root className="h-full">
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
  if (status === "loading") return <Spinner label={t("common.loading")} />;
  if (status === "unavailable") {
    return (
      <Alert.Root variant="info">
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
                  <Badge variant="muted" className="gap-1">
                    <Lock aria-hidden="true" className="h-3 w-3" />
                    {t("dashboard.locked")}
                  </Badge>
                ) : null}
                {d.id === "first_steps" && d.pinned ? (
                  <Badge variant="outline" className="gap-1">
                    <Pin aria-hidden="true" className="h-3 w-3" />
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

const STEP_ICON = { done: CheckCircle2, todo: Circle };

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
            const Icon = s.done ? STEP_ICON.done : STEP_ICON.todo;
            const reachable = s.id === "manage_game" || Boolean(deploy.instance);
            return (
              <li key={s.id} className="flex items-center gap-3">
                <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${s.done ? "text-success-text" : "text-fg-subtle"}`} />
                <Typography variant="body-sm" className={`flex-1 ${s.done ? "text-fg-muted line-through" : ""}`}>
                  {i + 1}. {t(`dashboard.step.${s.id}` as MessageKey)}
                  <span className="sr-only"> — {t(s.done ? "dashboard.step.done" : "dashboard.step.todo")}</span>
                </Typography>
                {!s.done && reachable ? (
                  <Button size="sm" variant="outline" onClick={go[s.id]}>
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

/** "Status do jogo ativo": profile, deploy status, mods, unreviewed conflicts, Deploy / Play. */
function ActiveGameDashlet() {
  const i18n = useI18n();
  const { t } = i18n;
  const { navigate } = useNavigation();
  const deploy = useDeploy();
  const q = useActiveGameStatus();
  let body: ReactNode;
  if (q.status !== "ready") body = <QueryState status={q.status} error={q.status === "error" ? q.error : undefined} onRetry={q.reload} title="dashboard.loadError" />;
  else if (!q.data.instance) body = <HonestEmpty icon={Gamepad2} title="dashboard.noGameTitle" description="dashboard.noGameDescription" />;
  else {
    const g = q.data;
    body = (
      <Stack gap="sm">
        <Typography variant="body-sm" className="font-medium">
          {g.instance!.name}
        </Typography>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-fg-muted">{t("dashboard.active.profile")}</dt>
          <dd>{g.status?.activeProfile.name ?? t("common.empty")}</dd>
          <dt className="text-fg-muted">{t("dashboard.active.deploy")}</dt>
          <dd>
            {g.status ? t(`deploy.status.${g.status.kind}` as MessageKey) : t("common.empty")}
            {g.status?.appliedAt ? <span className="text-fg-muted"> · {i18n.formatDateTime(g.status.appliedAt)}</span> : null}
          </dd>
          <dt className="text-fg-muted">{t("dashboard.active.mods")}</dt>
          <dd>
            <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => navigate({ view: "mods" })}>
              {g.mods ? t("overview.modsValue", { enabled: g.mods.enabled, total: g.mods.total }) : t("common.empty")}
            </button>
          </dd>
          <dt className="text-fg-muted">{t("dashboard.active.conflicts")}</dt>
          <dd>
            <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => navigate({ view: "conflicts" })}>
              {g.conflicts ? t("dashboard.active.unreviewed", { count: g.conflicts.unreviewed }) : t("common.empty")}
            </button>
          </dd>
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          {g.status && (g.status.kind === "pending" || g.status.kind === "never_deployed") ? (
            <Button size="sm" variant="outline" onClick={() => void deploy.deploy()}>
              {t("deploy.deploy")}
            </Button>
          ) : null}
          <PlayButton />
          <Button size="sm" variant="ghost" onClick={() => navigate({ view: "overview" })}>
            {t("dashboard.openOverview")}
          </Button>
        </div>
      </Stack>
    );
  }
  return <DashletCard title={t("dashboard.dashlet.active_game")}>{body}</DashletCard>;
}

/** "Jogos recentes" (Vortex RecentlyManagedDashlet): activate or open each game. */
function RecentGamesDashlet() {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const { navigate } = useNavigation();
  const q = useRecentGames();
  let body: ReactNode;
  if (q.status !== "ready") body = <QueryState status={q.status} error={q.status === "error" ? q.error : undefined} onRetry={q.reload} title="dashboard.loadError" />;
  else if (q.data.length === 0) body = <HonestEmpty icon={Gamepad2} title="dashboard.noGameTitle" description="dashboard.noGameDescription" />;
  else
    body = (
      <ul className="divide-y divide-border rounded-lg border border-border">
        {q.data.map((r) => (
          <li key={r.instance.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <Gamepad2 aria-hidden="true" className="h-4 w-4 shrink-0 text-fg-muted" />
            <div className="min-w-0 flex-1">
              <Typography variant="body-sm" className="font-medium">
                {r.instance.name}
              </Typography>
              <Typography variant="caption" color="muted-fg">
                {r.lastUsed ? t("dashboard.lastUsed", { when: i18n.formatDateTime(r.lastUsed) }) : t("dashboard.neverUsed")}
              </Typography>
            </div>
            {r.instance.active ? (
              <Badge tone="success">{t("games.active")}</Badge>
            ) : (
              <Button size="sm" variant="outline" onClick={() => void run(() => backend.setActiveInstance(r.instance.id))}>
                {t("games.activate")}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void run(() => (r.instance.active ? Promise.resolve() : backend.setActiveInstance(r.instance.id))).then(() => navigate({ view: "overview" }))}
            >
              {t("dashboard.openOverview")}
            </Button>
          </li>
        ))}
      </ul>
    );
  return <DashletCard title={t("dashboard.dashlet.recent_games")}>{body}</DashletCard>;
}

function RecentOperationsDashlet() {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const query = useOperations(10);
  let body: ReactNode;
  if (query.status !== "ready") body = <QueryState status={query.status} error={query.status === "error" ? query.error : undefined} onRetry={query.reload} title="operations.loadError" />;
  else if (query.data.length === 0) body = <HonestEmpty icon={Activity} title="operations.emptyTitle" description="operations.emptyDescription" />;
  else body = <OperationsTable operations={query.data} className="flex h-80 min-h-0 flex-col" />;
  return (
    <DashletCard
      title={t("dashboard.recentOperations")}
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate({ view: "diagnostics", tab: "history" })}>
          {t("dashboard.openHistory")}
        </Button>
      }
    >
      {body}
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
    <DashletCard title={t("dashboard.dashlet.whats_new")}>
      <Stack gap="sm">
        {version ? (
          <Typography variant="caption" color="muted-fg">
            {t("news.version", { version })}
          </Typography>
        ) : null}
        <ul className="space-y-1.5">
          {NEWS.map((k) => (
            <li key={k} className="flex gap-2 text-sm text-fg">
              <Sparkles aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-text" />
              <span>{t(k)}</span>
            </li>
          ))}
        </ul>
      </Stack>
    </DashletCard>
  );
}

export { formatBytes };
