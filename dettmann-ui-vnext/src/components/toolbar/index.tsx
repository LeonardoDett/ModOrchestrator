import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../../utils/cn";

export interface ToolbarProps extends ComponentPropsWithoutRef<"div"> {
  start?: ReactNode;
  center?: ReactNode;
  end?: ReactNode;
}

export function Toolbar({ start, center, end, className, children, ...props }: ToolbarProps) {
  return (
    <div
      data-layer="medium"
      data-budget-region="toolbar"
      className={cn("flex min-h-10 flex-wrap items-center gap-3 border-b border-border bg-structure px-4 py-1.5", className)}
      {...props}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">{start}</div>
      {center ? <div className="flex min-w-[12rem] flex-1 items-center justify-center">{center}</div> : null}
      <div className="flex items-center justify-end gap-2">{end ?? children}</div>
    </div>
  );
}
