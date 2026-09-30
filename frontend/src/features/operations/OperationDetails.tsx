import { ScrollText } from "lucide-react";
import { Alert, Button, Inline, Progress, Stack, Typography } from "dettmann-ui";
import { errorMessage } from "../../bridge/errors";
import type { Operation } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { TechnicalDetails } from "../feedback/ErrorAlert";
import { OperationStatusBadge, StepStatusIcon, operationDuration, operationKindLabel, operationStepLabel } from "./operation-labels";

interface OperationDetailsProps {
  operation: Operation;
  /** Compact card for the drawer; full view for the Diagnostics inspector. */
  compact?: boolean;
  onViewLog?: (operationId: string) => void;
}

/** Steps with progress, structured error and technical details of one operation. */
export function OperationDetails({ operation: op, compact = false, onViewLog }: OperationDetailsProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const running = op.status === "running";
  const showSteps = !compact || running || op.status === "failed" || op.status === "interrupted";

  return (
    <Stack gap="sm">
      <Inline justify="between" align="start" wrap={false} gap="sm">
        <Stack gap="xs" className="min-w-0">
          <Typography variant="label" className="truncate">
            {operationKindLabel(i18n, op.kind)}
          </Typography>
          <Typography variant="caption" color="muted-fg" className="tabular-nums">
            {i18n.formatDateTime(op.startedAt ?? op.createdAt)} · {operationDuration(i18n, op.startedAt, op.finishedAt)}
          </Typography>
        </Stack>
        <OperationStatusBadge status={op.status} />
      </Inline>

      {op.subject ? (
        <Typography variant="caption" color="muted-fg">
          {t("operations.subject")}: {op.subject.kind} {op.subject.id}
        </Typography>
      ) : null}

      {running && op.progress.total > 0 ? (
        <Stack gap="xs">
          <Progress.Root value={op.progress.current} max={op.progress.total} aria-label={operationKindLabel(i18n, op.kind)} />
          <Typography variant="caption" color="muted-fg" className="tabular-nums">
            {t("operations.progress", { current: op.progress.current, total: op.progress.total })}
          </Typography>
        </Stack>
      ) : null}

      {showSteps && op.steps.length > 0 ? (
        <Stack gap="xs" as="section" aria-label={t("operations.steps")}>
          {!compact ? (
            <Typography variant="caption" color="muted-fg" className="font-semibold uppercase tracking-wide">
              {t("operations.steps")}
            </Typography>
          ) : null}
          <ol className="flex flex-col gap-1">
            {op.steps.map((step) => (
              <li key={step.name} className="flex items-center gap-2 text-sm">
                <StepStatusIcon status={step.status} />
                <span className={step.status === "pending" || step.status === "skipped" ? "text-fg-muted" : "text-fg"}>
                  {operationStepLabel(i18n, step.name)}
                </span>
              </li>
            ))}
          </ol>
        </Stack>
      ) : null}

      {op.error ? (
        <Alert.Root variant="danger">
          <Alert.Title>{t("operations.error")}</Alert.Title>
          <Alert.Description>
            <Stack gap="xs">
              <span>{errorMessage(i18n, { code: op.error.code, params: {} })}</span>
              {op.error.retryable ? <span>{t("operations.retryable")}</span> : null}
              <TechnicalDetails
                text={[op.error.code, op.error.step, op.error.message, op.error.detail].filter(Boolean).join("\n")}
              />
            </Stack>
          </Alert.Description>
        </Alert.Root>
      ) : null}

      {onViewLog ? (
        <div>
          <Button size="sm" variant="ghost" startIcon={<ScrollText aria-hidden="true" className="h-4 w-4" />} onClick={() => onViewLog(op.id)}>
            {t("operations.viewLog")}
          </Button>
        </div>
      ) : null}
    </Stack>
  );
}
