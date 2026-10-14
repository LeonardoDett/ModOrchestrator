import type { ReactNode } from "react";
import { Gamepad2 } from "lucide-react";
import { CircleCheckIcon, FolderOpenIcon, HistoryIcon, PackagePlusIcon, ScanSearchIcon } from "dettmann-ui/icons";
import { Alert, Badge, Button, Card, EmptyState, Stack, Typography, useToast, Icon } from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useInstanceOverview, useWorkspace } from "../bridge/queries";
import type { AttentionGroup, InstanceOverview } from "../bridge/types";
import { DeployOverview } from "../features/deploy/DeployOverview";
import { formatBytes } from "../features/deploy/deploy-labels";
import { SEVERITY_LOOK, actionLabel, diagnosticTitle, historyText, shownSeverity } from "../features/diagnostics/diagnostic-labels";
import { useDiagnosticAction } from "../features/diagnostics/use-diagnostic-action";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { ForeignAlert } from "../features/games/ForeignAlert";
import { useStoreLabel } from "../features/games/GameDetails";
import { useAction } from "../features/games/use-action";
import { PlayButton } from "../features/launch/PlayButton";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { useNavigation, type Route } from "../shell/navigation";
import { BusyBand, LoadingState, PageBody } from "./PageBody";

/**
 * Overview of the active game (ui/telas/overview.md): "is my setup ready to
 * play? if not, what is missing?". One backend query gives every figure
 * (InstanceOverview, §3); each number opens the screen it counts, filtered.
 * When nothing needs attention the screen says so explicitly; a part the
 * backend could not read is shown as unavailable, never as zero.
 * Reserved (not rendered in V1): Saves and Tools widgets.
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
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const store = useStoreLabel();
  const overview = useInstanceOverview(id);

  if (overview.status === "loading") return <PageBody><LoadingState /></PageBody>;
  if (overview.status === "error") return <PageBody><ErrorAlert title="overview.loadError" error={overview.error} onRetry={overview.reload} /></PageBody>;
  if (overview.status !== "ready") return null;
  const v = overview.data;
  const g = v.instance;

  return (
    <PageBody>
      <Stack gap="lg">
        <div className="flex flex-wrap items-center gap-3">
          <Icon icon={Gamepad2} size="xl" className="text-brand-text" />
          <Stack gap="xs" className="min-w-0 flex-1">
            <Typography variant="heading-4" color="fg">
              {g.name}
            </Typography>
            <Typography variant="body-sm" color="muted-fg">
              {[g.custom ? t("games.generic") : g.gameName, store(g.store), g.version ?? ""].filter(Boolean).join(" · ")}
            </Typography>
          </Stack>
          <PlayButton />
        </div>

        {g.rootMissing ? (
          <Alert.Root intent="danger">
            <Alert.Description>{t("overview.rootMissing")}</Alert.Description>
          </Alert.Root>
        ) : null}
        <ForeignAlert findings={g.foreign} onOpenFolder={() => void run(() => backend.openInstanceFolder(g.id, "game"))} onRecheck={() => overview.reload()} />
        <BusyBand />
        <DeployOverview />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <AttentionCard overview={v} />
          <SummaryCard overview={v} />
          <ShortcutsCard instance={g.id} />
          <ActivityCard overview={v} />
        </div>
      </Stack>
    </PageBody>
  );
}

function OverviewCard({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
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

/** "Precisa de atenção": one line per problem code, with its main action. */
function AttentionCard({ overview }: { overview: InstanceOverview }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { navigate } = useNavigation();
  const act = useDiagnosticAction();
  const groups = overview.attention;
  return (
    <OverviewCard
      title={t("dashboard.attention")}
      actions={
        <Button size="sm" emphasis="low" onClick={() => navigate({ view: "diagnostics", tab: "problems" })}>
          {t("diag.seeAll")}
        </Button>
      }
    >
      <Stack gap="sm">
        {groups.length === 0 ? (
          <div className="flex items-center gap-2">
            <CircleCheckIcon size="sm" className="text-success-text" />
            <Typography variant="body-sm">{t("overview.nothingNeeded")}</Typography>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-control border border-border">
            {groups.map((gr) => (
              <AttentionLine key={gr.code} group={gr} onAct={(i) => void act(gr.first, i)} onOpen={() => navigate({ view: "diagnostics", tab: "problems", diagnostic: gr.count > 1 ? gr.code : gr.first.key })} />
            ))}
          </ul>
        )}
        {overview.attentionPartial ? (
          <Typography variant="caption" color="muted-fg">
            {t("overview.attentionPartial")}
          </Typography>
        ) : null}
      </Stack>
    </OverviewCard>
  );
}

