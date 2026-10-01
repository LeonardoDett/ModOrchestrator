import { useState } from "react";
import { Rocket, ScanSearch, Wrench } from "lucide-react";
import { Alert, Badge, Button, Stack, Typography, useToast } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { useAction } from "../games/use-action";
import { useDeploy } from "./DeployContext";
import { statusLook } from "./deploy-labels";

/**
 * Deploy strip of the Overview (ui/telas/overview.md): status, profile,
 * method, "Verify deployment", and the blocking banner of an interrupted
 * deploy with "Reconcile now" (ui/02 F-13).
 */
export function DeployOverview() {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const { addToast } = useToast();
  const { instance, status, deploy, reconcile, openFailures } = useDeploy();
  const [verifying, setVerifying] = useState(false);
  if (!status) return null;
  const look = statusLook(status);
  const Icon = look.icon;
  const busy = Boolean(status.busy);

  const verify = async () => {
    setVerifying(true);
    const result = await run(() => backend.verifyDeployment(instance), { quiet: true });
    setVerifying(false);
    if (result.ok) {
      const n = result.value.count;
      addToast({ title: n === 0 ? t("deploy.verify.clean") : tp("deploy.verify.changes", n), variant: n === 0 ? "success" : "warning", duration: 4000 });
    }
  };

  return (
    <Stack gap="sm">
      {status.kind === "unknown" && status.reason === "journal_pending" ? (
        <Alert.Root variant="danger">
          <Alert.Title>{t("deploy.interrupted.title")}</Alert.Title>
          <Alert.Description>{t("deploy.interrupted.description")}</Alert.Description>
          <div className="pt-2">
            <Button size="sm" startIcon={<Wrench aria-hidden="true" />} disabled={busy} onClick={() => void reconcile()}>
              {t("deploy.action.reconcile")}
            </Button>
          </div>
        </Alert.Root>
      ) : null}
      {status.externalChanges > 0 ? (
        <Alert.Root variant="warning">
          <Alert.Description>{tp("deploy.externalChanges", status.externalChanges)}</Alert.Description>
        </Alert.Root>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <Badge tone={look.tone} variant={look.tone ? undefined : "muted"} className="gap-1">
          <Icon aria-hidden="true" className={look.spin ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
          {t(look.label)}
        </Badge>
        <Typography variant="body-sm" color="muted-fg">
          {[
            t("deploy.strip.profile", { name: status.activeProfile.name }),
            status.appliedAt ? t("deploy.strip.appliedAt", { when: i18n.formatDateTime(status.appliedAt) }) : null,
            t("deploy.strip.method", { method: t(`deploy.method.${status.method}` as MessageKey) }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </Typography>
        <div className="flex-1" />
        {status.kind === "failed" && status.failures.length > 0 ? (
          <Button size="sm" variant="outline" onClick={openFailures}>
            {t("deploy.action.failures")}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" startIcon={<ScanSearch aria-hidden="true" />} disabled={verifying || busy || status.entries === 0} onClick={() => void verify()}>
          {t("deploy.action.verify")}
        </Button>
        <Button
          size="sm"
          startIcon={<Rocket aria-hidden="true" />}
          disabled={busy || status.kind === "in_sync" || status.kind === "unknown" || status.foreign.length > 0}
          onClick={() => void deploy()}
        >
          {t("deploy.action.deploy")}
        </Button>
      </div>
    </Stack>
  );
}
