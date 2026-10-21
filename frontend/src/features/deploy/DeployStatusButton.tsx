import { Wrench } from "lucide-react";
import { ClockIcon, EyeIcon, FileSearchIcon, RefreshIcon, RocketIcon } from "dettmann-ui/icons";
import { Badge, Button, Popover, Progress, Stack, Typography, Icon, Loader } from "dettmann-ui";
import { useOperations, useTools } from "../../bridge/queries";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { useDeploy } from "./DeployContext";
import { statusLook } from "./deploy-labels";

/**
 * Deploy status of the top bar (ui/00 §2.3): a button with icon + label;
 * the popover explains the status and offers the action that resolves it
 * (Deploy, Review, Reconcile, details of failures).
 */
export function DeployStatusButton() {
  const { t } = useI18n();
  const { status } = useDeploy();
  if (!status) return null;
  const look = statusLook(status);
  const StateIcon = look.icon;
  return (
    <Popover.Root placement="bottom-start">
      <Popover.Trigger>
        <Button emphasis="low" size="sm" aria-label={`${t("deploy.statusLabel")}: ${t(look.label)}`}>
          <Badge intent={look.intent} emphasis={look.intent ? undefined : "low"} className="gap-1">
            {StateIcon ? <Icon icon={StateIcon} size="xs" /> : <Loader decorative size="xs" />}
            {t(look.label)}
          </Badge>
        </Button>
      </Popover.Trigger>
      <DeployStatusPanel />
    </Popover.Root>
  );
}

/** The deploy running on the active game and its progress, from the operations list. */
function useRunningDeploy(instance: string) {
  const ops = useOperations(20);
  if (ops.status !== "ready") return null;
  const op = ops.data.find((o) => o.status === "running" && (o.kind === "deploy" || o.kind === "purge") && (!o.subject || o.subject.id === instance));
  return op ?? null;
}

/**
 * Deployment card at the foot of the game menu (D120, board JogoMods): only
 * while something is pending. Deploying: icon tile, "Implantando", files done
 * of total, the percentage and a thin bar at the bottom. Needing action: the
 * status with its icon. In sync it is not shown. Collapsed: a ring with the
 * percentage, or the status icon.
 */
