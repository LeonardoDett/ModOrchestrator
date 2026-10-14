import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";

const shellVariants = defineRecipe({
  slots: {
    root: "flex bg-canvas",
    side: "shrink-0",
    column: "flex min-w-0 flex-1 flex-col",
    main: "flex min-w-0 flex-1 flex-col",
  },
  variants: {
    /**
     * `sidebar`: a coluna lateral ocupa a altura toda e a barra fica sobre o conteúdo (site).
     * `topbar`: a barra atravessa a janela e a coluna fica abaixo dela (app de desktop);
     * a janela não rola, só o conteúdo.
     */
    layout: {
      sidebar: {
        root: "min-h-screen",
        side: "sticky top-0 h-screen",
      },
      topbar: {
        root: "h-screen flex-col overflow-hidden",
        side: "flex min-h-0",
        column: "min-h-0",
        main: "min-h-0 overflow-auto",
      },
    },
  },
  defaultVariants: { layout: "sidebar" },
});

interface AppShellRootProps extends ComponentPropsWithoutRef<"div"> {
  /** Sidebar column (typically `Sidebar.Root`) */
  sidebar?: ReactNode;
  /** Top bar (typically `Navbar.Root`) */
  navbar?: ReactNode;
  /** `sidebar` (padrão) ou `topbar`, com a barra atravessando a janela. */
  layout?: "sidebar" | "topbar";
  children?: ReactNode;
}

function AppShellRoot({ sidebar, navbar, layout = "sidebar", children, className, ...props }: AppShellRootProps) {
  const s = shellVariants({ layout });
  // A camada de estrutura é declarada pelos próprios Sidebar e Navbar (D-037), não aqui.
  const side = sidebar ? <div className={s.side()}>{sidebar}</div> : null;
  if (layout === "topbar") {
    return (
      <div className={cn(s.root(), className)} {...props}>
        {navbar}
        <div className="flex min-h-0 flex-1">
          {side}
          <div className={s.column()}>
            <div className={s.main()}>{children}</div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={cn(s.root(), className)} {...props}>
      {side}
      <div className={s.column()}>
        {navbar}
        <div className={s.main()}>{children}</div>
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
 *
 * // App de desktop: barra no topo, coluna e conteúdo abaixo, só o conteúdo rola.
 * <AppShell.Root layout="topbar" navbar={<Navbar.Root … />} sidebar={<Sidebar.Root … />}>…</AppShell.Root>
 * ```
 */
export const AppShell = {
  Root: AppShellRoot,
};
