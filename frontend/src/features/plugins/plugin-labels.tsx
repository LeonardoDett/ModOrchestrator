import { Lock, Pin } from "lucide-react";
import { Indicator, Tag } from "dettmann-ui";
import type { PluginLimit, PluginReason, PluginRow } from "../../bridge/types";
import type { MessageKey, Translator } from "../../i18n/i18n";
import { SEVERITY_LOOK, diagnosticTitle, shownSeverity } from "../diagnostics/diagnostic-labels";

/** Origin of a plugin as the UI names it (core/08 §2). */
export function originLabel(i18n: Translator, origin: string): string {
  const key = `plugins.origin.${origin}`;
  return i18n.has(key) ? i18n.t(key) : origin;
}

/** Flag names come from the adapter; unknown ones are shown as they are. */
export function flagLabel(i18n: Translator, flag: string): string {
  const key = `plugins.flag.${flag}`;
  return i18n.has(key) ? i18n.t(key) : flag;
}

/** "Completos 198/254" (ui/telas/plugins.md §2). */
export function limitText(i18n: Translator, l: PluginLimit): string {
  const key = `plugins.limit.${l.kind}`;
  const label = i18n.has(key) ? i18n.t(key) : l.kind;
  const n = new Intl.NumberFormat(i18n.language);
  return `${label} ${n.format(l.used)}/${n.format(l.max)}`;
}

/** Flags column: adapter flags plus locked/implicit, each with a label. */
export function FlagTags({ row, i18n }: { row: PluginRow; i18n: Translator }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {row.flags.map((f) => (
        <Tag key={f} size="sm">
          {flagLabel(i18n, f)}
        </Tag>
      ))}
      {row.implicit ? <Indicator icon={Pin} tone="subtle" label={i18n.t("plugins.implicit")} /> : null}
      {row.locked && !row.implicit ? <Indicator icon={Lock} tone="subtle" label={i18n.t("plugins.locked")} /> : null}
    </span>
  );
}

/** Problems column: icon of the most severe problem + count, with its title. */
export function ProblemCell({ row, i18n }: { row: PluginRow; i18n: Translator }) {
  if (row.problems === 0 || !row.severity) return null;
  const look = SEVERITY_LOOK[shownSeverity({ severity: row.severity, blocking: false })];
  const title = diagnosticTitle(i18n, { code: row.problem, params: { plugin: row.name } });
  return (
    <span title={title}>
      <Indicator icon={look.icon} tone={look.tone} count={row.problems} label={i18n.tp("plugins.problems", row.problems, { title })} />
    </span>
  );
}

/** One constraint in words: "after Lib.esm (master)", "before Patch.esp (rule)". */
export function reasonText(i18n: Translator, r: PluginReason): string {
  const kind = i18n.has(`plugins.reason.kind.${r.kind}`) ? i18n.t(`plugins.reason.kind.${r.kind}` as MessageKey, { group: r.group, after: r.afterGroup }) : r.kind;
  return i18n.t(r.before ? "plugins.reason.after" : "plugins.reason.before", { other: r.other, kind });
}

/** A refused move: which plugin must stay after which, and why. */
export function violationText(i18n: Translator, r: PluginReason): string {
  const kind = i18n.has(`plugins.reason.kind.${r.kind}`) ? i18n.t(`plugins.reason.kind.${r.kind}` as MessageKey, { group: r.group, after: r.afterGroup }) : r.kind;
  return i18n.t("plugins.reason.violation", { plugin: r.plugin, other: r.other, kind });
}
