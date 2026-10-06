import { type ComponentPropsWithoutRef, type ElementType } from "react";
import { defineRecipe, type VariantProps } from "../core/recipe";
import { cn } from "../utils/cn";
import { isTone, toneData, type Tone } from "../theme/tone";
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
    /** Icon color */
    color: {
      current: "text-current",
      fg: "text-fg",
      "muted-fg": "text-fg-muted",
      primary: "text-tone",
      secondary: "text-tone",
      success: "text-tone",
      warning: "text-tone",
      danger: "text-tone",
      accent: "text-tone",
      info: "text-tone",
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
  tone?: Tone;
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
 * <Icon icon={Settings} size="lg" color="primary" />
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
  tone,
  strokeWidth,
  label,
}: IconProps) {
  const resolvedStrokeWidth = strokeWidth ?? sizeToStrokeWidth[size ?? "md"];
  const resolvedTone = tone ?? (isTone(color) ? color : undefined);

  return (
    <IconComponent
      {...toneData(resolvedTone)}
      className={cn(iconVariants({ size, color }), className)}
      strokeWidth={resolvedStrokeWidth}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
    />
  );
}
