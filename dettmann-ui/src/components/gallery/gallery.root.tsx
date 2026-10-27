import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import type { GridVariants } from "../../primitives/grid";

type ColumnCount = NonNullable<GridVariants["columns"]>;

const densityToGap = {
  compact: "gap-2",
  regular: "gap-4",
  comfort: "gap-6",
} as const;

export type GalleryGap = keyof typeof densityToGap;

const rootVariants = defineRecipe({
  base: "grid w-full items-start content-start justify-start",
  variants: {
    gap: densityToGap,
    columns: {
      1: "[grid-template-columns:repeat(1,minmax(16rem,18rem))]",
      2: "[grid-template-columns:repeat(2,minmax(16rem,18rem))]",
      3: "[grid-template-columns:repeat(3,minmax(16rem,18rem))]",
      4: "[grid-template-columns:repeat(4,minmax(16rem,18rem))]",
      5: "[grid-template-columns:repeat(5,minmax(16rem,18rem))]",
      6: "[grid-template-columns:repeat(6,minmax(16rem,18rem))]",
      7: "[grid-template-columns:repeat(7,minmax(16rem,18rem))]",
      8: "[grid-template-columns:repeat(8,minmax(16rem,18rem))]",
      9: "[grid-template-columns:repeat(9,minmax(16rem,18rem))]",
      10: "[grid-template-columns:repeat(10,minmax(16rem,18rem))]",
      11: "[grid-template-columns:repeat(11,minmax(16rem,18rem))]",
      12: "[grid-template-columns:repeat(12,minmax(16rem,18rem))]",
    },
    sm: {
      1: "sm:[grid-template-columns:repeat(1,minmax(16rem,18rem))]",
      2: "sm:[grid-template-columns:repeat(2,minmax(16rem,18rem))]",
      3: "sm:[grid-template-columns:repeat(3,minmax(16rem,18rem))]",
      4: "sm:[grid-template-columns:repeat(4,minmax(16rem,18rem))]",
      5: "sm:[grid-template-columns:repeat(5,minmax(16rem,18rem))]",
      6: "sm:[grid-template-columns:repeat(6,minmax(16rem,18rem))]",
      7: "sm:[grid-template-columns:repeat(7,minmax(16rem,18rem))]",
      8: "sm:[grid-template-columns:repeat(8,minmax(16rem,18rem))]",
      9: "sm:[grid-template-columns:repeat(9,minmax(16rem,18rem))]",
      10: "sm:[grid-template-columns:repeat(10,minmax(16rem,18rem))]",
      11: "sm:[grid-template-columns:repeat(11,minmax(16rem,18rem))]",
      12: "sm:[grid-template-columns:repeat(12,minmax(16rem,18rem))]",
    },
    md: {
      1: "md:[grid-template-columns:repeat(1,minmax(16rem,18rem))]",
      2: "md:[grid-template-columns:repeat(2,minmax(16rem,18rem))]",
      3: "md:[grid-template-columns:repeat(3,minmax(16rem,18rem))]",
      4: "md:[grid-template-columns:repeat(4,minmax(16rem,18rem))]",
      5: "md:[grid-template-columns:repeat(5,minmax(16rem,18rem))]",
      6: "md:[grid-template-columns:repeat(6,minmax(16rem,18rem))]",
      7: "md:[grid-template-columns:repeat(7,minmax(16rem,18rem))]",
      8: "md:[grid-template-columns:repeat(8,minmax(16rem,18rem))]",
      9: "md:[grid-template-columns:repeat(9,minmax(16rem,18rem))]",
      10: "md:[grid-template-columns:repeat(10,minmax(16rem,18rem))]",
      11: "md:[grid-template-columns:repeat(11,minmax(16rem,18rem))]",
      12: "md:[grid-template-columns:repeat(12,minmax(16rem,18rem))]",
    },
    lg: {
      1: "lg:[grid-template-columns:repeat(1,minmax(16rem,18rem))]",
      2: "lg:[grid-template-columns:repeat(2,minmax(16rem,18rem))]",
      3: "lg:[grid-template-columns:repeat(3,minmax(16rem,18rem))]",
      4: "lg:[grid-template-columns:repeat(4,minmax(16rem,18rem))]",
      5: "lg:[grid-template-columns:repeat(5,minmax(16rem,18rem))]",
      6: "lg:[grid-template-columns:repeat(6,minmax(16rem,18rem))]",
      7: "lg:[grid-template-columns:repeat(7,minmax(16rem,18rem))]",
      8: "lg:[grid-template-columns:repeat(8,minmax(16rem,18rem))]",
      9: "lg:[grid-template-columns:repeat(9,minmax(16rem,18rem))]",
      10: "lg:[grid-template-columns:repeat(10,minmax(16rem,18rem))]",
      11: "lg:[grid-template-columns:repeat(11,minmax(16rem,18rem))]",
      12: "lg:[grid-template-columns:repeat(12,minmax(16rem,18rem))]",
    },
    xl: {
      1: "xl:[grid-template-columns:repeat(1,minmax(16rem,18rem))]",
      2: "xl:[grid-template-columns:repeat(2,minmax(16rem,18rem))]",
      3: "xl:[grid-template-columns:repeat(3,minmax(16rem,18rem))]",
      4: "xl:[grid-template-columns:repeat(4,minmax(16rem,18rem))]",
      5: "xl:[grid-template-columns:repeat(5,minmax(16rem,18rem))]",
      6: "xl:[grid-template-columns:repeat(6,minmax(16rem,18rem))]",
      7: "xl:[grid-template-columns:repeat(7,minmax(16rem,18rem))]",
      8: "xl:[grid-template-columns:repeat(8,minmax(16rem,18rem))]",
      9: "xl:[grid-template-columns:repeat(9,minmax(16rem,18rem))]",
      10: "xl:[grid-template-columns:repeat(10,minmax(16rem,18rem))]",
      11: "xl:[grid-template-columns:repeat(11,minmax(16rem,18rem))]",
      12: "xl:[grid-template-columns:repeat(12,minmax(16rem,18rem))]",
    },
  },
  defaultVariants: {
    gap: "regular",
  },
});

