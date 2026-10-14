import { Wrench } from "lucide-react";
import { FileSearchIcon } from "dettmann-ui/icons";
import { Alert, Button, Stack, Icon } from "dettmann-ui";
import { useI18n } from "../../i18n/i18n";
import { useDeploy } from "./DeployContext";
import { statusLook } from "./deploy-labels";

/**
 * Deploy alerts of the Overview (ui/telas/overview.md, D127): the blocking
 * banner of an interrupted deploy with "Reconcile now" (ui/02 F-13),
 * changes made outside the app and a failed deploy. The board has no deploy
 * strip: deploying is the sidebar card and the attention row.
 */
export function DeployOverview() {
  const { t, tp } = useI18n();
  const { status, reconcile, openFailures, openReview } = useDeploy();
  if (!status) return null;
  const look = statusLook(status);
  const busy = Boolean(status.busy);

  return (
    <Stack gap="sm">
      {status.kind === "unknown" && status.reason === "journal_pending" ? (
        <Alert.Root intent="danger">
          <Alert.Title>{t("deploy.interrupted.title")}</Alert.Title>
          <Alert.Description>{t("deploy.interrupted.description")}</Alert.Description>
          <div className="pt-2">
            <Button emphasis="high" size="sm" startIcon={<Icon icon={Wrench} size="sm" />} disabled={busy} onClick={() => void reconcile()}>
              {t("deploy.action.reconcile")}
            </Button>
          </div>
        </Alert.Root>
      ) : null}
      {status.externalChanges > 0 || status.newFiles > 0 ? (
        <Alert.Root intent="warning">
          {status.externalChanges > 0 ? <Alert.Description>{tp("deploy.externalChanges", status.externalChanges)}</Alert.Description> : null}
          {status.newFiles > 0 ? <Alert.Description>{tp("deploy.newFiles", status.newFiles)}</Alert.Description> : null}
          <div className="pt-2">
            <Button size="sm" startIcon={<FileSearchIcon size="sm" />} disabled={busy} onClick={openReview}>
              {t("deploy.action.review")}
            </Button>
          </div>
        </Alert.Root>
      ) : null}
      {status.kind === "failed" && status.failures.length > 0 ? (
        <Alert.Root intent="danger" action={<Button size="sm" onClick={openFailures}>{t("deploy.action.failures")}</Button>}>
          <Alert.Description>{t(look.label)}</Alert.Description>
        </Alert.Root>
      ) : null}
    </Stack>
  );
}
