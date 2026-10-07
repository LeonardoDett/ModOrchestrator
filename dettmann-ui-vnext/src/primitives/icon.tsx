import { type ComponentPropsWithoutRef, type ElementType } from "react";
import { defineRecipe, type VariantProps } from "../core/recipe";
import { cn } from "../utils/cn";
import { intentData } from "../theme/emphasis";
import type { Intent } from "../theme/engine";
import type { LucideIcon } from "lucide-react";

const iconVariants = defineRecipe({
  base: "shrink-0",
  variants: {
    /** Icon size */
    size: {
      xs: "h-3 w-3",
      sm: "h-4 w-4",
      md: "h-5 w-5",
      lg: "h-6 w-6",
      xl: "h-8 w-8",
      "2xl": "h-10 w-10",
    },
    /** Icon color (neutral roles); use `intent` for semantic color */
    color: {
      current: "text-current",
      fg: "text-fg",
      "muted-fg": "text-fg-muted",
    },
  },
  defaultVariants: {
    size: "md",
    color: "current",
  },
});

type IconVariants = VariantProps<typeof iconVariants>;

/** Type for Lucide icon components - uses the official LucideIcon type */
export type LucideIconComponent = LucideIcon;

interface IconProps extends IconVariants {
  /** The Lucide icon component to render */
  icon: LucideIconComponent;
  /** Custom stroke width (overrides default) */
  strokeWidth?: number | string;
  /** Accessible label for the icon */
  label?: string;
  /** Additional CSS classes */
  className?: string;
  /** Semantic color: paints with `text-intent-fill` and scopes `data-intent`. */
  intent?: Intent;
}

/** Size to strokeWidth mapping for consistent proportions */
const sizeToStrokeWidth: Record<NonNullable<IconVariants["size"]>, number> = {
  xs: 1.5,
  sm: 2,
  md: 2,
  lg: 2,
  xl: 1.75,
  "2xl": 1.5,
};

/**
 * Icon is a wrapper for Lucide icons that provides consistent sizing and coloring.
 * All components in the design system should use this instead of importing
 * Lucide icons directly.
 *
 * @example
 * ```tsx
 * import { Home, Settings, X } from "lucide-react";
 *
 * <Icon icon={Home} />
 * <Icon icon={Settings} size="lg" intent="brand" />
 * <Icon icon={X} size="sm" label="Close" />
 *
 * // In a button
 * <button>
 *   <Icon icon={Home} size="sm" />
 *   Home
 * </button>
 * ```
 */
export function Icon({
  icon: IconComponent,
  className,
  size = "md",
  color,
  intent,
  strokeWidth,
  label,
}: IconProps) {
  const resolvedStrokeWidth = strokeWidth ?? sizeToStrokeWidth[size ?? "md"];

  return (
    <IconComponent
      {...intentData(intent)}
      className={cn(iconVariants({ size, color }), intent && "text-intent-fill", className)}
      strokeWidth={resolvedStrokeWidth}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
    />
  );
}