function AttentionLine({ group, onAct, onOpen }: { group: AttentionGroup; onAct: (index: number) => void; onOpen: () => void }) {
  const i18n = useI18n();
  const look = SEVERITY_LOOK[shownSeverity(group.first)];
  const GlyphIcon = look.icon;
  const action = group.first.actions[0];
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2">
      <Icon icon={GlyphIcon} size="sm" className={`shrink-0 ${look.className}`} />
      <Button emphasis="low" size="sm" className="min-w-0 flex-1 justify-start text-left text-sm font-normal text-fg" onClick={onOpen}>
        {diagnosticTitle(i18n, group.first)}
      </Button>
      {group.count > 1 ? <Badge emphasis="low">{i18n.t("overview.more", { count: group.count })}</Badge> : null}
      {action ? (
        <Button size="sm" onClick={() => onAct(0)}>
          {actionLabel(i18n, action)}
        </Button>
      ) : null}
    </li>
  );
}

/** A figure of the summary that opens the screen it counts. */
function Figure({ label, value, to }: { label: MessageKey; value: string | null; to: Route }) {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  return (
    <>
      <dt className="text-fg-muted">{t(label)}</dt>
      <dd>
        {value === null ? (
          <span className="text-fg-muted">{t("overview.unavailable")}</span>
        ) : (
          <Button emphasis="low" size="sm" className="justify-start text-left text-sm font-normal text-fg" onClick={() => navigate(to)}>
            {value}
          </Button>
        )}
      </dd>
    </>
  );
}

function SummaryCard({ overview }: { overview: InstanceOverview }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { mods, plugins, conflicts } = overview;
  const hasPlugins = overview.instance.sections?.includes("overview.plugins") ?? false;
  const limits = plugins?.limits.filter((l) => l.used > 0).map((l) => `${l.used} ${i18n.has(`plugins.limit.${l.kind}`) ? t(`plugins.limit.${l.kind}` as MessageKey) : l.kind}`);
  return (
    <OverviewCard title={t("overview.summary")}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <Figure label="overview.mods" value={mods ? t("overview.modsValue", { enabled: mods.enabled, total: mods.total }) : null} to={{ view: "mods", filter: "enabled" }} />
        {hasPlugins ? (
          <Figure
            label="overview.plugins"
            value={plugins ? t("overview.pluginsValue", { active: plugins.active }) + (limits && limits.length > 1 ? ` (${limits.join(" + ")})` : "") : null}
            to={{ view: "plugins", filter: "active" }}
          />
        ) : null}
        <Figure label="overview.conflicts" value={conflicts ? t("overview.conflictsValue", { pairs: conflicts.pairs, overrides: conflicts.overrides }) : null} to={{ view: "conflicts" }} />
        <Figure label="overview.unreviewed" value={conflicts ? String(conflicts.unreviewed) : null} to={{ view: "conflicts", filter: "unreviewed" }} />
        <Figure label="overview.size" value={mods ? t("overview.sizeValue", { size: formatBytes(mods.size), files: mods.files }) : null} to={{ view: "mods" }} />
      </dl>
    </OverviewCard>
  );
}

function ShortcutsCard({ instance }: { instance: string }) {
  const { t, tp } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const { addToast } = useToast();
  const verify = async () => {
    const r = await run(() => backend.verifyDeployment(instance));
    if (r.ok) {
      const n = r.value.changeCount + r.value.newFileCount;
      addToast({ title: n === 0 ? t("settings.workarounds.verifyClean") : tp("settings.workarounds.verifyFound", n), variant: n === 0 ? "success" : "warning", duration: 4000 });
    }
  };
  return (
    <OverviewCard title={t("overview.shortcuts")}>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" startIcon={<PackagePlusIcon size="sm" />} onClick={() => void run(() => backend.pickImportFiles(instance, t("mods.import.pickFiles")))}>
          {t("overview.importMod")}
        </Button>
        <Button size="sm" startIcon={<FolderOpenIcon size="sm" />} onClick={() => void run(() => backend.openInstanceFolder(instance, "game"))}>
          {t("overview.openGameFolder")}
        </Button>
        <Button size="sm" startIcon={<FolderOpenIcon size="sm" />} onClick={() => void run(() => backend.openInstanceFolder(instance, "staging"))}>
          {t("overview.openStaging")}
        </Button>
        <Button size="sm" startIcon={<ScanSearchIcon size="sm" />} onClick={() => void verify()}>
          {t("deploy.action.verify")}
        </Button>
      </div>
    </OverviewCard>
  );
}

function ActivityCard({ overview }: { overview: InstanceOverview }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { navigate } = useNavigation();
  return (
    <OverviewCard
      title={t("overview.activity", { count: overview.recent.length })}
      actions={
        <Button size="sm" emphasis="low" startIcon={<HistoryIcon size="sm" />} onClick={() => navigate({ view: "diagnostics", tab: "history" })}>
          {t("dashboard.openHistory")}
        </Button>
      }
    >
      {overview.recent.length === 0 ? (
        <Typography variant="body-sm" color="muted-fg">
          {t("overview.noActivity")}
        </Typography>
      ) : (
        <ul className="space-y-1.5">
          {overview.recent.map((e) => (
            <li key={e.id} className="flex gap-3 text-sm">
              <span className="w-28 shrink-0 text-fg-muted" title={i18n.formatAbsolute(e.at)}>
                {i18n.formatDateTime(e.at)}
              </span>
              <span className="min-w-0 flex-1 text-fg">{historyText(i18n, e)}</span>
            </li>
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}
