import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { ChevronDownIcon, ChevronRightIcon, EyeOffIcon, InfoIcon, LockIcon, SearchIcon } from "dettmann-ui/icons";
import { Alert, Button, FilterChip, Icon, Input, Tag } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { useProblems, useWorkspace } from "../../bridge/queries";
import type { Diagnostic } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { HonestEmpty, LoadingState } from "../../pages/PageBody";
import { useNavigation } from "../../shell/navigation";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import {
  MODULES,
  SEVERITY_LOOK,
  SEVERITY_ORDER,
  actionLabel,
  blocksText,
  diagnosticImpact,
  diagnosticTitle,
  evidenceText,
  moduleLabel,
  severityLabel,
  shownSeverity,
  type ShownSeverity,
} from "./diagnostic-labels";
import { useDiagnosticAction } from "./use-diagnostic-action";

/** Subject of a diagnostic for the list: the mod, plugin or path it is about. */
function subjectOf(d: Diagnostic): string {
  const p = d.params;
  return p.mod ?? p.a ?? p.plugin ?? p.path ?? p.game ?? "";
}

/** Small uppercase title of a block (boards). */
function BlockTitle({ children }: { children: ReactNode }) {
  return <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-fg-muted">{children}</span>;
}

/**
 * Diagnostics › Problems (board JogoDiagnostico, ui/telas/diagnostics.md
 * §2): search and area chips with counts, the problems grouped by severity
 * (title, subject, "Novo", area), "Ignorados (N)" at the foot, and the
 * detail at the side: what it causes, what was found, how to solve it with
 * its actions, and ignoring (never for blocking ones). Everything is read
 * from the backend; executing an action rereads the list.
 */
