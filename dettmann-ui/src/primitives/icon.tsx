import { defineRecipe, type VariantProps } from "../core/recipe";
import { cn } from "../utils/cn";
import { intentData } from "../theme/emphasis";
import type { Intent } from "../theme/engine";
import type { LucideIcon } from "lucide-react";
import type { AnimatedIconComponent } from "../icons/types";

export type IconSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

/** Classes de tamanho por `size` (compartilhadas com os ícones animados). */
export const ICON_SIZE_CLASS: Record<IconSize, string> = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
  xl: "h-8 w-8",
  "2xl": "h-10 w-10",
};

/** Size to strokeWidth mapping for consistent proportions */
export const ICON_STROKE: Record<IconSize, number> = {
  xs: 1.5,
  sm: 2,
  md: 2,
  lg: 2,
  xl: 1.75,
  "2xl": 1.5,
};

const ICON_COLOR_CLASS = {
  current: "text-current",
  fg: "text-fg",
  "muted-fg": "text-fg-muted",
};

const iconVariants = defineRecipe({
  base: "shrink-0",
  variants: {
    /** Icon size */
    size: ICON_SIZE_CLASS,
    /** Icon color (neutral roles); use `intent` for semantic color */
    color: ICON_COLOR_CLASS,
  },
  defaultVariants: {
    size: "md",
    color: "current",
  },
});

type IconVariants = VariantProps<typeof iconVariants>;

/** Type for Lucide icon components - uses the official LucideIcon type */
export type LucideIconComponent = LucideIcon;

/** Ícone lucide ou ícone animado próprio (`defineIcon`). */
export type IconComponent = LucideIcon | AnimatedIconComponent;

function isAnimatedIcon(icon: IconComponent): icon is AnimatedIconComponent {
  return "definition" in icon;
}

interface IconProps extends IconVariants {
  /** The icon component to render (Lucide or an animated icon from `dettmann-ui/icons`) */
  icon: IconComponent;
  /** Custom stroke width (overrides default) */
  strokeWidth?: number | string;
  /** Accessible label for the icon */
  label?: string;
  /** Additional CSS classes */
  className?: string;
  /** Semantic color: paints with `text-intent-fill` and scopes `data-intent`. */
  intent?: Intent;
}

/**
 * Icon is a wrapper for Lucide icons that provides consistent sizing and coloring.
 * All components in the design system should use this instead of importing
 * Lucide icons directly. Also accepts an animated icon (`defineIcon`), which
 * renders itself with the same size, intent and label.
 *
 * @example
 * ```tsx
 * import { HomeIcon, SettingsIcon, XIcon } from "dettmann-ui/icons";
 *
 * <Icon icon={HomeIcon} />
 * <Icon icon={SettingsIcon} size="lg" intent="brand" />
 * <Icon icon={XIcon} size="sm" label="Close" />
 *
 * // In a button
 * <button>
 *   <Icon icon={HomeIcon} size="sm" />
 *   Home
 * </button>
 * ```
 */
export function Icon({ icon, className, size = "md", color, intent, strokeWidth, label }: IconProps) {
  const resolvedSize = size ?? "md";
  if (isAnimatedIcon(icon)) {
    const Animated = icon;
    return (
      <Animated
        size={resolvedSize}
        intent={intent}
        label={label}
        strokeWidth={strokeWidth}
        className={cn(ICON_COLOR_CLASS[color ?? "current"], className)}
      />
    );
  }
  const IconComponent = icon;
  const resolvedStrokeWidth = strokeWidth ?? ICON_STROKE[resolvedSize];

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
