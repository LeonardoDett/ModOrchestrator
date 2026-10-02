import { CircleAlert, Info, OctagonX, TriangleAlert, XCircle, type LucideIcon } from "lucide-react";
import type { Diagnostic, DiagnosticAction, DiagnosticEvidence, DiagnosticModule, HistoryEntry } from "../../bridge/types";
import type { MessageKey, Translator } from "../../i18n/i18n";

/** Severity as the UI shows it: blocking = error that blocks an operation (core/10 §1.1). */
export type ShownSeverity = "blocking" | "error" | "warning" | "info";

export function shownSeverity(d: Pick<Diagnostic, "severity" | "blocking">): ShownSeverity {
  return d.blocking ? "blocking" : d.severity;
}

/** Icon + tone per severity (ui/03 §5): status is never shown by colour alone. */
export const SEVERITY_LOOK: Record<ShownSeverity, { icon: LucideIcon; tone: "danger" | "warning" | "info"; className: string }> = {
  blocking: { icon: OctagonX, tone: "danger", className: "text-danger-text" },
  error: { icon: XCircle, tone: "danger", className: "text-danger-text" },
  warning: { icon: TriangleAlert, tone: "warning", className: "text-warning-text" },
  info: { icon: Info, tone: "info", className: "text-info-text" },
};

export const SEVERITY_ORDER: readonly ShownSeverity[] = ["blocking", "error", "warning", "info"];

export const MODULES: readonly DiagnosticModule[] = ["deploy", "conflicts", "rules", "plugins", "library", "game"];

export function severityLabel(i18n: Translator, s: ShownSeverity): string {
  return i18n.t(`diag.severity.${s}` as MessageKey);
}

export function moduleLabel(i18n: Translator, m: string): string {
  const key = `diag.module.${m}`;
  return i18n.has(key) ? i18n.t(key) : m;
}

/** Title of a diagnostic: a variant by status/kind when the catalog has it. */
export function diagnosticTitle(i18n: Translator, d: Pick<Diagnostic, "code" | "params">): string {
  const variant = d.params.status ?? d.params.kind;
  const specific = variant ? `diag.code.${d.code}.${variant}` : "";
  if (specific && i18n.has(specific)) return i18n.t(specific, d.params);
  const key = `diag.code.${d.code}`;
  return i18n.has(key) ? i18n.t(key, d.params) : i18n.t("error.unknown", { code: d.code });
}

export function diagnosticImpact(i18n: Translator, d: Pick<Diagnostic, "code">): string | null {
  const key = `diag.impact.${d.code}`;
  return i18n.has(key) ? i18n.t(key) : null;
}

export function actionLabel(i18n: Translator, a: DiagnosticAction): string {
  const key = `diag.action.${a.id}`;
  const params = { mod: "", ...a.params };
  return i18n.has(key) ? i18n.t(key, params).trim() : a.id;
}

export function evidenceText(i18n: Translator, e: DiagnosticEvidence): string {
  const key = `diag.evidence.${e.kind}`;
  if (i18n.has(key)) return i18n.t(key, e.params ?? {});
  return [e.kind, ...Object.entries(e.params ?? {}).map(([k, v]) => `${k}=${v}`)].join(" ");
}

export function blocksText(i18n: Translator, blocks: readonly string[]): string {
  return blocks.map((b) => (i18n.has(`diag.op.${b}`) ? i18n.t(`diag.op.${b}` as MessageKey) : b)).join(", ");
}

/** Sentence of a history entry ("Enabled X"); unknown types show the type. */
export function historyText(i18n: Translator, e: Pick<HistoryEntry, "type" | "params">): string {
  const key = `history.type.${e.type}`;
  return i18n.has(key) ? i18n.t(key, { name: "", winnerName: "", modName: "", count: "", moved: "", pairs: "", ...e.params }) : e.type;
}

export const NOTIFICATION_ICON: LucideIcon = CircleAlert;
