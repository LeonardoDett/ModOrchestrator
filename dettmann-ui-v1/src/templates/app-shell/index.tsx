import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "../../utils/cn";

interface AppShellRootProps extends ComponentPropsWithoutRef<"div"> {
  /** Sidebar column (typically `Sidebar.Root`) */
  sidebar?: ReactNode;
  /** Top bar (typically `Navbar.Root`) */
  navbar?: ReactNode;
  children?: ReactNode;
}

function AppShellRoot({ sidebar, navbar, children, className, ...props }: AppShellRootProps) {
  return (
    <div className={cn("flex min-h-screen bg-page", className)} {...props}>
      {sidebar ? <div className="sticky top-0 h-screen shrink-0">{sidebar}</div> : null}
      <div className="flex min-w-0 flex-1 flex-col">
        {navbar}
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}

/**
 * AppShell is page chrome: sidebar column, navbar, and main content.
 *
 * @example
 * ```tsx
 * <AppShell.Root
 *   sidebar={<Sidebar.Root items={items} currentId="home" />}
 *   navbar={<Navbar.Root brand="App" />}
 * >
 *   <PageContainer title="Home">…</PageContainer>
 * </AppShell.Root>
 * ```
 */
export const AppShell = {
  Root: AppShellRoot,
};
