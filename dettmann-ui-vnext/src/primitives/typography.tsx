import { type ElementType } from "react";
import { defineRecipe, type VariantProps } from "../core/recipe";
import { cn } from "../utils/cn";
import { isTone, toneData, type Tone } from "../theme/tone";
import type { PolymorphicComponentProps } from "../utils/polymorphic";

const typographyVariants = defineRecipe({
  base: "m-0",
  variants: {
    /** Semantic variant that sets font size, weight, and line height */
    variant: {
      "heading-1": "text-5xl font-bold leading-tight tracking-tight",
      "heading-2": "text-4xl font-bold leading-tight tracking-tight",
      "heading-3": "text-3xl font-semibold leading-snug",
      "heading-4": "text-2xl font-semibold leading-snug",
      "heading-5": "text-xl font-medium leading-normal",
      "heading-6": "text-lg font-medium leading-normal",
      body: "text-base font-normal leading-normal",
      "body-lg": "text-lg font-normal leading-relaxed",
      "body-sm": "text-sm font-normal leading-normal",
      caption: "text-xs font-normal leading-normal",
      label: "text-sm font-medium leading-none",
      code: "font-mono text-sm",
    },
    /** Text color */
    color: {
      inherit: "text-inherit",
      fg: "text-fg",
      "muted-fg": "text-fg-muted",
      primary: "text-tone-text",
      secondary: "text-tone-text",
      success: "text-tone-text",
      warning: "text-tone-text",
      danger: "text-tone-text",
      accent: "text-tone-text",
      info: "text-tone-text",
    },
    /** Text alignment */
    align: {
      left: "text-left",
      center: "text-center",
      right: "text-right",
      justify: "text-justify",
    },
    /** Text wrapping */
    wrap: {
      wrap: "text-wrap",
      nowrap: "text-nowrap",
      balance: "text-balance",
      pretty: "text-pretty",
    },
    /** Truncate with ellipsis */
    truncate: {
      true: "truncate",
      false: "",
    },
  },
  defaultVariants: {
    variant: "body",
    color: "inherit",
    align: "left",
    truncate: false,
  },
});

type TypographyVariants = VariantProps<typeof typographyVariants>;

/** Default element for each variant */
const variantElementMap: Record<NonNullable<TypographyVariants["variant"]>, ElementType> = {
  "heading-1": "h1",
  "heading-2": "h2",
  "heading-3": "h3",
  "heading-4": "h4",
  "heading-5": "h5",
  "heading-6": "h6",
  body: "p",
  "body-lg": "p",
  "body-sm": "p",
  caption: "span",
  label: "span",
  code: "code",
};

type TypographyOwnProps = TypographyVariants & {
  /** Additional CSS classes */
  className?: string;
  tone?: Tone;
};

type TypographyProps<E extends ElementType = "p"> = PolymorphicComponentProps<E, TypographyOwnProps>;

/**
 * Typography is the base component for all text rendering.
 * It automatically selects the appropriate HTML element based on the variant,
 * but can be overridden with the `as` prop.
 *
 * @example
 * ```tsx
 * <Typography variant="heading-1">Page Title</Typography>
 * <Typography variant="body" color="muted-fg">Description text</Typography>
 * <Typography variant="caption" as="span">Small note</Typography>
 * <Typography variant="label" as="label" htmlFor="input">Form label</Typography>
 * ```
 */
export function Typography<E extends ElementType = "p">({
  as,
  className,
  variant = "body",
  color,
  tone,
  align,
  wrap,
  truncate,
  ...props
}: TypographyProps<E>) {
  const Component = as || variantElementMap[variant ?? "body"];
  const resolvedTone = tone ?? (isTone(color) ? color : undefined);
  return (
    <Component
      className={cn(typographyVariants({ variant, color, align, wrap, truncate }), className)}
      {...toneData(resolvedTone)}
      {...props}
    />
  );
}
