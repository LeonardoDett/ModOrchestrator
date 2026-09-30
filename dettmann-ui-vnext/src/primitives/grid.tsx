import { type ElementType } from "react";
import { defineRecipe, type VariantProps } from "../core/recipe";
import { cn } from "../utils/cn";
import type { PolymorphicComponentProps } from "../utils/polymorphic";

const columnCount = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
  7: "grid-cols-7",
  8: "grid-cols-8",
  9: "grid-cols-9",
  10: "grid-cols-10",
  11: "grid-cols-11",
  12: "grid-cols-12",
} as const;

const gridVariants = defineRecipe({
  base: "grid w-full",
  variants: {
    /** Columns from the smallest breakpoint */
    columns: columnCount,
    /** Columns from `sm` and up */
    sm: {
      1: "sm:grid-cols-1",
      2: "sm:grid-cols-2",
      3: "sm:grid-cols-3",
      4: "sm:grid-cols-4",
      5: "sm:grid-cols-5",
      6: "sm:grid-cols-6",
      7: "sm:grid-cols-7",
      8: "sm:grid-cols-8",
      9: "sm:grid-cols-9",
      10: "sm:grid-cols-10",
      11: "sm:grid-cols-11",
      12: "sm:grid-cols-12",
    },
    /** Columns from `md` and up */
    md: {
      1: "md:grid-cols-1",
      2: "md:grid-cols-2",
      3: "md:grid-cols-3",
      4: "md:grid-cols-4",
      5: "md:grid-cols-5",
      6: "md:grid-cols-6",
      7: "md:grid-cols-7",
      8: "md:grid-cols-8",
      9: "md:grid-cols-9",
      10: "md:grid-cols-10",
      11: "md:grid-cols-11",
      12: "md:grid-cols-12",
    },
    /** Columns from `lg` and up */
    lg: {
      1: "lg:grid-cols-1",
      2: "lg:grid-cols-2",
      3: "lg:grid-cols-3",
      4: "lg:grid-cols-4",
      5: "lg:grid-cols-5",
      6: "lg:grid-cols-6",
      7: "lg:grid-cols-7",
      8: "lg:grid-cols-8",
      9: "lg:grid-cols-9",
      10: "lg:grid-cols-10",
      11: "lg:grid-cols-11",
      12: "lg:grid-cols-12",
    },
    /** Columns from `xl` and up */
    xl: {
      1: "xl:grid-cols-1",
      2: "xl:grid-cols-2",
      3: "xl:grid-cols-3",
      4: "xl:grid-cols-4",
      5: "xl:grid-cols-5",
      6: "xl:grid-cols-6",
      7: "xl:grid-cols-7",
      8: "xl:grid-cols-8",
      9: "xl:grid-cols-9",
      10: "xl:grid-cols-10",
      11: "xl:grid-cols-11",
      12: "xl:grid-cols-12",
    },
    /** Gap between cells (spacing tokens) */
    gap: {
      none: "gap-0",
      xs: "gap-1",
      sm: "gap-2",
      md: "gap-4",
      lg: "gap-6",
      xl: "gap-8",
    },
  },
  defaultVariants: {
    columns: 1,
    gap: "md",
  },
});

type GridVariants = VariantProps<typeof gridVariants>;

type GridOwnProps = GridVariants & {
  /** Additional CSS classes */
  className?: string;
};

type GridProps<E extends ElementType = "div"> = PolymorphicComponentProps<E, GridOwnProps>;

/**
 * Grid is a layout atom for CSS grid. No visual opinion — columns, breakpoints, and gap only.
 *
 * @example
 * ```tsx
 * <Grid columns={1} sm={2} md={4} gap="md">
 *   <Box>A</Box>
 *   <Box>B</Box>
 * </Grid>
 * ```
 */
export function Grid<E extends ElementType = "div">({
  as,
  className,
  columns,
  sm,
  md,
  lg,
  xl,
  gap,
  ...props
}: GridProps<E>) {
  const Component = as || "div";
  return (
    <Component
      className={cn(gridVariants({ columns, sm, md, lg, xl, gap }), className)}
      {...props}
    />
  );
}

export type { GridVariants, GridProps };
