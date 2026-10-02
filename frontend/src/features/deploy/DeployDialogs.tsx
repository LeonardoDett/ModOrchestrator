import { useEffect, useState } from "react";
import { Alert, Badge, Button, Input, Modal, Spinner, Stack, Table, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { errorMessage, toUIError, type UIError } from "../../bridge/errors";
import type { DeployPlan, DeployStatus, ExternalDecision } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import { formatBytes, locationText } from "./deploy-labels";
import { ExternalChangesDialog } from "./ExternalChangesDialog";

/** Counts of a plan as the user reads them (DLG-14 "Resumo por ação"). */
function PlanSummary({ plan }: { plan: DeployPlan }) {
  const { t, tp } = useI18n();
  const s = plan.summary;
  const rows: [MessageKey, number][] = [
    ["deploy.plan.create", s.create],
    ["deploy.plan.replace", s.replace],
    ["deploy.plan.remove", s.remove],
    ["deploy.plan.backup", s.backupAndCreate],
    ["deploy.plan.restore", s.restoreBackup],
    ["deploy.plan.mkdir", s.mkdir],
    ["deploy.plan.rmdir", s.removeDir],
    ["deploy.plan.keep", s.keep],
  ];
  return (
    <Stack gap="xs">
      <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
        {rows.map(([label, n]) => (
          <div key={label} className="contents">
            <dt className={n > 0 ? "text-fg" : "text-fg-muted"}>{t(label)}</dt>
            <dd className="text-right tabular-nums text-fg">{n}</dd>
          </div>
        ))}
      </dl>
      {s.backupAndCreate > 0 ? <Typography variant="body-sm" color="muted-fg">{tp("deploy.plan.backupNote", s.backupAndCreate)}</Typography> : null}
      {s.extraBytes > 0 ? <Typography variant="body-sm" color="muted-fg">{t("deploy.plan.extraSpace", { size: formatBytes(s.extraBytes) })}</Typography> : null}
    </Stack>
  );
}

/**
 * "Precisa de decisão" of DLG-14: external changes are decided in DLG-15;
 * without a decision they stay as they are in this run.
 */
function ChangesSection({ plan, decided, onReview }: { plan: DeployPlan; decided: number | null; onReview: () => void }) {
  const { t, tp } = useI18n();
  if (plan.changeCount === 0 && plan.newFileCount === 0) return null;
  return (
    <Stack gap="xs">
      <Typography variant="heading-6">{t("deploy.decision.reviewTitle")}</Typography>
      {plan.changeCount > 0 ? <Typography variant="body-sm">{tp("deploy.decision.review", plan.changeCount)}</Typography> : null}
      {plan.newFileCount > 0 ? <Typography variant="body-sm">{tp("deploy.decision.reviewNew", plan.newFileCount)}</Typography> : null}
      <Typography variant="caption" color="muted-fg">
        {decided !== null ? tp("deploy.decision.reviewDecided", decided) : t("deploy.decision.reviewUndecided")}
      </Typography>
      <div>
        <Button size="sm" variant="outline" onClick={onReview}>
          {t("deploy.decision.reviewOpen")}
        </Button>
      </div>
    </Stack>
  );
}

/** Locations that cannot be written now; they stay untouched in this run. */
function UntouchedList({ plan }: { plan: DeployPlan }) {
  const { t, tp } = useI18n();
  if (plan.blockedCount === 0) return null;
  return (
    <Stack gap="sm">
      <Typography variant="heading-6">{t("deploy.decision.untouchedTitle")}</Typography>
      <Typography variant="body-sm" color="muted-fg">{t("deploy.decision.untouchedHelp")}</Typography>
      <div className="max-h-56 overflow-auto rounded-lg border border-border">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>{t("deploy.decision.path")}</Table.Head>
              <Table.Head>{t("deploy.decision.what")}</Table.Head>
              <Table.Head>{t("deploy.decision.mod")}</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {plan.blocked.map((b) => (
              <Table.Row key={`b:${locationText(b.location)}`}>
                <Table.Cell className="font-mono text-xs">{locationText(b.location)}</Table.Cell>
                <Table.Cell>
                  <Badge tone="danger">{t(`deploy.blocked.${b.reason}` as MessageKey)}</Badge>
                </Table.Cell>
                <Table.Cell />
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </div>
      {plan.blockedCount > plan.blocked.length ? (
        <Typography variant="caption" color="muted-fg">
          {tp("deploy.decision.more", plan.blockedCount - plan.blocked.length)}
        </Typography>
      ) : null}
    </Stack>
  );
}

/**
 * DLG-14 Plano de deploy. With `plan` it is the decision of a deploy waiting
 * at await_decision (Apply continues it, Cancel stops it with nothing
 * written); without, it previews what a deploy would do.
 */
export function DeployPlanDialog({ instance, plan: waiting, onClose }: { instance: string; plan?: DeployPlan; onClose: () => void }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const [preview, setPreview] = useState<DeployPlan | null>(null);
  const [error, setError] = useState<UIError | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [decisions, setDecisions] = useState<ExternalDecision[] | null>(null);
  // A deploy waiting with external changes opens DLG-15 at once: that is
  // the decision it waits for.
  const [reviewing, setReviewing] = useState(Boolean(waiting?.operation && waiting.changeCount > 0));
  const plan = waiting ?? preview;

  useEffect(() => {
    if (waiting) return;
    backend.previewDeploy(instance, false).then(setPreview, (e: unknown) => setError(toUIError(e)));
  }, [backend, instance, waiting]);

  const deciding = Boolean(waiting?.operation);
  const close = async () => {
    if (busy) return;
    if (deciding && waiting?.operation) {
      setBusy(true);
      await run(() => backend.cancelDeployDecision(instance, waiting.operation!), { quiet: true });
      setBusy(false);
    }
    onClose();
  };
  const apply = async (chosen: ExternalDecision[] | null = decisions) => {
    setBusy(true);
    const fallbacks = Object.keys(accepted).filter((k) => accepted[k]);
    let result;
    if (deciding) result = await run(() => backend.resolveDeployDecision(instance, waiting!.operation!, fallbacks, chosen ?? []), { quiet: true });
    else if (chosen && chosen.length > 0) result = await run(() => backend.resolveExternalChanges(instance, chosen), { quiet: true });
    else result = await run(() => backend.deploy(instance), { quiet: true });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  };
  // DLG-15 "Aplicar decisões" continues the waiting operation; a plan with
  // method fallbacks still waits for them here.
  const applyReview = (chosen: ExternalDecision[]) => {
    setDecisions(chosen);
    setReviewing(false);
    if (!plan || plan.fallbacks.length === 0) void apply(chosen);
  };

  return (
    <Modal.Root open onOpenChange={(open) => !open && void close()}>
      <Modal.Content size="lg" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t(waiting?.kind === "purge" ? "deploy.plan.titlePurge" : "deploy.plan.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {!plan ? (
            error ? (
              <ErrorAlert title="deploy.plan.loadError" error={error} />
            ) : (
              <Spinner label={t("common.loading")} />
            )
          ) : (
            <Stack gap="lg">
              {plan.empty ? (
                <Alert.Root variant="success">
                  <Alert.Description>{t("deploy.plan.empty")}</Alert.Description>
                </Alert.Root>
              ) : (
                <PlanSummary plan={plan} />
              )}
              {plan.fallbacks.length > 0 ? (
                <Stack gap="sm">
                  <Typography variant="heading-6">{t("deploy.decision.fallbackTitle")}</Typography>
                  {plan.fallbacks.map((f) => (
                    <Input.Root
                      key={f.key}
                      fullWidth
                      disabled={!deciding}
                      value={accepted[f.key] ? "accept" : "skip"}
                      onChange={(v: string) => setAccepted({ ...accepted, [f.key]: v === "accept" })}
                    >
                      <Input.Label>{tp("deploy.decision.fallback", f.count, { target: f.target, from: t(`deploy.method.${f.from}` as MessageKey), to: t(`deploy.method.${f.to}` as MessageKey) })}</Input.Label>
                      <Input.Box>
                        <Input.Select
                          options={[
                            { value: "skip", label: t("deploy.decision.fallbackSkip") },
                            { value: "accept", label: t("deploy.decision.fallbackAccept", { method: t(`deploy.method.${f.to}` as MessageKey) }) },
                          ]}
                        />
                      </Input.Box>
                    </Input.Root>
                  ))}
                </Stack>
              ) : null}
              <ChangesSection plan={plan} decided={decisions ? decisions.length : null} onReview={() => setReviewing(true)} />
              <UntouchedList plan={plan} />
              {error ? (
                <Alert.Root variant="danger">
                  <Alert.Description>{errorMessage(i18n, error)}</Alert.Description>
                </Alert.Root>
              ) : null}
            </Stack>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" disabled={busy} onClick={() => void close()}>
            {t(deciding ? "deploy.decision.cancel" : "common.close")}
          </Button>
          {deciding || (plan && !plan.empty) ? (
            <Button disabled={busy || !plan} onClick={() => void apply()}>
              {t(deciding ? "deploy.decision.apply" : "deploy.action.deploy")}
            </Button>
          ) : null}
        </Modal.Footer>
      </Modal.Content>
      {reviewing && plan ? (
        <ExternalChangesDialog
          instance={instance}
          changes={plan.changes}
          changeCount={plan.changeCount}
          newFileCount={plan.newFileCount}
          mode={deciding ? "deploy" : "review"}
          busy={busy}
          error={error}
          onApply={applyReview}
          onCancel={() => (deciding ? void close() : setReviewing(false))}
        />
      ) : null}
    </Modal.Root>
  );
}

/** DLG-17 Purge: short confirmation; mods stay installed (core/04 §6). */
export function PurgeDialog({ instance, onClose }: { instance: string; onClose: () => void }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const [plan, setPlan] = useState<DeployPlan | null>(null);
  const [error, setError] = useState<UIError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    backend.previewDeploy(instance, true).then(setPlan, (e: unknown) => setError(toUIError(e)));
  }, [backend, instance]);
  const purge = async () => {
    setBusy(true);
    const result = await run(() => backend.purge(instance), { quiet: true });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  };
  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content size="md" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("deploy.purge.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <Typography variant="body-sm">{t("deploy.purge.explain")}</Typography>
            {plan ? (
              <Typography variant="body-sm" color="muted-fg">
                {tp("deploy.purge.counts", plan.summary.remove, { restored: plan.summary.restoreBackup })}
              </Typography>
            ) : error ? null : (
              <Spinner label={t("common.loading")} />
            )}
            {plan && plan.changeCount + plan.newFileCount > 0 ? (
              <Alert.Root variant="warning">
                <Alert.Description>{tp("deploy.purge.untouched", plan.changeCount + plan.newFileCount)}</Alert.Description>
              </Alert.Root>
            ) : null}
            {error ? (
              <Alert.Root variant="danger">
                <Alert.Description>{errorMessage(i18n, error)}</Alert.Description>
              </Alert.Root>
            ) : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button tone="danger" disabled={busy} onClick={() => void purge()}>
            {t("deploy.action.purge")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/** DLG-16 Resultado de deploy com falhas: the locations and a retry. */
export function DeployFailuresDialog({ status, onRetry, onClose }: { status: DeployStatus; onRetry: () => Promise<void>; onClose: () => void }) {
  const { t, tp, has } = useI18n();
  return (
    <Modal.Root open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content size="lg" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("deploy.failures.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <Typography variant="body-sm">{tp("deploy.failures.explain", status.failures.length)}</Typography>
            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>{t("deploy.decision.path")}</Table.Head>
                    <Table.Head>{t("deploy.failures.reason")}</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {status.failures.map((f) => (
                    <Table.Row key={locationText(f.location) + f.code}>
                      <Table.Cell className="font-mono text-xs">{locationText(f.location)}</Table.Cell>
                      <Table.Cell className="text-sm">{has(`error.${f.code}`) ? t(`error.${f.code}` as MessageKey, {}) : f.code}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </div>
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            onClick={() => {
              onClose();
              void onRetry();
            }}
          >
            {t("deploy.failures.retry")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
