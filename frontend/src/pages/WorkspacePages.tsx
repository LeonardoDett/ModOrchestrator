import { ProblemBand } from "../features/diagnostics/ProblemBand";
import { Alert, Badge, EmptyState, Spinner, Stack, Typography } from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useInstanceDetails, useWorkspace } from "../bridge/queries";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { ForeignAlert } from "../features/games/ForeignAlert";
import { DeployOverview } from "../features/deploy/DeployOverview";
import { useStoreLabel } from "../features/games/GameDetails";
import { useAction } from "../features/games/use-action";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { PageBody } from "./PageBody";

/**
 * Overview of the active game (ui/telas/overview.md): what the backend
 * knows about the instance, the blocking state of foreign deployments and
 * the deploy status (F7). Mods and conflicts figures arrive later.
 */
export function OverviewPage() {
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
  if (!ws.data.active) return <PageBody><NoActiveGame /></PageBody>;
  return <OverviewBody id={ws.data.active.id} />;
}

function NoActiveGame() {
  const { t } = useI18n();
  return (
    <EmptyState.Root className="rounded-xl border border-border bg-surface">
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
  const details = useInstanceDetails(id);

  if (details.status === "loading") return <PageBody><Spinner label={t("common.loading")} /></PageBody>;
  if (details.status === "error") return <PageBody><ErrorAlert title="games.loadError" error={details.error} onRetry={details.reload} /></PageBody>;
  if (details.status !== "ready") return null;
  const g = details.data;

  return (
    <PageBody>
      <Stack gap="lg">
        <Stack gap="xs">
          <Typography variant="heading-4" color="fg">
            {g.name}
          </Typography>
          <Typography variant="body-sm" color="muted-fg">
            {[g.custom ? t("games.generic") : g.gameName, store(g.store), g.version ?? ""].filter(Boolean).join(" · ")}
          </Typography>
        </Stack>

        <ProblemBand exclude={["game_not_found"]} />

        {g.rootMissing ? (
          <Alert.Root variant="danger">
            <Alert.Description>{t("overview.rootMissing")}</Alert.Description>
          </Alert.Root>
        ) : null}
        <ForeignAlert
          findings={g.foreign}
          onOpenFolder={() => void run(() => backend.openInstanceFolder(g.id, "game"))}
          onRecheck={() => details.reload()}
        />
        <DeployOverview />

        <section aria-labelledby="overview-location" className="rounded-xl border border-border bg-surface p-4">
          <Typography id="overview-location" variant="heading-6" color="fg" className="mb-3">
            {t("overview.location")}
          </Typography>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <Row label="games.details.root" value={g.root} />
            {g.targets.map((target) => (
              <Row key={target.id} label="games.details.target" value={`${target.id}: ${target.path}`} />
            ))}
            <Row label="games.details.staging" value={g.staging} />
            <Row label="games.details.archives" value={g.archiveStore} />
            <Row label="games.details.backups" value={g.backupStore} />
          </dl>
        </section>

        <section aria-labelledby="overview-types" className="rounded-xl border border-border bg-surface p-4">
          <Typography id="overview-types" variant="heading-6" color="fg" className="mb-3">
            {t("games.details.modTypes")}
          </Typography>
          <div className="flex flex-wrap gap-2">
            {g.modTypes.map((mt) => (
              <Badge key={mt.id} variant="outline">
                {mt.name} → {mt.target}
              </Badge>
            ))}
          </div>
        </section>
      </Stack>
    </PageBody>
  );
}

function Row({ label, value }: { label: MessageKey; value: string }) {
  const { t } = useI18n();
  return (
    <>
      <dt className="text-fg-muted">{t(label)}</dt>
      <dd className="break-all font-mono text-xs text-fg">{value}</dd>
    </>
  );
}
