import { useState } from "react";
import { Shield } from "lucide-react";
import { Alert, Button, Modal, Stack, Typography, Icon } from "dettmann-ui";
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
 * `elevation`: Windows refused the option without administrator rights
 * (D150, board JogoPlayAdmin); the dialog offers to play elevated.
 */
export function PrelaunchDialog({
  check,
  option,
  elevation = false,
  onLaunch,
  onClose,
}: {
  check: LaunchCheck;
  option: string;
  elevation?: boolean;
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

  if (elevation && !blocked) {
    const chosen = check.options.find((o) => (option ? o.id === option : o.default));
    return <ElevationDialog check={check} option={option} exe={chosen?.exe ?? ""} busy={busy} onPlay={() => void go({ deploy: check.deployNeeded, confirmed: true, elevated: true })} onClose={onClose} />;
  }

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
              <Alert.Root intent="info">
                <Alert.Title>{t("launch.dialog.deployNeeded")}</Alert.Title>
                <Alert.Description>{deployText}</Alert.Description>
              </Alert.Root>
            ) : null}
            {!blocked && check.deployProblem ? (
              <Alert.Root intent="warning">
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
          <Button disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {blocked ? null : (
            <>
              {check.deployNeeded ? (
                <Button disabled={busy} onClick={() => void go({ deploy: false, confirmed: true })}>
                  {t("launch.dialog.playWithoutDeploy")}
                </Button>
              ) : null}
              {problems && !check.deployNeeded ? (
                <Button emphasis="high" intent="warning" disabled={busy} onClick={() => void go({ deploy: false, confirmed: true })}>
                  {t("launch.dialog.playAnyway")}
                </Button>
              ) : null}
              {check.deployNeeded ? (
                <Button emphasis="high" disabled={busy} onClick={() => void go({ deploy: true, confirmed: problems })}>
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
    <ul className="divide-y divide-border rounded-control border border-border">
      {items.map((d) => {
        const look = SEVERITY_LOOK[shownSeverity(d)];
        const StateIcon = look.icon;
        return (
          <li key={d.key} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <Icon icon={StateIcon} size="sm" className={`shrink-0 ${look.className}`} />
            <Typography variant="body-sm" className="min-w-0 flex-1">
              {diagnosticTitle(i18n, d)}
            </Typography>
            {d.actions.slice(0, 2).map((a, i) => (
              <Button key={a.id} size="sm" onClick={() => void act(d, i)}>
                {actionLabel(i18n, a)}
              </Button>
            ))}
          </li>
        );
      })}
    </ul>
  );
}

/** Board JogoPlayAdmin (D150): play elevated after Windows refused the game. */
function ElevationDialog({
  check,
  option,
  exe,
  busy,
  onPlay,
  onClose,
}: {
  check: LaunchCheck;
  option: string;
  exe: string;
  busy: boolean;
  onPlay: () => void;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  // The executable sits in the middle of the sentence, in mono (board).
  const [before, after] = t("launch.dialog.elevationRefused", { exe: "\u0000" }).split("\u0000");
  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content size="custom" className="w-125" aria-describedby={undefined}>
        <Modal.Header layout="stacked">
          <span className="flex flex-col gap-1">
            <Modal.Title size="lg">{t("launch.dialog.elevationTitle")}</Modal.Title>
            {option ? (
              <Typography variant="body-sm" color="muted-fg">
                {launchOptionLabel(i18n, option)}
              </Typography>
            ) : null}
          </span>
        </Modal.Header>
        <Modal.Body>
          <div className="flex flex-col gap-3.5 text-sm">
            <Alert.Root intent="warning">
              <Alert.Title>{t("launch.dialog.elevationNeeded")}</Alert.Title>
              <Alert.Description>
                {before}
                <span className="font-mono text-xs">{exe}</span>
                {after}
              </Alert.Description>
            </Alert.Root>
            <Typography variant="body-sm" color="muted-fg">
              {t("launch.dialog.elevationHint")}
            </Typography>
            {check.warnings.length > 0 ? (
              <>
                <Typography variant="body-sm">{t("launch.dialog.warnings")}</Typography>
                <ProblemList items={check.warnings} />
              </>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button emphasis="high" intent="warning" disabled={busy} startIcon={<Icon icon={Shield} size="sm" />} onClick={onPlay}>
            {t("launch.dialog.playElevated")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
