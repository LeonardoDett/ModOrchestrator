import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, EyeOff, FileArchive, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  Inline,
  Input,
  Inspector,
  Spinner,
  Stack,
  Typography,
  useToast,
  type DataTableColumn,
} from "dettmann-ui";
import { useSettings } from "../../app/settings-context";
import { useBackend } from "../../bridge/backend-context";
import { useProblems } from "../../bridge/queries";
import type { Diagnostic } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { HonestEmpty } from "../../pages/PageBody";
import { useNavigation } from "../../shell/navigation";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import {
  MODULES,
  SEVERITY_LOOK,
  actionLabel,
  blocksText,
  diagnosticImpact,
  diagnosticTitle,
  evidenceText,
  moduleLabel,
  severityLabel,
  shownSeverity,
} from "./diagnostic-labels";
import { useDiagnosticAction } from "./use-diagnostic-action";

/** Subject of a diagnostic for the list: the mod, plugin or path it is about. */
function subjectOf(d: Diagnostic): string {
  const p = d.params;
  return p.mod ?? p.a ?? p.path ?? p.game ?? "";
}

/**
 * Diagnostics › Problems (ui/telas/diagnostics.md §2): the current problems
 * of the active game grouped by severity, filters by module and search, an
 * Inspector with evidence, impact and actions, "Ignorar este" / "Não
 * mostrar este tipo" (never for blocking ones), the suppressed list with
 * Reactivate, "Check now" and the support bundle. Everything is read from
 * the backend; executing an action rereads the list.
 */
