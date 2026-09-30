import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { toneData, type Tone } from "../../theme/tone";

const badgeSoft = "bg-tone-subtle text-tone-text border border-tone-border";
const badgeSolid = "bg-tone text-on-tone";
const badgeNeutral = "bg-secondary-subtle text-secondary-text border border-secondary-border";
const badgeMuted = "bg-muted text-fg-muted";
const badgeOutline = "border border-border bg-transparent text-fg";

const badgeTone: Record<string, Tone | undefined> = {
  success: "success",
  warning: "warning",
  danger: "danger",
  secondary: "secondary",
  info: "info",
};

const badgeVariants = defineRecipe({
  base: [
    "inline-flex items-center justify-center",
    "font-medium whitespace-nowrap text-xs",
    "rounded-full",
    "transition-colors duration-fast ease-default",
  ].join(" "),
  variants: {
    /** Color variant — subtle fill + darker text of the same family */
    variant: {
      default: "",
      secondary: "",
      muted: "",
      success: "",
      warning: "",
      danger: "",
      info: "",
      outline: "",
    },
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
    variant: "default",
    size: "md",
    dot: false,
  },
});

type BadgeVariants = VariantProps<typeof badgeVariants>;

interface BadgeProps extends ComponentPropsWithoutRef<"span">, BadgeVariants {
  tone?: Tone;
}

/**
 * Badge component for labels, counts, and status indicators.
 *
 * @example
 * ```tsx
 * <Badge>New</Badge>
 * <Badge variant="success">Active</Badge>
 * <Badge variant="danger" size="sm">3</Badge>
 * <Badge variant="success" dot /> // Status dot
 * ```
 */
export function Badge({
  children,
  className,
  variant = "default",
  tone,
  size,
  dot,
  ...props
}: BadgeProps) {
  const resolved = tone ?? badgeTone[variant ?? "default"];
  const paint =
    variant === "outline"
      ? badgeOutline
      : variant === "muted"
        ? badgeMuted
        : dot
          ? resolved
            ? badgeSolid
            : "bg-fg-subtle"
          : resolved
            ? badgeSoft
            : badgeNeutral;

  return (
    <span
      className={cn(badgeVariants({ variant, size, dot }), paint, className)}
      {...toneData(variant === "outline" || variant === "muted" ? tone : resolved)}
      {...props}
    >
      {!dot && children}
    </span>
  );
}
