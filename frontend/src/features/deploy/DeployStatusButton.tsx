import { Wrench } from "lucide-react";
import { EyeIcon, FileSearchIcon, RefreshIcon, RocketIcon } from "dettmann-ui/icons";
import { Badge, Button, Popover, Stack, Typography, Icon, Loader } from "dettmann-ui";
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

/**
 * Deployment card at the foot of the game menu (D120): the status of the
 * active game with the same panel as the status button; while a deploy runs
 * it shows the loader. Collapsed, it is an icon button with the status as
 * name and hint.
 */
export function DeployCard({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useI18n();
  const { status } = useDeploy();
  if (!status) return null;
  const look = statusLook(status);
  const StateIcon = look.icon;
  const busy = Boolean(status.busy);
  const name = `${t("deploy.statusLabel")}: ${t(look.label)}`;
  const glyph = StateIcon && !busy ? <Icon icon={StateIcon} size="sm" /> : <Loader decorative size="xs" />;
  return (
    <Popover.Root placement={collapsed ? "right-end" : "top-start"}>
      <Popover.Trigger>
        {collapsed ? (
          <Button emphasis="low" size="icon" aria-label={name} title={name}>
            {glyph}
          </Button>
        ) : (
          <button
            type="button"
            aria-label={name}
            data-slot="deploy-card"
            className="flex w-full flex-col gap-1 rounded-card border border-border bg-surface px-3 py-2 text-left motion-transition hover:state-layer-hover focus-ring"
          >
            <span className="text-caption font-medium text-fg-muted">{t("deploy.card.title")}</span>
            <Badge intent={look.intent} emphasis={look.intent ? undefined : "low"} className="gap-1 self-start">
              {glyph}
              {t(look.label)}
            </Badge>
          </button>
        )}
      </Popover.Trigger>
      <DeployStatusPanel />
    </Popover.Root>
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
