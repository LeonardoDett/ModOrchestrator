import { Eye, RefreshCw, Rocket, Wrench } from "lucide-react";
import { Badge, Button, Popover, Stack, Typography } from "dettmann-ui";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { useDeploy } from "./DeployContext";
import { statusLook } from "./deploy-labels";

/**
 * Deploy status of the top bar (ui/00 §2.3): a button with icon + label;
 * the popover explains the status and offers the action that resolves it
 * (Deploy, Review, Reconcile, details of failures).
 */
export function DeployStatusButton() {
  const i18n = useI18n();
  const { t, has } = i18n;
  const { status, deploy, reconcile, openPreview, openFailures } = useDeploy();
  if (!status) return null;
  const look = statusLook(status);
  const Icon = look.icon;
  const switched = status.appliedProfile && status.appliedProfile.id !== status.activeProfile.id && status.entries > 0;
  const reasonKey = `deploy.reason.${status.reason}`;
  const busy = Boolean(status.busy);
  const canDeploy = !busy && status.kind !== "in_sync" && status.kind !== "unknown" && status.foreign.length === 0;

  return (
    <Popover.Root placement="bottom-start">
      <Popover.Trigger>
        <Button variant="ghost" size="sm" aria-label={`${t("deploy.statusLabel")}: ${t(look.label)}`}>
          <Badge tone={look.tone} variant={look.tone ? undefined : "muted"} className="gap-1">
            <Icon aria-hidden="true" className={look.spin ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
            {t(look.label)}
          </Badge>
          {switched ? (
            <Typography as="span" variant="caption" color="muted-fg" className="hidden lg:inline">
              {t("deploy.profileSwitch", { applied: status.appliedProfile!.name || "—", active: status.activeProfile.name })}
            </Typography>
          ) : null}
        </Button>
      </Popover.Trigger>
      <Popover.Content className="w-[24rem] max-w-[90vw] p-4">
        <Stack gap="sm">
          <Typography variant="heading-6">{t(look.label)}</Typography>
          {has(reasonKey) ? <Typography variant="body-sm">{t(reasonKey as MessageKey, { count: status.externalChanges })}</Typography> : null}
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
              <Button size="sm" startIcon={<Wrench aria-hidden="true" />} disabled={busy} onClick={() => void reconcile()}>
                {t("deploy.action.reconcile")}
              </Button>
            ) : null}
            {canDeploy ? (
              <Button size="sm" startIcon={<Rocket aria-hidden="true" />} onClick={() => void deploy()}>
                {t("deploy.action.deploy")}
              </Button>
            ) : null}
            {status.kind === "failed" && status.failures.length > 0 ? (
              <Button size="sm" variant="outline" startIcon={<RefreshCw aria-hidden="true" />} onClick={openFailures}>
                {t("deploy.action.failures")}
              </Button>
            ) : null}
            {status.kind !== "unknown" ? (
              <Button size="sm" variant="outline" startIcon={<Eye aria-hidden="true" />} disabled={busy} onClick={openPreview}>
                {t("deploy.action.preview")}
              </Button>
            ) : null}
          </div>
        </Stack>
      </Popover.Content>
    </Popover.Root>
  );
}
