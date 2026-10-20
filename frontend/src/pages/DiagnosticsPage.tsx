import { useEffect, useMemo, useState } from "react";
import { Activity, Gamepad2 } from "lucide-react";
import { CopyIcon, FileArchiveIcon, FolderOpenIcon, RefreshIcon, SearchIcon } from "dettmann-ui/icons";
import {
  Alert,
  Button,
  Inline,
  Input,
  Indicator,
  Inspector,
  LogViewer,
  ResourcePage,
  SegmentedControl,
  Tabs,
  Tag,
  Typography,
  useToast,
  type LogEntry as ViewerEntry,
  type LogLevel as ViewerLevel,
} from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { errorMessage, toUIError } from "../bridge/errors";
import { useLogTail, useOperations, useProblems } from "../bridge/queries";
import type { LogEntry, LogLevel } from "../bridge/types";
import { ErrorAlert, useCopy } from "../features/feedback/ErrorAlert";
import { OperationDetails } from "../features/operations/OperationDetails";
import { OperationsTable } from "../features/operations/OperationsTable";
import { operationKindLabel } from "../features/operations/operation-labels";
import { useDeploy } from "../features/deploy/DeployContext";
import { HistoryPanel } from "../features/diagnostics/HistoryPanel";
import { ProblemsPanel } from "../features/diagnostics/ProblemsPanel";
import { SEVERITY_LOOK } from "../features/diagnostics/diagnostic-labels";
import { useAction } from "../features/games/use-action";
import { useI18n } from "../i18n/i18n";
import { MAIN_ID, useNavigation, type DiagnosticsTab } from "../shell/navigation";
import { HonestEmpty, LoadingState } from "./PageBody";

/**
 * Diagnostics (ui/telas/diagnostics.md): Problems and History of the active
 * game (F9), Operations and Log (global, F2). Without an active game the
 * Problems and History tabs explain that they are per game (D023, D054).
 */
export function DiagnosticsPage() {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const { route, navigate } = useNavigation();
  const { instance } = useDeploy();
  const backend = useBackend();
  const run = useAction();
  const { addToast } = useToast();
  const tab: DiagnosticsTab = route.tab ?? (instance ? "problems" : "operations");
  const problems = useProblems(instance);
  const counts = problems.status === "ready" ? (problems.data?.counts ?? null) : null;
  const total = problems.status === "ready" ? (problems.data?.items.length ?? 0) : 0;
  const [checking, setChecking] = useState(false);

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

  // Board JogoDiagnostico: the counts by severity beside the title.
  const meta = counts ? (
    <>
      {counts.blocking > 0 ? (
        <Indicator variant="chip" intent="danger" icon={SEVERITY_LOOK.blocking.icon} value={i18n.formatNumber(counts.blocking)} label={tp("diag.count.blocking", counts.blocking)} />
      ) : null}
      <Indicator variant="chip" icon={SEVERITY_LOOK.error.icon} value={i18n.formatNumber(counts.errors)} label={tp("diag.count.errors", counts.errors)} />
      <Indicator variant="chip" icon={SEVERITY_LOOK.warning.icon} value={i18n.formatNumber(counts.warnings)} label={tp("diag.count.warnings", counts.warnings)} />
    </>
  ) : null;

  return (
    <ResourcePage
      id={MAIN_ID}
      tabIndex={-1}
      layout="workspace"
      className="focus:outline-none"
      title={t("nav.diagnostics")}
      meta={meta}
      primaryActions={
        <>
          <Button startIcon={<FileArchiveIcon size="sm" />} disabled={!backend.connected} onClick={() => void exportBundle()}>
            {t("diag.exportBundle")}
          </Button>
          {instance ? (
            <Button emphasis="high" startIcon={<RefreshIcon size="sm" />} loading={checking} disabled={!backend.connected} onClick={() => void checkNow()}>
              {t("diag.checkNow")}
            </Button>
          ) : null}
        </>
      }
    >
      <Tabs.Root value={tab} onValueChange={(value) => navigate({ view: "diagnostics", tab: value as DiagnosticsTab })}>
        <div className="flex min-h-0 flex-1 flex-col">
          <Tabs.List>
            <Tabs.Trigger value="problems">
              {t("diagnostics.tab.problems")}
              {instance && problems.status === "ready" ? <span className="ml-2 text-xs text-fg-muted">{i18n.formatNumber(total)}</span> : null}
            </Tabs.Trigger>
            <Tabs.Trigger value="history">{t("diagnostics.tab.history")}</Tabs.Trigger>
            <Tabs.Trigger value="operations">{t("diagnostics.tab.operations")}</Tabs.Trigger>
            <Tabs.Trigger value="log">{t("diagnostics.tab.log")}</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Panel value="problems" className="flex min-h-0 flex-1 flex-col">
            {instance ? <ProblemsPanel instance={instance} /> : <HonestEmpty icon={Gamepad2} title="diag.noGameTitle" description="diag.noGameDescription" />}
          </Tabs.Panel>
          <Tabs.Panel value="history" className="flex min-h-0 flex-1 flex-col pb-6 pt-4">
            {instance ? <HistoryPanel instance={instance} /> : <HonestEmpty icon={Gamepad2} title="diag.noGameTitle" description="history.noGame" />}
          </Tabs.Panel>
          <Tabs.Panel value="operations" className="flex min-h-0 flex-1 flex-col pb-6 pt-4">
            <OperationsPanel />
          </Tabs.Panel>
          <Tabs.Panel value="log" className="flex min-h-0 flex-1 flex-col pb-6 pt-4">
            <LogPanel operation={route.operation} />
          </Tabs.Panel>
        </div>
      </Tabs.Root>
    </ResourcePage>
  );
}

