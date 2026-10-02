import { useEffect, useMemo, useState } from "react";
import { Activity, Copy, FolderOpen, Gamepad2, RefreshCw, Search, X } from "lucide-react";
import {
  Alert,
  Button,
  Inline,
  Input,
  Inspector,
  LogViewer,
  SegmentedControl,
  Spinner,
  Tabs,
  Tag,
  Typography,
  useToast,
  type LogEntry as ViewerEntry,
  type LogLevel as ViewerLevel,
} from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { errorMessage, toUIError } from "../bridge/errors";
import { useLogTail, useOperations } from "../bridge/queries";
import type { LogEntry, LogLevel } from "../bridge/types";
import { ErrorAlert, useCopy } from "../features/feedback/ErrorAlert";
import { OperationDetails } from "../features/operations/OperationDetails";
import { OperationsTable } from "../features/operations/OperationsTable";
import { operationKindLabel } from "../features/operations/operation-labels";
import { useDeploy } from "../features/deploy/DeployContext";
import { HistoryPanel } from "../features/diagnostics/HistoryPanel";
import { ProblemsPanel } from "../features/diagnostics/ProblemsPanel";
import { useI18n } from "../i18n/i18n";
import { useNavigation, type DiagnosticsTab } from "../shell/navigation";
import { HonestEmpty, PageBody } from "./PageBody";

/**
 * Diagnostics (ui/telas/diagnostics.md): Problems and History of the active
 * game (F9), Operations and Log (global, F2). Without an active game the
 * Problems and History tabs explain that they are per game (D023, D054).
 */
export function DiagnosticsPage() {
  const { t } = useI18n();
  const { route, navigate } = useNavigation();
  const { instance } = useDeploy();
  const tab: DiagnosticsTab = route.tab ?? (instance ? "problems" : "operations");

  return (
    <PageBody fill>
      <Tabs.Root value={tab} onValueChange={(value) => navigate({ view: "diagnostics", tab: value as DiagnosticsTab })}>
        <div className="flex min-h-0 flex-1 flex-col">
        <Tabs.List>
          <Tabs.Trigger value="problems">{t("diagnostics.tab.problems")}</Tabs.Trigger>
          <Tabs.Trigger value="history">{t("diagnostics.tab.history")}</Tabs.Trigger>
          <Tabs.Trigger value="operations">{t("diagnostics.tab.operations")}</Tabs.Trigger>
          <Tabs.Trigger value="log">{t("diagnostics.tab.log")}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Panel value="problems" className="flex min-h-0 flex-1 flex-col pt-4">
          {instance ? <ProblemsPanel instance={instance} /> : <HonestEmpty icon={Gamepad2} title="diag.noGameTitle" description="diag.noGameDescription" />}
        </Tabs.Panel>
        <Tabs.Panel value="history" className="flex min-h-0 flex-1 flex-col pt-4">
          {instance ? <HistoryPanel instance={instance} /> : <HonestEmpty icon={Gamepad2} title="diag.noGameTitle" description="history.noGame" />}
        </Tabs.Panel>
        <Tabs.Panel value="operations" className="flex min-h-0 flex-1 flex-col pt-4">
          <OperationsPanel />
        </Tabs.Panel>
        <Tabs.Panel value="log" className="flex min-h-0 flex-1 flex-col pt-4">
          <LogPanel operation={route.operation} />
        </Tabs.Panel>
        </div>
      </Tabs.Root>
    </PageBody>
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
      return <Spinner label={t("common.loading")} />;
    case "unavailable":
      return (
        <Alert.Root variant="info">
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
              className="w-96 shrink-0 overflow-auto rounded-xl border"
              actions={
                <Button variant="ghost" size="icon-sm" aria-label={t("common.close")} onClick={() => setSelected(null)}>
                  <X aria-hidden="true" className="h-4 w-4" />
                </Button>
              }
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
      <div className="min-w-[14rem] flex-1">
        <Input.Root value={text} onChange={(value: string) => setText(value)} fullWidth>
          <Input.Box padding="sm">
            <Search aria-hidden="true" className="h-4 w-4 text-fg-muted" />
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
      <Button size="sm" variant="ghost" startIcon={<RefreshCw aria-hidden="true" className="h-4 w-4" />} onClick={query.reload} disabled={!backend.connected}>
        {t("common.refresh")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        startIcon={<Copy aria-hidden="true" className="h-4 w-4" />}
        disabled={entries.length === 0}
        onClick={() => copy(entries.map(formatEntry).join("\n"))}
      >
        {t("log.copy")}
      </Button>
      <Button size="sm" variant="outline" startIcon={<FolderOpen aria-hidden="true" className="h-4 w-4" />} onClick={openFolder} disabled={!backend.connected}>
        {t("log.openFolder")}
      </Button>
    </Inline>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {query.status === "unavailable" ? (
        <Alert.Root variant="info">
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
