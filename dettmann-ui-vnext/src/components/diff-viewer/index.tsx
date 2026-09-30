import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../../utils/cn";

export type DiffLineKind = "same" | "added" | "removed" | "changed";

export interface DiffLine {
  id: string;
  kind: DiffLineKind;
  left?: { lineNumber?: number; text?: ReactNode };
  right?: { lineNumber?: number; text?: ReactNode };
}

export interface DiffViewerProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  lines: readonly DiffLine[];
  mode?: "split" | "unified";
  leftTitle?: ReactNode;
  rightTitle?: ReactNode;
  empty?: ReactNode;
}

const kindClass: Record<DiffLineKind, string> = {
  same: "",
  added: "bg-success-subtle/55",
  removed: "bg-danger-subtle/55",
  changed: "bg-warning-subtle/60",
};

function Line({
  lineNumber,
  text,
  className,
}: {
  lineNumber?: number;
  text?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-h-7 grid-cols-[3.5rem_minmax(0,1fr)]", className)}>
      <span className="border-r border-border-subtle px-2 py-1 text-right select-none text-fg-subtle">
        {lineNumber ?? ""}
      </span>
      <code className="whitespace-pre-wrap break-words px-3 py-1 text-xs text-fg">{text}</code>
    </div>
  );
}

export function DiffViewer({
  lines,
  mode = "split",
  leftTitle = "Before",
  rightTitle = "After",
  empty = "No differences",
  className,
  ...props
}: DiffViewerProps) {
  if (!lines.length) {
    return (
      <div
        className={cn("rounded-xl border border-border bg-surface p-10 text-center text-sm text-fg-muted", className)}
        {...props}
      >
        {empty}
      </div>
    );
  }

  if (mode === "unified") {
    return (
      <div className={cn("overflow-auto rounded-xl border border-border bg-sunken", className)} {...props}>
        <div className="sticky top-0 z-10 border-b border-border bg-surface px-3 py-2 text-xs font-semibold text-fg">
          {rightTitle}
        </div>
        <div className="font-mono">
          {lines.map((line) => (
            <div key={line.id} className={cn("grid grid-cols-[3.5rem_4rem_minmax(0,1fr)]", kindClass[line.kind])}>
              <span className="border-r border-border-subtle px-2 py-1 text-right select-none text-fg-subtle">{line.left?.lineNumber ?? ""}</span>
              <span className="border-r border-border-subtle px-2 py-1 text-center text-fg-subtle">
                {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : line.kind === "changed" ? "±" : ""}
              </span>
              <code className="whitespace-pre-wrap break-words px-3 py-1 text-xs text-fg">
                {line.right?.text ?? line.left?.text}
              </code>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("overflow-auto rounded-xl border border-border bg-sunken", className)} {...props}>
      <div className="grid grid-cols-2 border-b border-border bg-surface text-xs font-semibold text-fg">
        <div className="border-r border-border px-3 py-2">{leftTitle}</div>
        <div className="px-3 py-2">{rightTitle}</div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-border font-mono">
        <div>
          {lines.map((line) => (
            <Line key={`${line.id}-left`} lineNumber={line.left?.lineNumber} text={line.left?.text} className={kindClass[line.kind]} />
          ))}
        </div>
        <div>
          {lines.map((line) => (
            <Line key={`${line.id}-right`} lineNumber={line.right?.lineNumber} text={line.right?.text} className={kindClass[line.kind]} />
          ))}
        </div>
      </div>
    </div>
  );
}
