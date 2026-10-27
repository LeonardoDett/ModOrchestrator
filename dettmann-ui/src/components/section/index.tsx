"use client";

import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { createStrictContext } from "../../utils/create-strict-context";

type SectionLayout = "stacked" | "split";
type SectionDensity = "spacious" | "compact";

const [SectionProvider, useSectionContext] = createStrictContext<{ layout: SectionLayout; density: SectionDensity }>(
  "Section"
);

const rootVariants = defineRecipe({
  base: "w-full border-b border-border last-of-type:border-b-0",
  variants: {
    layout: {
      stacked: "flex flex-col",
      split: "grid grid-cols-1 md:grid-cols-3",
    },
    /** `spacious`: formulário de página. `compact`: blocos de uma tela densa (ajustes, detalhe). */
    density: {
      spacious: "gap-6 py-8",
      compact: "gap-3 py-4",
    },
  },
  defaultVariants: {
    layout: "stacked",
    density: "spacious",
  },
});

const headerVariants = defineRecipe({
  base: "flex min-w-0 items-start justify-between gap-4",
  variants: {
    layout: {
      stacked: "",
      split: "md:col-span-1",
    },
  },
  defaultVariants: {
    layout: "stacked",
  },
});

const bodyVariants = defineRecipe({
  base: "min-w-0 flex flex-col",
  variants: {
    layout: {
      stacked: "",
      split: "md:col-span-2",
    },
    density: {
      spacious: "gap-4",
      compact: "gap-2",
    },
  },
  defaultVariants: {
    layout: "stacked",
    density: "spacious",
  },
});

interface SectionRootProps extends ComponentPropsWithoutRef<"section"> {
  children: ReactNode;
  /** `split` places header left and body right from `md` */
  layout?: SectionLayout;
  /** `spacious` (padrão) ou `compact`. */
  density?: SectionDensity;
}

function SectionRoot({ className, layout = "stacked", density = "spacious", children, ...props }: SectionRootProps) {
  return (
    <SectionProvider value={{ layout, density }}>
      <section className={cn(rootVariants({ layout, density }), className)} {...props}>
        {children}
      </section>
    </SectionProvider>
  );
}

interface SectionHeaderProps extends ComponentPropsWithoutRef<"div"> {
  /** Ações à direita do título (por exemplo "Vale para [jogo]"). */
  actions?: ReactNode;
}

function SectionHeader({ className, actions, children, ...props }: SectionHeaderProps) {
  const { layout } = useSectionContext("Header");
  return (
    <div className={cn(headerVariants({ layout }), className)} {...props}>
      <div className="flex min-w-0 flex-col gap-1">{children}</div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

function SectionTitle({ className, children, ...props }: ComponentPropsWithoutRef<"h2">) {
  const { density } = useSectionContext("Title");
  return (
    <h2 className={cn("m-0 font-semibold text-fg", density === "compact" ? "text-sm" : "text-title-sm", className)} {...props}>
      {children}
    </h2>
  );
}

function SectionDescription({ className, children, ...props }: ComponentPropsWithoutRef<"p">) {
  return (
    <p className={cn("m-0 text-sm text-fg-muted", className)} {...props}>
      {children}
    </p>
  );
}

function SectionBody({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  const { layout, density } = useSectionContext("Body");
  return <div className={cn(bodyVariants({ layout, density }), className)} {...props} />;
}

/**
 * Section is a generic content block (title, description, actions, body).
 * Use `layout="split"` for two-column forms and `density="compact"` inside dense screens.
 *
 * @example
 * ```tsx
 * <Section.Root density="compact">
 *   <Section.Header actions={<Button size="sm">Vale para Skyrim SE</Button>}>
 *     <Section.Title>Automação</Section.Title>
 *   </Section.Header>
 *   <Section.Body>
 *     <SettingRow label="Implantar ao ativar um mod" control={<Switch />} />
 *   </Section.Body>
 * </Section.Root>
 * ```
 */
export const Section = {
  Root: SectionRoot,
  Header: SectionHeader,
  Title: SectionTitle,
  Description: SectionDescription,
  Body: SectionBody,
};
