import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe, type VariantProps } from "../core/recipe";
import { cn } from "../utils/cn";
import { isTone, toneData, type Tone } from "../theme/tone";

const spinnerVariants = defineRecipe({
  base: "inline-block animate-spin rounded-full border-current border-r-transparent",
  variants: {
    /** Size of the spinner */
    size: {
      xs: "h-3 w-3 border",
      sm: "h-4 w-4 border-2",
      md: "h-6 w-6 border-2",
      lg: "h-8 w-8 border-[3px]",
      xl: "h-12 w-12 border-4",
    },
    /** Color variant */
    color: {
      current: "text-current",
      primary: "text-tone",
      secondary: "text-tone",
      success: "text-tone",
      warning: "text-tone",
      danger: "text-tone",
      accent: "text-tone",
      info: "text-tone",
      muted: "text-fg-subtle",
      fg: "text-fg",
    },
  },
  defaultVariants: {
    size: "md",
    color: "current",
  },
});

type SpinnerVariants = VariantProps<typeof spinnerVariants>;

type SpinnerProps = Omit<ComponentPropsWithoutRef<"span">, "children"> &
  SpinnerVariants & {
    /** Accessible label for screen readers */
    label?: string;
    tone?: Tone;
  };

/**
 * Spinner is a loading indicator that shows an animated spinning circle.
 *
 * @example
 * ```tsx
 * <Spinner />
 * <Spinner size="lg" color="primary" />
 * <Spinner size="sm" label="Loading..." />
 *
 * <Button disabled>
 *   <Spinner size="sm" />
 *   Loading...
 * </Button>
 * ```
 */
export function Spinner({
  className,
  size,
  color,
  tone,
  label = "Loading",
  ...props
}: SpinnerProps) {
  const resolvedTone = tone ?? (isTone(color) ? color : undefined);
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(spinnerVariants({ size, color }), className)}
      {...toneData(resolvedTone)}
      {...props}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}