function OperationsPanel() {
  const i18n = useI18n();
  const { t } = i18n;
  const { navigate } = useNavigation();
  const query = useOperations(200);
  const [selected, setSelected] = useState<string | null>(null);

  switch (query.status) {
    case "loading":
      return <LoadingState />;
    case "unavailable":
      return (
        <Alert.Root intent="info">
          <Alert.Description>{t("app.offlineHint")}</Alert.Description>
        </Alert.Root>
      );
    case "error":
      return <ErrorAlert title="operations.loadError" error={query.error} onRetry={query.reload} />;
    case "ready": {
      if (query.data.length === 0) {
        return <HonestEmpty icon={Activity} title="operations.emptyTitle" description="operations.emptyDescription" />;
      }
      const op = query.data.find((candidate) => candidate.id === selected);
      return (
        <div className="flex min-h-0 flex-1 gap-4">
          <OperationsTable operations={query.data} selectedId={selected} onSelect={setSelected} columnPicker className="flex min-h-0 min-w-0 flex-1 flex-col gap-2" />
          {op ? (
            <Inspector
              sticky={false}
              title={operationKindLabel(i18n, op.kind)}
              description={op.id}
              className="w-96 shrink-0 overflow-auto rounded-card border"
              onClose={() => setSelected(null)}
              closeLabel={t("common.close")}
            >
              <OperationDetails operation={op} onViewLog={(id) => navigate({ view: "diagnostics", tab: "log", operation: id })} />
            </Inspector>
          ) : null}
        </div>
      );
    }
  }
}

type MinLevel = "all" | "error" | "warn" | "info";
const LEVELS_AT_OR_ABOVE: Record<MinLevel, LogLevel[]> = {
  all: [],
  error: ["error"],
  warn: ["error", "warn"],
  info: ["error", "warn", "info"],
};
const VIEWER_LEVEL: Record<LogLevel, ViewerLevel> = { error: "error", warn: "warning", info: "info", debug: "debug" };

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function formatEntry(entry: LogEntry): string {
  const extra = entry.fields ? ` ${JSON.stringify(entry.fields)}` : "";
  return [entry.time, entry.level.toUpperCase(), entry.operation, entry.step, entry.message, entry.error].filter(Boolean).join(" ") + extra;
}

