"use client";

import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Typography } from "../../primitives/typography";
import { createStrictContext } from "../../utils/create-strict-context";

type SectionLayout = "stacked" | "split";

const [SectionProvider, useSectionContext] = createStrictContext<{ layout: SectionLayout }>(
  "Section"
);

const rootVariants = defineRecipe({
  base: "w-full gap-6 border-b border-border py-8 last-of-type:border-b-0",
  variants: {
    layout: {
      stacked: "flex flex-col",
      split: "grid grid-cols-1 md:grid-cols-3",
    },
  },
  defaultVariants: {
    layout: "stacked",
  },
});

const headerVariants = defineRecipe({
  base: "flex min-w-0 flex-col gap-1",
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
  base: "min-w-0 flex flex-col gap-4",
  variants: {
    layout: {
      stacked: "",
      split: "md:col-span-2",
    },
  },
  defaultVariants: {
    layout: "stacked",
  },
});

interface SectionRootProps extends ComponentPropsWithoutRef<"section"> {
  children: ReactNode;
  /** `split` places header left and body right from `md` */
  layout?: SectionLayout;
}

function SectionRoot({
  className,
  layout = "stacked",
  children,
  ...props
}: SectionRootProps) {
  return (
    <SectionProvider value={{ layout }}>
      <section className={cn(rootVariants({ layout }), className)} {...props}>
        {children}
      </section>
    </SectionProvider>
  );
}

function SectionHeader({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  const { layout } = useSectionContext("Header");
  return <div className={cn(headerVariants({ layout }), className)} {...props} />;
}

function SectionTitle({ className, children, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div className={className} {...props}>
      <Typography variant="heading-5" color="fg" className="font-semibold">
        {children}
      </Typography>
    </div>
  );
}

function SectionDescription({ className, children, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div className={className} {...props}>
      <Typography variant="body-sm" color="muted-fg">
        {children}
      </Typography>
    </div>
  );
}

function SectionBody({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  const { layout } = useSectionContext("Body");
  return <div className={cn(bodyVariants({ layout }), className)} {...props} />;
}

/**
 * Section is a generic content block (title, description, body).
 * Use `layout="split"` for two-column forms (header left, fields right).
 *
 * @example
 * ```tsx
 * <Section.Root layout="split">
 *   <Section.Header>
 *     <Section.Title>Name</Section.Title>
 *     <Section.Description>Shown on your profile.</Section.Description>
 *   </Section.Header>
 *   <Section.Body>
 *     <Input.Root>…</Input.Root>
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