export function ProblemsPanel({ instance }: { instance: string }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const { route } = useNavigation();
  const act = useDiagnosticAction();
  const problems = useProblems(instance);
  // The Plugins area exists only where the game has plugins (capability, from the backend).
  const workspace = useWorkspace();
  const withPlugins = workspace.status === "ready" && workspace.data.items.includes("plugins");
  const areas = MODULES.filter((m) => m !== "plugins" || withPlugins);
  const [module, setModule] = useState("all");
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string | null>(route.diagnostic ?? null);
  const [showSuppressed, setShowSuppressed] = useState(false);

  // Visiting the tab marks what is "new" from now on; the marks shown in this
  // visit were computed before it.
  useEffect(() => {
    if (!instance || !backend.connected) return;
    return () => {
      backend.markDiagnosticsVisited(instance).catch(() => undefined);
    };
  }, [backend, instance]);

  useEffect(() => {
    if (route.diagnostic) setSelected(route.diagnostic);
  }, [route.diagnostic]);

  const data = problems.status === "ready" ? problems.data : null;
  const items = useMemo(() => data?.items ?? [], [data]);
  const byText = useMemo(() => {
    const q = text.trim().toLowerCase();
    return q ? items.filter((d) => [diagnosticTitle(i18n, d), subjectOf(d), d.code].some((s) => s.toLowerCase().includes(q))) : items;
  }, [items, text, i18n]);
  const visible = module === "all" ? byText : byText.filter((d) => d.module === module);
  const groups = SEVERITY_ORDER.map((s) => ({ severity: s, rows: visible.filter((d) => shownSeverity(d) === s) })).filter((g) => g.rows.length > 0);
  const current =
    items.find((d) => d.key === selected) ??
    items.find((d) => d.code === selected) ??
    data?.suppressed.find((d) => d.key === selected) ??
    groups[0]?.rows[0] ??
    null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2.5">
        <div className="w-65 shrink-0" data-page-search>
          <Input.Root value={text} onChange={(value: string) => setText(value)} fullWidth>
            <Input.Box>
              <SearchIcon size="sm" className="text-fg-muted" />
              <Input.Field aria-label={t("diag.search")} placeholder={t("diag.search")} />
            </Input.Box>
          </Input.Root>
        </div>
        <FilterChip.Group
          type="single"
          aria-label={t("diag.moduleFilter")}
          value={[module]}
          onValueChange={(v) => setModule(v[0] ?? "all")}
          className="flex flex-wrap gap-1.5"
        >
          <FilterChip value="all" tone="neutral" count={byText.length}>
            {t("diag.module.all")}
          </FilterChip>
          {areas.map((m) => {
            const n = byText.filter((d) => d.module === m).length;
            return (
              <FilterChip key={m} value={m} tone="neutral" {...(n > 0 ? { count: n } : {})}>
                {moduleLabel(i18n, m)}
              </FilterChip>
            );
          })}
        </FilterChip.Group>
      </div>

      {problems.status === "unavailable" ? (
        <Alert.Root intent="info">
          <Alert.Description>{t("app.offlineHint")}</Alert.Description>
        </Alert.Root>
      ) : null}
      {problems.status === "error" ? <ErrorAlert title="diag.loadError" error={problems.error} onRetry={problems.reload} /> : null}
      {problems.status === "loading" ? <LoadingState /> : null}
      {data?.partial ? (
        <Alert.Root intent="warning" className="mb-3">
          <Alert.Description>{t("diag.partial")}</Alert.Description>
        </Alert.Root>
      ) : null}

      {data && items.length === 0 && data.suppressed.length === 0 ? <HonestEmpty icon={ShieldCheck} title="diag.emptyTitle" description="diag.emptyDescription" /> : null}

      {data && (items.length > 0 || data.suppressed.length > 0) ? (
        <div className="mb-6 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_26.25rem] gap-4">
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface">
            <div role="list" aria-label={t("diagnostics.tab.problems")} className="min-h-0 flex-1 overflow-auto">
              {groups.length === 0 ? <div className="p-6 text-sm text-fg-muted">{t("diag.noMatch")}</div> : null}
              {groups.map((g) => {
                const look = SEVERITY_LOOK[g.severity];
                return (
                  <div key={g.severity} role="presentation">
                    <div
                      data-layer="medium"
                      className={`flex h-8.5 items-center gap-2 border-b border-border bg-structure px-4 text-xs font-semibold ${look.className}`}
                    >
                      <Icon icon={look.icon} size="sm" />
                      {severityGroupLabel(i18n, g.severity)}
                      <span className="font-medium text-fg-muted">{g.rows.length}</span>
                    </div>
                    {g.rows.map((d) => {
                      const on = current?.key === d.key;
                      return (
                        <div key={d.key} role="listitem">
                        <button
                          type="button"
                          aria-current={on}
                          onClick={() => setSelected(d.key)}
                          className={`focus-ring-inset relative grid h-14.5 w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border-subtle px-4 text-left motion-transition ${on ? "bg-selected before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-brand-fill" : "hover:bg-state-hover"}`}
                        >
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="truncate text-sm font-medium text-fg">{diagnosticTitle(i18n, d)}</span>
                            {subjectOf(d) ? <span className="truncate text-xs text-fg-muted">{subjectOf(d)}</span> : null}
                          </span>
                          {d.new ? (
                            <Tag size="sm" shape="pill" intent="brand">
                              {t("diag.new")}
                            </Tag>
                          ) : (
                            <span />
                          )}
                          <Tag size="md" shape="rounded" outline={false}>
                            {moduleLabel(i18n, d.module)}
                          </Tag>
                        </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {data.suppressed.length > 0 ? (
              <div className="shrink-0 border-t border-border">
                <button
                  type="button"
                  data-layer="medium"
                  aria-expanded={showSuppressed}
                  onClick={() => setShowSuppressed((v) => !v)}
                  className="focus-ring-inset flex h-10 w-full items-center gap-2 bg-structure px-4 text-left text-sm text-fg-muted motion-transition hover:text-fg"
                >
                  {showSuppressed ? <ChevronDownIcon size="sm" /> : <ChevronRightIcon size="sm" />}
                  {tp("diag.suppressed", data.suppressed.length)}
                </button>
                {showSuppressed ? (
                  <ul className="max-h-48 divide-y divide-border-subtle overflow-auto border-t border-border">
                    {data.suppressed.map((d) => (
                      <li key={d.key} className="flex items-center gap-3 px-4 py-2">
                        <EyeOffIcon size="sm" className="shrink-0 text-fg-muted" />
                        <span className="min-w-0 flex-1 truncate text-sm text-fg">{diagnosticTitle(i18n, d)}</span>
                        <Button size="sm" emphasis="low" onClick={() => void run(() => backend.unsuppressDiagnostic(d.key, ""))}>
                          {t("diag.reactivate")}
                        </Button>
                        <Button size="sm" emphasis="low" onClick={() => void run(() => backend.unsuppressDiagnostic("", d.code))}>
                          {t("diag.reactivateType")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
          {current ? (
            <aside aria-label={t("diag.details")} className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface">
              <DiagnosticDetail d={current} onAct={(i) => void act(current, i)} />
            </aside>
          ) : (
            <div />
          )}
        </div>
      ) : null}
    </div>
  );
}

/** "Bloqueante", "Erros", "Avisos", "Informações": the heading of a group. */
function severityGroupLabel(i18n: ReturnType<typeof useI18n>, s: ShownSeverity): string {
  const key = `diag.group.${s}`;
  return i18n.has(key) ? i18n.t(key) : severityLabel(i18n, s);
}

/**
 * The side detail (board JogoDiagnostico): severity and title on top; what
 * it causes, what was found and how to solve it, with the actions; ignoring
 * at the foot (blocking problems cannot be ignored).
 */
export function DiagnosticDetail({ d, onAct }: { d: Diagnostic; onAct: (index: number) => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const s = shownSeverity(d);
  const look = SEVERITY_LOOK[s];
  const impact = diagnosticImpact(i18n, d);
  const resolveKey = `diag.resolve.${d.code}`;
  const resolve = i18n.has(resolveKey) ? i18n.t(resolveKey) : null;
  return (
    <>
      <div data-layer="medium" className="flex flex-col gap-2 border-b border-border bg-structure p-4">
        <Tag size="md" shape="pill" intent={look.intent} outline={false} icon={look.icon} className="self-start">
          {severityLabel(i18n, s)}
        </Tag>
        <h2 className="text-md font-semibold leading-snug text-fg">{diagnosticTitle(i18n, d)}</h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 text-sm">
        {impact || d.blocks.length > 0 ? (
          <section className="flex flex-col gap-1.5">
            <BlockTitle>{t("diag.causes")}</BlockTitle>
            {impact ? <span className="leading-normal text-fg">{impact}</span> : null}
            {d.blocks.length > 0 ? <span className="text-fg-muted">{t("diag.blocks", { operations: blocksText(i18n, d.blocks) })}</span> : null}
          </section>
        ) : null}
        <section className="flex flex-col gap-2" aria-label={t("diag.found")}>
          <BlockTitle>{t("diag.found")}</BlockTitle>
          {d.evidence.map((e, i) => (
            <div key={`${e.kind}-${i}`} className="flex flex-col gap-0.5 rounded-control border border-border-subtle bg-sunken px-3 py-2.5">
              <span className="text-fg">{evidenceText(i18n, e)}</span>
            </div>
          ))}
          {d.firstSeen ? <span className="text-xs text-fg-muted">{t("diag.firstSeen", { when: i18n.formatDateTime(d.firstSeen) })}</span> : null}
        </section>
        {resolve || d.actions.length > 0 ? (
          <section className="flex flex-col gap-2" aria-label={t("diag.howToSolve")}>
            <BlockTitle>{t("diag.howToSolve")}</BlockTitle>
            {resolve ? <span className="leading-normal text-fg-muted">{resolve}</span> : null}
            {d.actions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {d.actions.map((a, i) => (
                  <Button key={`${a.id}-${i}`} emphasis={i === 0 ? "high" : "medium"} onClick={() => onAct(i)}>
                    {actionLabel(i18n, a)}
                  </Button>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
        <div className="mt-auto flex items-center gap-2 border-t border-border-subtle pt-3 text-xs text-fg-muted">
          {d.suppressed ? (
            <>
              <InfoIcon size="sm" />
              <span>{t("diag.isSuppressed")}</span>
            </>
          ) : d.blocking ? (
            <>
              <LockIcon size="sm" />
              <span>{t("diag.cannotIgnore")}</span>
            </>
          ) : (
            <>
              <Button size="sm" emphasis="low" startIcon={<EyeOffIcon size="sm" />} onClick={() => void run(() => backend.suppressDiagnostic(d.instance, d.key, false))}>
                {t("diag.ignoreThis")}
              </Button>
              <Button size="sm" emphasis="low" onClick={() => void run(() => backend.suppressDiagnostic(d.instance, d.key, true))}>
                {t("diag.ignoreType")}
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
