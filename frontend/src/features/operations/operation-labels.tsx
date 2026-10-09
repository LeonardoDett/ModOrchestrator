import { Circle, CircleDashed } from "lucide-react";
import { BanIcon, CircleCheckIcon, CircleXIcon, ClockIcon, TriangleAlertIcon } from "dettmann-ui/icons";
import { Badge, Icon, Loader, type Intent, type IconComponent } from "dettmann-ui";
import type { OperationStatus, StepStatus } from "../../bridge/types";
import { useI18n, type Translator } from "../../i18n/i18n";

/**
 * Status visuals of ui/03 §5: always icon + label, never color alone (D043).
 */
const STATUS: Record<OperationStatus, { intent?: Intent; muted?: boolean; icon?: IconComponent }> = {
  pending: { intent: "info", icon: ClockIcon },
  running: { intent: "brand" },
  succeeded: { intent: "success", icon: CircleCheckIcon },
  failed: { intent: "danger", icon: CircleXIcon },
  cancelled: { muted: true, icon: BanIcon },
  interrupted: { intent: "warning", icon: TriangleAlertIcon },
};

export function OperationStatusBadge({ status }: { status: OperationStatus }) {
  const { t } = useI18n();
  const visual = STATUS[status];
  const StateIcon = visual.icon;
  return (
    <Badge intent={visual.intent} emphasis={visual.muted ? "low" : undefined} className="gap-1">
      {StateIcon ? <Icon icon={StateIcon} size="xs" /> : <Loader decorative size="xs" />}
      {t(`operation.status.${status}`)}
    </Badge>
  );
}

const STEP_ICON: Record<Exclude<StepStatus, "running">, { icon: IconComponent; className: string }> = {
  pending: { icon: Circle, className: "text-fg-subtle" },
  completed: { icon: CircleCheckIcon, className: "text-success-text" },
  failed: { icon: CircleXIcon, className: "text-danger-text" },
  skipped: { icon: CircleDashed, className: "text-fg-subtle" },
};

export function StepStatusIcon({ status }: { status: StepStatus }) {
  const { t } = useI18n();
  if (status === "running") return <Loader size="sm" intent="brand" label={t("operation.stepStatus.running")} className="shrink-0" />;
  const { icon: StepIcon, className } = STEP_ICON[status];
  return <Icon icon={StepIcon} size="sm" label={t(`operation.stepStatus.${status}`)} className={`shrink-0 ${className}`} />;
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
