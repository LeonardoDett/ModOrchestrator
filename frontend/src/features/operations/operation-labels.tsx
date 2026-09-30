import { AlertTriangle, Ban, CheckCircle2, Circle, CircleDashed, Clock, Loader2, XCircle, type LucideIcon } from "lucide-react";
import { Badge, type Tone } from "dettmann-ui";
import type { OperationStatus, StepStatus } from "../../bridge/types";
import { useI18n, type Translator } from "../../i18n/i18n";

/**
 * Status visuals of ui/03 §5: always icon + label, never color alone (D043).
 */
const STATUS: Record<OperationStatus, { tone?: Tone; muted?: boolean; icon: LucideIcon; spin?: boolean }> = {
  pending: { tone: "info", icon: Clock },
  running: { tone: "primary", icon: Loader2, spin: true },
  succeeded: { tone: "success", icon: CheckCircle2 },
  failed: { tone: "danger", icon: XCircle },
  cancelled: { muted: true, icon: Ban },
  interrupted: { tone: "warning", icon: AlertTriangle },
};

export function OperationStatusBadge({ status }: { status: OperationStatus }) {
  const { t } = useI18n();
  const visual = STATUS[status];
  const Icon = visual.icon;
  return (
    <Badge tone={visual.tone} variant={visual.muted ? "muted" : undefined} className="gap-1">
      <Icon aria-hidden="true" className={visual.spin ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
      {t(`operation.status.${status}`)}
    </Badge>
  );
}

const STEP_ICON: Record<StepStatus, { icon: LucideIcon; className: string }> = {
  pending: { icon: Circle, className: "text-fg-subtle" },
  running: { icon: Loader2, className: "animate-spin text-brand-text" },
  completed: { icon: CheckCircle2, className: "text-success-text" },
  failed: { icon: XCircle, className: "text-danger-text" },
  skipped: { icon: CircleDashed, className: "text-fg-subtle" },
};

export function StepStatusIcon({ status }: { status: StepStatus }) {
  const { t } = useI18n();
  const { icon: Icon, className } = STEP_ICON[status];
  return <Icon role="img" aria-label={t(`operation.stepStatus.${status}`)} className={`h-4 w-4 shrink-0 ${className}`} />;
}

/**
 * Operation kinds and step names are open sets owned by each module; their
 * labels join the catalog with the module (key operation.kind.<kind> /
 * operation.step.<name>). Until then the stable id is shown.
 */
export function operationKindLabel(i18n: Translator, kind: string): string {
  const key = `operation.kind.${kind}`;
  return i18n.has(key) ? i18n.t(key) : kind;
}

export function operationStepLabel(i18n: Translator, step: string): string {
  const key = `operation.step.${step}`;
  return i18n.has(key) ? i18n.t(key) : step;
}

export function operationDuration(i18n: Translator, startedAt?: string, finishedAt?: string, now = Date.now()): string {
  if (!startedAt) return i18n.t("common.empty");
  const start = Date.parse(startedAt);
  const end = finishedAt ? Date.parse(finishedAt) : now;
  if (Number.isNaN(start) || Number.isNaN(end)) return i18n.t("common.empty");
  return i18n.formatDuration(Math.max(0, end - start));
}
