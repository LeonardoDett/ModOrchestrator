"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Icon, type IconComponent } from "../../primitives/icon";
import { intentData } from "../../theme/emphasis";
import type { Intent } from "../../theme/engine";

const featuredIconVariants = defineRecipe({
  slots: {
    /** Outer wash (intent subtle) */
    root: "inline-flex items-center justify-center rounded-pill",
    /** Inner disc (state layer over the wash) holding the icon */
    inner: "inline-flex items-center justify-center rounded-pill",
  },
  variants: {
    /** Two-tone wash: tinted intents use the intent contract, neutral uses surface roles. */
    paint: {
      tinted: { root: "bg-intent-subtle", inner: "bg-state-hover text-intent-text" },
      neutral: { root: "bg-sunken", inner: "bg-surface text-fg-muted" },
    },
    /** Outer padding + inner disc size */
    size: {
      sm: {
        root: "p-1.5",
        inner: "h-8 w-8",
      },
      md: {
        root: "p-2",
        inner: "h-10 w-10",
      },
      lg: {
        root: "p-2.5",
        inner: "h-12 w-12",
      },
    },
  },
  defaultVariants: {
    paint: "tinted",
    size: "lg",
  },
});

type FeaturedIconVariants = VariantProps<typeof featuredIconVariants>;

interface FeaturedIconProps
  extends Omit<ComponentPropsWithoutRef<"span">, "color" | "children">,
    Omit<FeaturedIconVariants, "paint"> {
  /** Lucide or animated icon rendered in the inner disc */
  icon: IconComponent;
  /** Accessible label. Decorative when omitted. */
  label?: string;
  /** Família de cor (padrão `success`); `neutral` usa papéis de superfície. */
  intent?: Intent;
  /**
   * D-040: `tile` is a 32 px tinted square with the icon (the mark of a row in a list
   * of notifications or problems), in place of the two discs.
   */
  shape?: "disc" | "tile";
}

const sizeToIconSize = {
  sm: "sm",
  md: "md",
  lg: "lg",
} as const satisfies Record<
  NonNullable<FeaturedIconVariants["size"]>,
  "sm" | "md" | "lg"
>;

/**
 * FeaturedIcon is a two-layer circular icon (wash + disc) used in
 * confirmation modals, empty states, and success feedback.
 *
 * @example
 * ```tsx
 * import { CircleCheckIcon, TriangleAlertIcon } from "dettmann-ui/icons";
 *
 * <FeaturedIcon icon={CircleCheckIcon} intent="success" />
 * <FeaturedIcon icon={TriangleAlertIcon} intent="warning" size="md" />
 * ```
 */
export function FeaturedIcon({
  icon,
  intent = "success",
  size,
  label,
  shape = "disc",
  className,
  ...props
}: FeaturedIconProps) {
  if (shape === "tile") {
    return (
      <span
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-control",
          intent === "neutral" ? "bg-sunken text-fg-muted" : "bg-intent-subtle text-intent-text",
          className,
        )}
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        {...intentData(intent === "neutral" ? undefined : intent)}
        {...props}
      >
        <Icon icon={icon} size="sm" color="current" />
      </span>
    );
  }
  const styles = featuredIconVariants({ paint: intent === "neutral" ? "neutral" : "tinted", size });
  const iconSize = sizeToIconSize[size ?? "lg"];

  return (
    <span
      className={cn(styles.root(), className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...intentData(intent === "neutral" ? undefined : intent)}
      {...props}
    >
      <span className={styles.inner()}>
        <Icon icon={icon} size={iconSize} color="current" />
      </span>
    </span>
  );
}
