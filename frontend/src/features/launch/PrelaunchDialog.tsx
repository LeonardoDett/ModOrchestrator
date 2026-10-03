import { useState } from "react";
import { Alert, Button, Modal, Stack, Typography } from "dettmann-ui";
import type { ActionResult } from "../games/use-action";
import type { Diagnostic, LaunchCheck, LaunchRequest } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { SEVERITY_LOOK, actionLabel, diagnosticTitle, shownSeverity } from "../diagnostics/diagnostic-labels";
import { useDiagnosticAction } from "../diagnostics/use-diagnostic-action";
import { launchOptionLabel } from "./PlayButton";

/**
 * DLG-26 Pré-lançamento (core/04 §9, ui/02 F-12). Variations come from the
 * backend check, never decided here:
 *  - deploy pending: "Implantar e jogar" (primary) / "Jogar sem implantar";
 *  - problems found: the warnings with their actions + "Jogar mesmo assim";
 *  - blocked: only the actions that solve the problem.
 * Acting on a problem rereads the check (the dialog follows it).
 */
export function PrelaunchDialog({
  check,
  option,
  onLaunch,
  onClose,
}: {
  check: LaunchCheck;
  option: string;
  onLaunch: (request: LaunchRequest) => Promise<ActionResult<string>>;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const [busy, setBusy] = useState(false);
  const blocked = check.state === "blocked";
  const problems = check.deployProblem || check.warnings.length > 0;

  const go = async (request: Omit<LaunchRequest, "option">) => {
    setBusy(true);
    const r = await onLaunch({ option, ...request });
    setBusy(false);
    if (r.ok) onClose();
  };

  const reasonKey = `deploy.reason.${check.deployReason}`;
  const deployText = i18n.has(reasonKey) && check.deployReason !== "external_changes" ? t(reasonKey) : t(`deploy.status.${check.deployKind}` as MessageKey);
  const title: MessageKey = blocked ? "launch.dialog.blockedTitle" : check.deployNeeded && !problems ? "launch.dialog.deployTitle" : "launch.dialog.problemsTitle";

  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content size="md" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t(title)}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            {option ? (
              <Typography variant="body-sm" color="muted-fg">
                {launchOptionLabel(i18n, option)}
              </Typography>
            ) : null}
            {blocked ? (
              <>
                <Typography variant="body-sm">{t("launch.dialog.blocked")}</Typography>
                <ProblemList items={check.blocking} />
              </>
            ) : null}
            {!blocked && check.deployNeeded ? (
              <Alert.Root variant="info">
                <Alert.Title>{t("launch.dialog.deployNeeded")}</Alert.Title>
                <Alert.Description>{deployText}</Alert.Description>
              </Alert.Root>
            ) : null}
            {!blocked && check.deployProblem ? (
              <Alert.Root variant="warning">
                <Alert.Title>{t("launch.dialog.deployProblem")}</Alert.Title>
                <Alert.Description>{deployText}</Alert.Description>
              </Alert.Root>
            ) : null}
            {!blocked && check.warnings.length > 0 ? (
              <>
                <Typography variant="body-sm">{t("launch.dialog.warnings")}</Typography>
                <ProblemList items={check.warnings} />
              </>
            ) : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {blocked ? null : (
            <>
              {check.deployNeeded ? (
                <Button variant="outline" disabled={busy} onClick={() => void go({ deploy: false, confirmed: true })}>
                  {t("launch.dialog.playWithoutDeploy")}
                </Button>
              ) : null}
              {problems && !check.deployNeeded ? (
                <Button tone="warning" disabled={busy} onClick={() => void go({ deploy: false, confirmed: true })}>
                  {t("launch.dialog.playAnyway")}
                </Button>
              ) : null}
              {check.deployNeeded ? (
                <Button disabled={busy} onClick={() => void go({ deploy: true, confirmed: problems })}>
                  {t(problems ? "launch.dialog.deployAndPlayAnyway" : "launch.dialog.deployAndPlay")}
                </Button>
              ) : null}
            </>
          )}
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

function ProblemList({ items }: { items: Diagnostic[] }) {
  const i18n = useI18n();
  const act = useDiagnosticAction();
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {items.map((d) => {
        const look = SEVERITY_LOOK[shownSeverity(d)];
        const Icon = look.icon;
        return (
          <li key={d.key} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${look.className}`} />
            <Typography variant="body-sm" className="min-w-0 flex-1">
              {diagnosticTitle(i18n, d)}
            </Typography>
            {d.actions.slice(0, 2).map((a, i) => (
              <Button key={a.id} size="sm" variant="outline" onClick={() => void act(d, i)}>
                {actionLabel(i18n, a)}
              </Button>
            ))}
          </li>
        );
      })}
    </ul>
  );
}
