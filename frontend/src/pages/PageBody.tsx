import { Fragment, type ReactNode } from "react";
import { Alert, Button, EmptyState, FeaturedIcon, Loader, Skeleton, Stack, type IconComponent } from "dettmann-ui";
import { useWorkspace } from "../bridge/queries";
import { useDeploy } from "../features/deploy/DeployContext";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useI18n, type MessageKey } from "../i18n/i18n";

/** Page content frame below the top bar (the top bar holds the page title). */
export function PageBody({ children, fill = false }: { children: ReactNode; fill?: boolean }) {
  return (
    <div className={fill ? "flex h-full min-h-0 flex-col p-4 md:p-6" : "mx-auto w-full max-w-container-2xl p-4 md:p-6"}>
      {children}
    </div>
  );
}

interface HonestEmptyProps {
  icon: IconComponent;
  title: MessageKey;
  description: MessageKey;
  children?: ReactNode;
}

/** An honest empty state: no action is offered until the feature exists. */
export function HonestEmpty({ icon, title, description, children }: HonestEmptyProps) {
  const { t } = useI18n();
  return (
    <EmptyState.Root className="rounded-card border border-border bg-surface">
      <EmptyState.Icon>
        <FeaturedIcon icon={icon} intent="neutral" />
      </EmptyState.Icon>
      <EmptyState.Title>{t(title)}</EmptyState.Title>
      <EmptyState.Description>{t(description)}</EmptyState.Description>
      {children ? <EmptyState.Actions>{children}</EmptyState.Actions> : null}
    </EmptyState.Root>
  );
}

/**
 * Loading state of a page or list (ui/00 §4: skeleton). The skeleton is
 * decorative; the status role tells assistive technology what is going on.
 */
export function LoadingState({ rows = 6 }: { rows?: number }) {
  const { t } = useI18n();
  return (
    <div role="status" aria-label={t("common.loading")} className="flex flex-col gap-2">
      <Skeleton className="h-9 w-full rounded-control" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-7 w-full" />
      ))}
    </div>
  );
}

/** Outside the desktop app there is no data to show (D021). */
export function OfflineNotice() {
  const { t } = useI18n();
  return (
    <Alert.Root intent="info">
      <Alert.Description>{t("app.offlineHint")}</Alert.Description>
    </Alert.Root>
  );
}

/** "No matching rows" inside a filtered table, with the way back. */
export function NoMatch({ message, onClear }: { message: MessageKey; onClear?: () => void }) {
  const { t } = useI18n();
  return (
    <Stack gap="sm" className="items-center p-6 text-sm text-fg-muted">
      {t(message)}
      {onClear ? (
        <Button size="sm" onClick={onClear}>
          {t("filters.clear")}
        </Button>
      ) : null}
    </Stack>
  );
}

/**
 * Common frame of the workspace screens: loading, offline and query error
 * states of the workspace, then the screen for the active game (remounted
 * when the active game changes). Without an active game Routes sends the
 * user back to Games.
 */
export function WorkspaceGate({ children }: { children: (instance: string) => ReactNode }) {
  const ws = useWorkspace();
  if (ws.status === "loading") return <PageBody><LoadingState /></PageBody>;
  if (ws.status === "unavailable") return <PageBody><OfflineNotice /></PageBody>;
  if (ws.status === "error") return <PageBody><ErrorAlert title="games.loadError" error={ws.error} onRetry={ws.reload} /></PageBody>;
  if (!ws.data.active) return null;
  return <Fragment key={ws.data.active.id}>{children(ws.data.active.id)}</Fragment>;
}

const HOLDERS = ["deploy", "purge", "move_staging", "move_archives", "change_method", "remove", "apply_load_order", "tool"] as const;

/**
 * "Ocupado" state (ui/00 §4): which operation holds the active game. The
 * backend refuses other mutating commands meanwhile (instance_busy, D038);
 * the band says so before the user tries. Short holds (a single command)
 * are not announced: they end before the band would be read.
 */
export function BusyBand() {
  const { t } = useI18n();
  const { status } = useDeploy();
  const holder = status?.busy;
  if (!holder || holder === "plugins" || holder === "activate_profile" || holder === "games" || holder === "set_mod_type") return null;
  const text =
    holder === "import"
      ? t("busy.band.import")
      : t("busy.band", { operation: t((HOLDERS as readonly string[]).includes(holder) ? (`busy.holder.${holder}` as MessageKey) : "busy.holder.other") });
  return (
    <div role="status" className="flex items-center gap-2 rounded-control border border-border bg-sunken px-3 py-2 text-sm text-fg">
      <Loader decorative size="sm" intent="brand" className="shrink-0" />
      <span>{text}</span>
    </div>
  );
}