export function ProblemsPanel({ instance }: { instance: string }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const { addToast } = useToast();
  const { density } = useSettings();
  const { route } = useNavigation();
  const act = useDiagnosticAction();
  const problems = useProblems(instance);
  const [module, setModule] = useState("all");
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string | null>(route.diagnostic ?? null);
  const [showSuppressed, setShowSuppressed] = useState(false);
  const [checking, setChecking] = useState(false);

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
  const items = data?.items ?? [];
  const visible = useMemo(() => {
    const q = text.trim().toLowerCase();
    return items.filter((d) => {
      if (module !== "all" && d.module !== module) return false;
      if (!q) return true;
      return [diagnosticTitle(i18n, d), subjectOf(d), d.code].some((s) => s.toLowerCase().includes(q));
    });
  }, [items, module, text, i18n]);
  const current =
    items.find((d) => d.key === selected) ?? items.find((d) => d.code === selected) ?? data?.suppressed.find((d) => d.key === selected) ?? null;

  const columns = useMemo<DataTableColumn<Diagnostic>[]>(
    () => [
      {
        id: "severity",
        label: t("diag.severity.error"),
        header: <span className="sr-only">{t("diag.severity.error")}</span>,
        width: 140,
        cell: (d) => {
          const s = shownSeverity(d);
          const Icon = SEVERITY_LOOK[s].icon;
          return (
            <Inline gap="xs">
              <Icon aria-hidden="true" className={`h-4 w-4 ${SEVERITY_LOOK[s].className}`} />
              <span>{severityLabel(i18n, s)}</span>
            </Inline>
          );
        },
      },
      {
        id: "title",
        label: t("diag.summary"),
        grow: true,
        width: 420,
        cell: (d) => (
          <Inline gap="xs" wrap={false} className="min-w-0">
            <span className="truncate">{diagnosticTitle(i18n, d)}</span>
            {d.new ? (
              <Badge tone="primary" size="sm">
                {t("diag.new")}
              </Badge>
            ) : null}
          </Inline>
        ),
      },
      { id: "module", label: t("diag.moduleFilter"), width: 130, cell: (d) => moduleLabel(i18n, d.module) },
    ],
    [i18n, t],
  );

  const checkNow = async () => {
    setChecking(true);
    await run(() => backend.runHealthChecks(instance), { success: "diag.checkNowDone" });
    setChecking(false);
  };
  const exportBundle = async () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const result = await run(() => backend.exportSupportBundle(t("diag.exportBundleTitle"), `mod-orchestrator-diagnostics-${stamp}.zip`));
    if (result.ok && result.value) addToast({ title: t("diag.exportBundleDone", { path: result.value }), variant: "success" });
  };

  const moduleOptions = [{ value: "all", label: t("diag.module.all") }, ...MODULES.map((m) => ({ value: m, label: moduleLabel(i18n, m) }))];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Inline gap="sm" className="w-full">
        <div className="min-w-[14rem] flex-1">
          <Input.Root value={text} onChange={(value: string) => setText(value)} fullWidth>
            <Input.Box padding="sm">
              <Search aria-hidden="true" className="h-4 w-4 text-fg-muted" />
              <Input.Field aria-label={t("diag.search")} placeholder={t("diag.search")} />
            </Input.Box>
          </Input.Root>
        </div>
        <div className="w-48">
          <Input.Root value={module} onChange={(value: string) => setModule(value)} fullWidth>
            <Input.Box padding="sm">
              <Input.Select aria-label={t("diag.moduleFilter")} options={moduleOptions} />
            </Input.Box>
          </Input.Root>
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="outline" startIcon={checking ? <Spinner size="sm" label={t("common.loading")} /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />} disabled={checking || !backend.connected} onClick={() => void checkNow()}>
          {t("diag.checkNow")}
        </Button>
        <Button size="sm" variant="outline" startIcon={<FileArchive aria-hidden="true" className="h-4 w-4" />} disabled={!backend.connected} onClick={() => void exportBundle()}>
          {t("diag.exportBundle")}
        </Button>
      </Inline>

      {problems.status === "unavailable" ? (
        <Alert.Root variant="info">
          <Alert.Description>{t("app.offlineHint")}</Alert.Description>
        </Alert.Root>
      ) : null}
      {problems.status === "error" ? <ErrorAlert title="diag.loadError" error={problems.error} onRetry={problems.reload} /> : null}
      {problems.status === "loading" ? <Spinner label={t("common.loading")} /> : null}
      {data?.partial ? (
        <Alert.Root variant="warning">
          <Alert.Description>{t("diag.partial")}</Alert.Description>
        </Alert.Root>
      ) : null}

      {data && items.length === 0 ? <HonestEmpty icon={ShieldCheck} title="diag.emptyTitle" description="diag.emptyDescription" /> : null}

      {data && items.length > 0 ? (
        <div className="flex min-h-0 flex-1 gap-4">
          <DataTable
            aria-label={t("diagnostics.tab.problems")}
            className="min-h-0 min-w-0 flex-1"
            columns={columns}
            rows={visible}
            getRowId={(d) => d.key}
            getGroup={(d) => severityLabel(i18n, shownSeverity(d))}
            density={density}
            selectionMode="single"
            selectedIds={current ? new Set([current.key]) : new Set()}
            onSelectedIdsChange={(ids) => setSelected(ids.values().next().value ?? null)}
            empty={<div className="p-6 text-sm text-fg-muted">{t("diag.noMatch")}</div>}
            labels={{ resizeColumn: t("table.resizeColumn"), loading: t("common.loading") }}
          />
          {current ? (
            <Inspector
              sticky={false}
              title={diagnosticTitle(i18n, current)}
              description={`${severityLabel(i18n, shownSeverity(current))} · ${moduleLabel(i18n, current.module)}`}
              className="w-[26rem] shrink-0 overflow-auto rounded-xl border"
              actions={
                <Button variant="ghost" size="icon-sm" aria-label={t("common.close")} onClick={() => setSelected(null)}>
                  <X aria-hidden="true" className="h-4 w-4" />
                </Button>
              }
            >
              <DiagnosticDetail d={current} onAct={(i) => void act(current, i)} />
            </Inspector>
          ) : null}
        </div>
      ) : null}

      {data && data.suppressed.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface">
          <Button
            variant="ghost"
            className="w-full justify-start"
            aria-expanded={showSuppressed}
            startIcon={showSuppressed ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronRight aria-hidden="true" className="h-4 w-4" />}
            onClick={() => setShowSuppressed((v) => !v)}
          >
            {tp("diag.suppressed", data.suppressed.length)}
          </Button>
          {showSuppressed ? (
            <ul className="divide-y divide-border border-t border-border">
              {data.suppressed.map((d) => (
                <li key={d.key} className="flex items-center gap-3 px-4 py-2">
                  <EyeOff aria-hidden="true" className="h-4 w-4 shrink-0 text-fg-muted" />
                  <Typography variant="body-sm" className="min-w-0 flex-1 truncate">
                    {diagnosticTitle(i18n, d)}
                  </Typography>
                  <Button size="sm" variant="ghost" onClick={() => void run(() => backend.unsuppressDiagnostic(d.key, ""))}>
                    {t("diag.reactivate")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void run(() => backend.unsuppressDiagnostic("", d.code))}>
                    {t("diag.reactivateType")}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/** Inspector content: summary, evidence, impact, actions and suppression. */
export function DiagnosticDetail({ d, onAct }: { d: Diagnostic; onAct: (index: number) => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const impact = diagnosticImpact(i18n, d);
  return (
    <Stack gap="md">
      {d.firstSeen ? (
        <Typography variant="caption" color="muted-fg">
          {t("diag.firstSeen", { when: i18n.formatDateTime(d.firstSeen) })}
        </Typography>
      ) : null}
      {d.blocks.length > 0 ? (
        <Typography variant="body-sm">{t("diag.blocks", { operations: blocksText(i18n, d.blocks) })}</Typography>
      ) : null}
      <Stack as="section" gap="xs" aria-label={t("diag.evidence")}>
        <Typography variant="label">{t("diag.evidence")}</Typography>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {d.evidence.map((e, i) => (
            <li key={`${e.kind}-${i}`}>{evidenceText(i18n, e)}</li>
          ))}
        </ul>
      </Stack>
      {impact ? (
        <Stack as="section" gap="xs">
          <Typography variant="label">{t("diag.impact")}</Typography>
          <Typography variant="body-sm">{impact}</Typography>
        </Stack>
      ) : null}
      {d.actions.length > 0 ? (
        <Stack as="section" gap="xs" aria-label={t("diag.actions")}>
          <Typography variant="label">{t("diag.actions")}</Typography>
          <Inline gap="xs">
            {d.actions.map((a, i) => (
              <Button key={`${a.id}-${i}`} size="sm" variant={i === 0 ? "primary" : "outline"} onClick={() => onAct(i)}>
                {actionLabel(i18n, a)}
              </Button>
            ))}
          </Inline>
        </Stack>
      ) : null}
      {d.suppressed ? null : d.blocking ? (
        <Typography variant="caption" color="muted-fg">
          {t("diag.cannotIgnore")}
        </Typography>
      ) : (
        <Inline gap="xs">
          <Button size="sm" variant="ghost" startIcon={<EyeOff aria-hidden="true" className="h-4 w-4" />} onClick={() => void run(() => backend.suppressDiagnostic(d.instance, d.key, false))}>
            {t("diag.ignoreThis")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void run(() => backend.suppressDiagnostic(d.instance, d.key, true))}>
            {t("diag.ignoreType")}
          </Button>
        </Inline>
      )}
    </Stack>
  );
}
