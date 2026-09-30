import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe, type VariantProps } from "../core/recipe";
import { cn } from "../utils/cn";

const dividerVariants = defineRecipe({
  base: "shrink-0 bg-border",
  variants: {
    /** Orientation of the divider */
    orientation: {
      horizontal: "h-px w-full",
      vertical: "h-full w-px",
    },
    /** Spacing around the divider */
    spacing: {
      none: "",
      xs: "",
      sm: "",
      md: "",
      lg: "",
    },
    /** Color variant */
    color: {
      border: "bg-border",
      muted: "bg-muted",
      primary: "bg-primary",
      secondary: "bg-secondary",
    },
  },
  compoundVariants: [
    { orientation: "horizontal", spacing: "xs", class: "my-1" },
    { orientation: "horizontal", spacing: "sm", class: "my-2" },
    { orientation: "horizontal", spacing: "md", class: "my-4" },
    { orientation: "horizontal", spacing: "lg", class: "my-6" },
    { orientation: "vertical", spacing: "xs", class: "mx-1" },
    { orientation: "vertical", spacing: "sm", class: "mx-2" },
    { orientation: "vertical", spacing: "md", class: "mx-4" },
    { orientation: "vertical", spacing: "lg", class: "mx-6" },
  ],
  defaultVariants: {
    orientation: "horizontal",
    spacing: "none",
    color: "border",
  },
});

type DividerVariants = VariantProps<typeof dividerVariants>;

type DividerProps = Omit<ComponentPropsWithoutRef<"div">, "color"> &
  DividerVariants & {
    /** Decorative dividers should be hidden from screen readers */
    decorative?: boolean;
  };

/**
 * Divider is a visual separator between content sections.
 * Can be horizontal or vertical.
 *
 * @example
 * ```tsx
 * // Horizontal divider (default)
 * <Divider />
 *
 * // With spacing
 * <Divider spacing="md" />
 *
 * // Vertical divider in flex container
 * <div className="flex items-center gap-4">
 *   <span>Item 1</span>
 *   <Divider orientation="vertical" className="h-4" />
 *   <span>Item 2</span>
 * </div>
 *
 * // Semantic divider (announced by screen readers)
 * <Divider decorative={false} />
 * ```
 */
export function Divider({
  className,
  orientation,
  spacing,
  color,
  decorative = true,
  ...props
}: DividerProps) {
  const semanticProps = decorative
    ? { role: "none" as const }
    : { role: "separator" as const, "aria-orientation": orientation ?? undefined };

  return (
    <div
      className={cn(dividerVariants({ orientation, spacing, color }), className)}
      {...semanticProps}
      {...props}
    />
  );
}
