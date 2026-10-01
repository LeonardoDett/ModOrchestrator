import { type ComponentPropsWithoutRef, type ComponentType } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { toneData, type Tone } from "../../theme/tone";

const indicatorVariants = defineRecipe({
  base: "inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-medium tabular-nums",
  variants: {
    paint: {
      tone: "text-tone-text",
      neutral: "text-fg-muted",
      subtle: "text-fg-subtle",
    },
    size: {
      sm: "text-xs",
      md: "text-sm",
    },
  },
  defaultVariants: { paint: "neutral", size: "sm" },
});

const ICON_SIZE = { sm: "h-3.5 w-3.5", md: "h-4 w-4" } as const;

export interface IndicatorProps extends Omit<ComponentPropsWithoutRef<"span">, "children" | "role"> {
  /** Icon that carries the meaning (never color alone). */
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  /** Accessible name and tooltip text ("3 problems", "Wins 12 files"). */
  label: string;
  /** Optional count shown next to the icon. */
  count?: number;
  /** Semantic tone; "neutral" and "subtle" use foreground roles. */
  tone?: Tone | "neutral" | "subtle";
  size?: "sm" | "md";
}

/**
 * Indicator is a compact icon + optional count for dense table cells
 * (conflicts, dependencies, problems). It is an image with an accessible
 * name, so screen readers read the label instead of a bare number.
 *
 * @example
 * ```tsx
 * <Indicator icon={AlertTriangle} tone="warning" count={3} label="3 problems" />
 * ```
 */
export function Indicator({ icon: Icon, label, count, tone = "neutral", size = "sm", className, title, ...props }: IndicatorProps) {
  const chromatic = tone !== "neutral" && tone !== "subtle";
  return (
    <span
      role="img"
      aria-label={label}
      title={title ?? label}
      className={cn(indicatorVariants({ paint: chromatic ? "tone" : tone, size }), className)}
      {...toneData(chromatic ? tone : undefined)}
      {...props}
    >
      <Icon aria-hidden="true" className={ICON_SIZE[size]} />
      {count !== undefined ? <span aria-hidden="true">{count}</span> : null}
    </span>
  );
}
