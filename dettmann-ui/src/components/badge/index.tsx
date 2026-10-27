import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { resolveEmphasis, restingClassName } from "../../theme/emphasis";
import type { Emphasis, Intent } from "../../theme/engine";

/** Contorno por ênfase; a cor vem da tabela central (badge não é interativo: só classes de repouso). */
const badgeFrame: Record<Emphasis, string> = {
  high: "",
  medium: "border border-intent-border",
  low: "border border-border",
};

const badgeVariants = defineRecipe({
  base: [
    "inline-flex items-center justify-center",
    "font-medium whitespace-nowrap text-xs",
    "rounded-pill",
    "motion-transition",
  ].join(" "),
  variants: {
    /** Size variant */
    size: {
      sm: "px-1.5 py-0.5 text-xs",
      md: "px-2 py-0.5 text-xs",
      lg: "px-2.5 py-1 text-sm",
    },
    /** Dot indicator (no text, just a colored circle) */
    dot: {
      true: "h-2 w-2 p-0",
      false: "",
    },
  },
  defaultVariants: {
    size: "md",
    dot: false,
  },
});

type BadgeVariants = VariantProps<typeof badgeVariants>;

interface BadgeProps extends ComponentPropsWithoutRef<"span">, BadgeVariants {
  /** `high` = preenchido, `medium` = tinta suave (padrão), `low` = contorno. */
  emphasis?: Emphasis;
  /** Significado cromático; padrão `neutral` (ou `brand` quando `emphasis="high"`). */
  intent?: Intent;
}

/**
 * Badge component for labels, counts, and status indicators.
 *
 * @example
 * ```tsx
 * <Badge>New</Badge>
 * <Badge intent="success">Active</Badge>
 * <Badge intent="danger" size="sm">3</Badge>
 * <Badge intent="success" dot /> // Status dot
 * ```
 */
export function Badge({ children, className, emphasis, intent, size, dot, ...props }: BadgeProps) {
  const resolved = resolveEmphasis({ emphasis, intent });
  const paint = dot
    ? resolved.intent === "neutral"
      ? "bg-fg-subtle"
      : "bg-intent-fill"
    : cn(restingClassName(resolved), badgeFrame[resolved.emphasis]);

  return (
    <span className={cn(badgeVariants({ size, dot }), paint, className)} {...resolved.attrs} {...props}>
      {!dot && children}
    </span>
  );
}
