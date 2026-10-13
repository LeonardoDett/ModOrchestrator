"use client";

import { useMemo, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Terminal } from "lucide-react";
import { CircleAlertIcon } from "../../icons/glyphs/circle-alert";
import { CircleCheckIcon } from "../../icons/glyphs/circle-check";
import { InfoIcon } from "../../icons/glyphs/info";
import { SearchIcon } from "../../icons/glyphs/search";
import { TriangleAlertIcon } from "../../icons/glyphs/triangle-alert";
import { cn } from "../../utils/cn";
import { Badge } from "../badge";
import { Input } from "../input";

export type LogLevel = "trace" | "debug" | "info" | "success" | "warning" | "error";

export interface LogEntry {
  id: string;
  message: ReactNode;
  level?: LogLevel;
  timestamp?: ReactNode;
  source?: ReactNode;
  metadata?: ReactNode;
}

export interface LogViewerProps extends Omit<ComponentPropsWithoutRef<"div">, "onSelect"> {
  entries: readonly LogEntry[];
  query?: string;
  onQueryChange?: (query: string) => void;
  levels?: readonly LogLevel[];
  onSelect?: (entry: LogEntry) => void;
  empty?: ReactNode;
  showSearch?: boolean;
  dense?: boolean;
  /** Accessible label and placeholder of the search field (localize it). */
  searchLabel?: string;
  /** Visible label per level; defaults to the level id (localize it). */
  levelLabels?: Partial<Record<LogLevel, string>>;
  /** Extra controls rendered next to the search field (level filter, actions). */
  toolbar?: ReactNode;
}

const levelIntent: Record<LogLevel, "neutral" | "info" | "success" | "warning" | "danger"> = {
  trace: "neutral",
  debug: "neutral",
  info: "info",
  success: "success",
  warning: "warning",
  error: "danger",
};

const levelIcon: Record<LogLevel, ReactNode> = {
  trace: <Terminal aria-hidden="true" className="h-3.5 w-3.5" />,
  debug: <Terminal aria-hidden="true" className="h-3.5 w-3.5" />,
  info: <InfoIcon size="sm" className="h-3.5! w-3.5!" />,
  success: <CircleCheckIcon size="sm" className="h-3.5! w-3.5!" />,
  warning: <TriangleAlertIcon size="sm" className="h-3.5! w-3.5!" />,
  error: <CircleAlertIcon size="sm" className="h-3.5! w-3.5!" />,
};

export function LogViewer({
  entries,
  query: controlledQuery,
  onQueryChange,
  levels,
  onSelect,
  empty = "No log entries",
  showSearch = true,
  dense = false,
  searchLabel = "Search logs",
  levelLabels,
  toolbar,
  className,
  ...props
}: LogViewerProps) {
  const [internalQuery, setInternalQuery] = useState("");
  const query = controlledQuery ?? internalQuery;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (levels?.length && !levels.includes(entry.level ?? "info")) return false;
      if (!normalized) return true;
      return [entry.message, entry.source, entry.timestamp]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [entries, levels, query]);

  const setQuery = (next: string) => {
    setInternalQuery(next);
    onQueryChange?.(next);
  };

  return (
    <div
      className={cn(
        "min-h-0 overflow-hidden rounded-card border border-border bg-sunken",
        className,
      )}
      {...props}
    >
      {showSearch || toolbar ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface p-2">
          {showSearch ? (
            <div className="min-w-[12rem] flex-1">
              <Input.Root value={query} onChange={(value: string) => setQuery(value)} fullWidth>
                <Input.Box padding="sm">
                  <SearchIcon size="sm" className="text-fg-muted" />
                  <Input.Field aria-label={searchLabel} placeholder={searchLabel} />
                </Input.Box>
              </Input.Root>
            </div>
          ) : null}
          {toolbar}
        </div>
      ) : null}

      <div role="log" aria-live="polite" className="max-h-[40rem] overflow-auto font-mono text-xs">
        {filtered.length ? (
          filtered.map((entry) => {
            const level = entry.level ?? "info";
            const interactive = Boolean(onSelect);
            const content = (
              <>
                <span className="w-20 shrink-0 truncate text-fg-subtle">{entry.timestamp}</span>
                <span className="w-20 shrink-0">
                  <Badge size="sm" intent={levelIntent[level]}>
                    <span className="mr-1 inline-flex align-middle">{levelIcon[level]}</span>
                    {levelLabels?.[level] ?? level}
                  </Badge>
                </span>
                {entry.source ? (
                  <span className="w-28 shrink-0 truncate text-fg-muted">{entry.source}</span>
                ) : null}
                <span className="min-w-0 flex-1 break-words text-fg">{entry.message}</span>
                {entry.metadata ? (
                  <span className="shrink-0 text-fg-subtle">{entry.metadata}</span>
                ) : null}
              </>
            );

            if (!interactive) {
              return (
                <div
                  key={entry.id}
                  className={cn(
                    "flex items-start gap-3 border-b border-border-subtle px-3",
                    dense ? "min-h-8 py-1" : "min-h-10 py-2",
                    level === "error" && "bg-danger-subtle/40",
                  )}
                >
                  {content}
                </div>
              );
            }

            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelect?.(entry)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-border-subtle px-3 text-left",
                  "motion-transition hover:bg-state-hover focus-ring-inset",
                  dense ? "min-h-8 py-1" : "min-h-10 py-2",
                  level === "error" && "bg-danger-subtle/40",
                )}
              >
                {content}
              </button>
            );
          })
        ) : (
          <div className="p-10 text-center font-sans text-sm text-fg-muted">{empty}</div>
        )}
      </div>
    </div>
  );
}
