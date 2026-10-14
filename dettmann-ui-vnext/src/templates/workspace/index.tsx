import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export interface WorkspaceProps {
  sidebar: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Largura da coluna lateral em px. Padrão 232 (design v1). */
  sidebarWidth?: number;
  className?: string;
}

/**
 * Workspace is a fixed two-column grid (structure column + content) that fills the
 * window. Use `AppShell` when the sidebar collapses or the top bar spans the window.
 *
 * @example
 * ```tsx
 * <Workspace sidebar={<Nav />} header={<Toolbar />}>…</Workspace>
 * ```
 */
export function Workspace({ sidebar, header, footer, children, sidebarWidth = 232, className }: WorkspaceProps) {
  return (
    <div
      className={cn("grid h-screen min-h-0 min-w-0 overflow-hidden bg-canvas", className)}
      style={{ gridTemplateColumns: `${sidebarWidth}px minmax(0,1fr)` }}
    >
      <aside data-layer="medium" className="min-h-0 overflow-auto border-r border-border bg-structure">
        {sidebar}
      </aside>
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        {header}
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        {footer}
      </div>
    </div>
  );
}
