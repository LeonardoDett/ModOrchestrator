import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Toolbar } from "../toolbar";
import { cn } from "../../utils/cn";

export interface ResourcePageProps extends Omit<ComponentPropsWithoutRef<"main">, "title"> {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: ReactNode;
  primaryActions?: ReactNode;
  secondaryActions?: ReactNode;
  toolbar?: ReactNode;
  /** Chips beside the title (`Indicator variant="chip"`): numbers of the page. */
  meta?: ReactNode;
  /**
   * `document` (default): centered column with a large title. `workspace`: a desktop
   * screen that fills the area: one 76 px header line with the title, `meta` and the
   * actions, 28 px side margins, and the content stretching to the bottom.
   */
  layout?: "document" | "workspace";
  /**
   * Workspace only: the content runs edge to edge under a line (a split view
   * of panes, as in the Conflicts board); the header line is 72 px.
   */
  bleed?: boolean;
  children: ReactNode;
}

/**
 * ResourcePage frames one screen: title, actions and content.
 *
 * @example
 * ```tsx
 * <ResourcePage layout="workspace" title="Mods" meta={<Indicator variant="chip" … />}
 *   secondaryActions={…} primaryActions={<Button emphasis="high">Adicionar mods</Button>}>
 *   …
 * </ResourcePage>
 * ```
 */
export function ResourcePage({
  eyebrow,
  title,
  description,
  breadcrumbs,
  primaryActions,
  secondaryActions,
  toolbar,
  meta,
  layout = "document",
  bleed = false,
  children,
  className,
  ...props
}: ResourcePageProps) {
  const actions =
    primaryActions || secondaryActions ? (
      <div data-budget-region="page-actions" className="flex flex-wrap items-center gap-2">
        {secondaryActions}
        {secondaryActions && primaryActions ? <span aria-hidden="true" className="mx-1 h-[22px] w-px bg-border" /> : null}
        {primaryActions}
      </div>
    ) : null;
  if (layout === "workspace" && bleed) {
    return (
      <main className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)} {...props}>
        {breadcrumbs}
        <div className="flex min-h-18 shrink-0 flex-wrap items-center gap-2.5 px-7 py-3">
          <h1 className="mr-2 text-2xl font-semibold text-fg">{title}</h1>
          {meta}
          <span className="flex-1" />
          {actions}
        </div>
        <div className="flex min-h-0 flex-1 flex-col border-t border-border">{children}</div>
      </main>
    );
  }
  if (layout === "workspace") {
    return (
      <main className={cn("flex min-h-0 min-w-0 flex-1 flex-col px-7", className)} {...props}>
        {breadcrumbs}
        <div className="flex min-h-[76px] shrink-0 flex-wrap items-center gap-2.5 py-3">
          <h1 className="mr-2 text-2xl font-semibold text-fg">{title}</h1>
          {meta}
          <span className="flex-1" />
          {actions}
        </div>
        {description ? <p className="-mt-2 mb-3 max-w-3xl text-sm text-fg-muted">{description}</p> : null}
        {toolbar ? <div className="mb-4 overflow-hidden rounded-card border border-border bg-surface"><Toolbar end={toolbar} /></div> : null}
        <div className="flex min-h-0 flex-1 flex-col pb-6">{children}</div>
      </main>
    );
  }
  return (
    <main className={cn("min-w-0", className)} {...props}>
      <div className="mx-auto w-full max-w-container-2xl px-4 py-5 md:px-6">
        <div className="mb-5 space-y-4">
          {breadcrumbs}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              {eyebrow ? <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emphasis-text">{eyebrow}</div> : null}
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">{title}</h1>
                {meta}
              </div>
              {description ? <p className="mt-1 max-w-3xl text-sm text-fg-muted">{description}</p> : null}
            </div>
            {actions}
          </div>
        </div>
        {toolbar ? (
          <div className="mb-4 overflow-hidden rounded-card border border-border bg-surface">
            <Toolbar end={toolbar} />
          </div>
        ) : null}
        {children}
      </div>
    </main>
  );
}