const autoColumns =
  "[grid-template-columns:repeat(auto-fill,minmax(16rem,18rem))] min-[90rem]:[grid-template-columns:repeat(5,minmax(16rem,18rem))]";

interface GalleryRootProps extends ComponentPropsWithoutRef<"div"> {
  children?: ReactNode;
  /**
   * Exact column count. Omit it to fit as many cells as possible, up to 5.
   * Each cell is at most 18rem and the row is packed to the top-left.
   */
  columns?: ColumnCount;
  /** Columns from `sm` and up */
  sm?: ColumnCount;
  /** Columns from `md` and up */
  md?: ColumnCount;
  /** Columns from `lg` and up */
  lg?: ColumnCount;
  /** Columns from `xl` and up */
  xl?: ColumnCount;
  /** Preset gap between cells. Defaults to regular. */
  gap?: GalleryGap;
}

/**
 * Gallery.Root fills the width of its parent. Items align to the top-left.
 * A cell is at most 18rem, so a full-width page does not stretch the cards.
 * Without `columns`, the grid places as many cells as fit, and never more than 5.
 *
 * @example
 * ```tsx
 * <Gallery.Root gap="regular">
 *   <Gallery.List>{items}</Gallery.List>
 *   <Gallery.Add onClick={onAdd} />
 * </Gallery.Root>
 * ```
 */
export function GalleryRoot({
  columns,
  sm,
  md,
  lg,
  xl,
  gap = "regular",
  className,
  ...props
}: GalleryRootProps) {
  const explicit = columns != null || sm != null || md != null || lg != null || xl != null;

  return (
    <div
      className={cn(
        rootVariants({
          gap,
          columns: explicit ? (columns ?? 1) : undefined,
          sm,
          md,
          lg,
          xl,
        }),
        explicit ? null : autoColumns,
        className
      )}
      {...props}
    />
  );
}
