import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe, type VariantProps } from "../core/recipe";
import { cn } from "../utils/cn";

const visuallyHiddenVariants = defineRecipe({
  base: "",
  variants: {
    /** Whether the element is visually hidden */
    hidden: {
      true: [
        "absolute",
        "w-px",
        "h-px",
        "p-0",
        "-m-px",
        "overflow-hidden",
        "whitespace-nowrap",
        "border-0",
        "[clip:rect(0,0,0,0)]",
      ].join(" "),
      false: "",
    },
    /** Show on focus (useful for skip links) */
    focusable: {
      true: "focus:static focus:w-auto focus:h-auto focus:m-0 focus:overflow-visible focus:whitespace-normal focus:[clip:auto]",
      false: "",
    },
  },
  defaultVariants: {
    hidden: true,
    focusable: false,
  },
});

type VisuallyHiddenVariants = VariantProps<typeof visuallyHiddenVariants>;

type VisuallyHiddenProps = ComponentPropsWithoutRef<"span"> & VisuallyHiddenVariants;

/**
 * VisuallyHidden hides content visually while keeping it accessible to screen readers.
 * Use for labels, descriptions, or any text that should be announced but not displayed.
 *
 * @example
 * ```tsx
 * // Hidden label for icon button
 * <button>
 *   <Icon icon={X} />
 *   <VisuallyHidden>Close dialog</VisuallyHidden>
 * </button>
 *
 * // Skip link that appears on focus
 * <VisuallyHidden focusable as="a" href="#main-content">
 *   Skip to main content
 * </VisuallyHidden>
 * ```
 */
export function VisuallyHidden({
  className,
  hidden,
  focusable,
  ...props
}: VisuallyHiddenProps) {
  return (
    <span
      className={cn(visuallyHiddenVariants({ hidden, focusable }), className)}
      {...props}
    />
  );
}