export function DeployCard({ collapsed = false }: { collapsed?: boolean }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { status, instance } = useDeploy();
  const running = useRunningDeploy(instance);
  const toolBusy = status?.busy === "tool";
  if (!status) return null;
  if (toolBusy) return <ToolInUseCard instance={instance} collapsed={collapsed} />;
  const look = statusLook(status);
  const busy = Boolean(status.busy);
  if (!busy && status.kind === "in_sync" && status.newFiles === 0 && status.externalChanges === 0) return null;
  const StateIcon = look.icon;
  const total = running?.progress.total ?? 0;
  const done = running?.progress.current ?? 0;
  const percent = total > 0 ? Math.round((done / total) * 100) : undefined;
  const title = busy ? t("deploy.card.deploying") : t(look.label);
  const detail = busy
    ? total > 0
      ? t("deploy.card.files", { done: i18n.formatNumber(done), total: i18n.formatNumber(total) })
      : t("deploy.card.starting")
    : t("deploy.card.open");
  const name = percent !== undefined ? `${title}, ${percent}%` : `${t("deploy.statusLabel")}: ${title}`;
  const intent = busy ? "info" : look.intent;
  let glyph = <Loader decorative size="xs" />;
  if (busy) glyph = <RocketIcon size="sm" loop />;
  else if (StateIcon) glyph = <Icon icon={StateIcon} size="sm" />;
  return (
    <Popover.Root placement={collapsed ? "right-end" : "top-start"}>
      <Popover.Trigger>
        {collapsed ? (
          <button type="button" aria-label={name} title={name} className="focus-ring flex size-10 items-center justify-center rounded-pill">
            {percent !== undefined ? (
              <span className="relative flex size-10 items-center justify-center">
                <Progress.Circle value={percent} size={40} strokeWidth={4} intent="info" aria-hidden="true" />
                <span className="absolute text-[10px] font-bold text-intent-text" data-intent="info">
                  {percent}%
                </span>
              </span>
            ) : (
              <span data-intent={intent} className="flex size-9 items-center justify-center rounded-control bg-intent-subtle text-intent-text">
                {glyph}
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            aria-label={name}
            data-slot="deploy-card"
            className="relative flex h-14 w-full items-center gap-2.5 overflow-hidden rounded-control border border-border bg-surface px-3 text-left motion-transition hover:state-layer-hover focus-ring"
          >
            <span data-intent={intent} className="flex size-7 shrink-0 items-center justify-center rounded-control bg-intent-subtle text-intent-text">
              {glyph}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold text-fg">{title}</span>
              <span className="truncate text-xs text-fg-muted">{detail}</span>
            </span>
            {percent !== undefined ? (
              <span data-intent="info" className="shrink-0 text-[15px] font-semibold text-intent-text">
                {percent}%
              </span>
            ) : null}
            {percent !== undefined ? <Progress.Root value={percent} intent="info" className="absolute inset-x-0 bottom-0 h-[3px] rounded-none" aria-hidden="true" /> : null}
          </button>
        )}
      </Popover.Trigger>
      <DeployStatusPanel />
    </Popover.Root>
  );
}

/**
 * An exclusive tool holds the game (D146, board JogoFerramentas): the card
 * says which one and that changes wait until it closes.
 */
function ToolInUseCard({ instance, collapsed }: { instance: string; collapsed: boolean }) {
  const { t } = useI18n();
  const tools = useTools(instance);
  const name = tools.status === "ready" ? tools.data.blocker : "";
  const text = name ? t("tools.inUse", { name }) : t("busy.band", { operation: t("busy.holder.tool") });
  if (collapsed) {
    return (
      <span role="status" aria-label={text} title={text} data-intent="warning" className="flex size-9 items-center justify-center rounded-control bg-intent-subtle text-intent-text">
        <ClockIcon size="sm" />
      </span>
    );
  }
  return (
    <div role="status" data-intent="warning" className="flex items-start gap-2 rounded-control border border-intent-border bg-intent-subtle p-2.5 text-xs leading-snug text-intent-text">
      <ClockIcon size="xs" className="mt-px shrink-0" />
      <span>{text}</span>
    </div>
  );
}

/** Popover body shared by the status button and the card: what the status means and the action that resolves it. */
function DeployStatusPanel() {
  const i18n = useI18n();
  const { t, tp, has } = i18n;
  const { status, deploy, reconcile, openPreview, openFailures, openReview } = useDeploy();
  if (!status) return null;
  const look = statusLook(status);
  const switched = status.appliedProfile && status.appliedProfile.id !== status.activeProfile.id && status.entries > 0;
  const reasonKey = `deploy.reason.${status.reason}`;
  const busy = Boolean(status.busy);
  const canDeploy = !busy && status.kind !== "in_sync" && status.kind !== "unknown" && status.foreign.length === 0;

  return (
      <Popover.Content className="w-[24rem] max-w-[90vw] p-4">
        <Stack gap="sm">
          <Typography variant="heading-6">{t(look.label)}</Typography>
          {has(reasonKey) ? <Typography variant="body-sm">{t(reasonKey as MessageKey, { count: status.externalChanges })}</Typography> : null}
          {switched ? (
            <Typography variant="body-sm" color="muted-fg">
              {t("deploy.profileSwitch", { applied: status.appliedProfile!.name || "—", active: status.activeProfile.name })}
            </Typography>
          ) : null}
          {status.newFiles > 0 ? <Typography variant="body-sm">{tp("deploy.newFiles", status.newFiles)}</Typography> : null}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-fg-muted">{t("deploy.field.active")}</dt>
            <dd className="text-fg">{status.activeProfile.name}</dd>
            {status.appliedProfile && status.entries > 0 ? (
              <>
                <dt className="text-fg-muted">{t("deploy.field.applied")}</dt>
                <dd className="text-fg">{status.appliedProfile.name || "—"}</dd>
              </>
            ) : null}
            {status.appliedAt ? (
              <>
                <dt className="text-fg-muted">{t("deploy.field.appliedAt")}</dt>
                <dd className="text-fg">{i18n.formatDateTime(status.appliedAt)}</dd>
              </>
            ) : null}
            <dt className="text-fg-muted">{t("deploy.field.method")}</dt>
            <dd className="text-fg">{t(`deploy.method.${status.method}` as MessageKey)}</dd>
          </dl>
          <div className="flex flex-wrap gap-2 pt-1">
            {status.kind === "unknown" && status.reason === "journal_pending" ? (
              <Button emphasis="high" size="sm" startIcon={<Icon icon={Wrench} size="sm" />} disabled={busy} onClick={() => void reconcile()}>
                {t("deploy.action.reconcile")}
              </Button>
            ) : null}
            {canDeploy ? (
              <Button emphasis="high" size="sm" startIcon={<RocketIcon size="sm" />} onClick={() => void deploy()}>
                {t("deploy.action.deploy")}
              </Button>
            ) : null}
            {status.externalChanges > 0 || status.newFiles > 0 ? (
              <Button size="sm" startIcon={<FileSearchIcon size="sm" />} disabled={busy} onClick={openReview}>
                {t("deploy.action.review")}
              </Button>
            ) : null}
            {status.kind === "failed" && status.failures.length > 0 ? (
              <Button size="sm" startIcon={<RefreshIcon size="sm" />} onClick={openFailures}>
                {t("deploy.action.failures")}
              </Button>
            ) : null}
            {status.kind !== "unknown" ? (
              <Button size="sm" startIcon={<EyeIcon size="sm" />} disabled={busy} onClick={openPreview}>
                {t("deploy.action.preview")}
              </Button>
            ) : null}
          </div>
        </Stack>
      </Popover.Content>
  );
}