function LogPanel({ operation }: { operation?: string }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const { navigate } = useNavigation();
  const { addToast } = useToast();
  const copy = useCopy();
  const [minLevel, setMinLevel] = useState<MinLevel>("all");
  const [text, setText] = useState("");
  const debouncedText = useDebounced(text, 250);
  const query = useLogTail({ levels: LEVELS_AT_OR_ABOVE[minLevel], operation: operation ?? "", text: debouncedText, limit: 1000 });
  const entries = query.status === "ready" ? query.data : [];

  const viewerEntries = useMemo<ViewerEntry[]>(
    () =>
      entries.map((entry, index) => ({
        id: `${index}-${entry.time ?? ""}`,
        level: VIEWER_LEVEL[entry.level] ?? "info",
        timestamp: <time dateTime={entry.time} title={i18n.formatDateTime(entry.time)}>{i18n.formatTime(entry.time)}</time>,
        source: entry.step ?? (entry.operation ? entry.operation.slice(0, 8) : undefined),
        message: entry.message,
        metadata: entry.error,
      })),
    [entries, i18n],
  );

  const openFolder = async () => {
    try {
      await backend.openLogFolder();
    } catch (error) {
      addToast({ title: errorMessage(i18n, toUIError(error)), variant: "danger" });
    }
  };

  const levelOptions: { value: MinLevel; label: string }[] = [
    { value: "all", label: t("log.level.all") },
    { value: "error", label: t("log.level.error") },
    { value: "warn", label: t("log.level.warn") },
    { value: "info", label: t("log.level.info") },
  ];

  const toolbar = (
    <Inline gap="sm" className="w-full">
      <div className="min-w-[14rem] flex-1" data-page-search>
        <Input.Root value={text} onChange={(value: string) => setText(value)} fullWidth>
          <Input.Box padding="sm">
            <SearchIcon size="sm" className="text-fg-muted" />
            <Input.Field aria-label={t("log.search")} placeholder={t("log.search")} />
          </Input.Box>
        </Input.Root>
      </div>
      <SegmentedControl aria-label={t("log.minLevel")} size="sm" options={levelOptions} value={minLevel} onChange={setMinLevel} />
      {operation ? (
        <Tag value={operation} onRemove={() => navigate({ view: "diagnostics", tab: "log" })} removeLabel={t("log.clearOperation")}>
          {t("log.operationFilter", { id: operation.slice(0, 8) })}
        </Tag>
      ) : null}
      <div className="flex-1" />
      <Button size="sm" emphasis="low" startIcon={<RefreshIcon size="sm" />} onClick={query.reload} disabled={!backend.connected}>
        {t("common.refresh")}
      </Button>
      <Button
        size="sm"
        emphasis="low"
        startIcon={<CopyIcon size="sm" />}
        disabled={entries.length === 0}
        onClick={() => copy(entries.map(formatEntry).join("\n"))}
      >
        {t("log.copy")}
      </Button>
      <Button size="sm" startIcon={<FolderOpenIcon size="sm" />} onClick={openFolder} disabled={!backend.connected}>
        {t("log.openFolder")}
      </Button>
    </Inline>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {query.status === "unavailable" ? (
        <Alert.Root intent="info">
          <Alert.Description>{t("app.offlineHint")}</Alert.Description>
        </Alert.Root>
      ) : null}
      {query.status === "error" ? <ErrorAlert title="log.loadError" error={query.error} onRetry={query.reload} /> : null}
      <LogViewer
        className="flex min-h-0 flex-1 flex-col [&_[role=log]]:max-h-none [&_[role=log]]:flex-1"
        entries={viewerEntries}
        showSearch={false}
        toolbar={toolbar}
        dense
        empty={query.status === "loading" ? t("common.loading") : t("log.empty")}
        levelLabels={{ error: t("log.level.error"), warning: t("log.level.warn"), info: t("log.level.info"), debug: t("log.level.debug") }}
      />
      {query.status === "ready" ? (
        <Typography variant="caption" color="muted-fg">
          {tp("log.shown", entries.length)}
        </Typography>
      ) : null}
    </div>
  );
}
