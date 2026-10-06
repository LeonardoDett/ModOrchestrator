"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Icon, type LucideIconComponent } from "../../primitives/icon";
import { toneData, type Tone } from "../../theme/tone";

const featuredIconVariants = defineRecipe({
  slots: {
    /** Outer wash (tone-50) */
    root: "inline-flex items-center justify-center rounded-full",
    /** Inner disc (tone-100) holding the icon */
    inner: "inline-flex items-center justify-center rounded-full",
  },
  variants: {
    /** Color family — two-tone wash matching Untitled UI featured icons */
    color: {
      success: { root: "bg-tone-subtle", inner: "bg-tone-subtle-hover text-tone-text" },
      warning: { root: "bg-tone-subtle", inner: "bg-tone-subtle-hover text-tone-text" },
      danger: { root: "bg-tone-subtle", inner: "bg-tone-subtle-hover text-tone-text" },
      primary: { root: "bg-tone-subtle", inner: "bg-tone-subtle-hover text-tone-text" },
      neutral: { root: "bg-muted", inner: "bg-surface text-fg-muted" },
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
    color: "success",
    size: "lg",
  },
});

type FeaturedIconVariants = VariantProps<typeof featuredIconVariants>;

interface FeaturedIconProps
  extends Omit<ComponentPropsWithoutRef<"span">, "color" | "children">,
    FeaturedIconVariants {
  /** Lucide icon rendered in the inner disc */
  icon: LucideIconComponent;
  /** Accessible label. Decorative when omitted. */
  label?: string;
  /** Sobrescreve o papel de `color` quando informado. */
  tone?: Tone;
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
 * import { CheckCircle } from "lucide-react";
 *
 * <FeaturedIcon icon={CheckCircle} color="success" />
 * <FeaturedIcon icon={AlertTriangle} color="warning" size="md" />
 * ```
 */
export function FeaturedIcon({
  icon,
  color,
  tone,
  size,
  label,
  className,
  ...props
}: FeaturedIconProps) {
  const styles = featuredIconVariants({ color, size });
  const iconSize = sizeToIconSize[size ?? "lg"];
  const resolved: Tone | undefined =
    tone ?? (color && color !== "neutral" ? color : undefined);

  return (
    <span
      className={cn(styles.root(), className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...toneData(resolved)}
      {...props}
    >
      <span className={styles.inner()}>
        <Icon icon={icon} size={iconSize} color="current" />
      </span>
    </span>
  );
}
