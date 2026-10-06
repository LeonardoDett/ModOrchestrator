import { type ElementType } from "react";
import { defineRecipe, type VariantProps } from "../core/recipe";
import { cn } from "../utils/cn";
import type { PolymorphicComponentProps } from "../utils/polymorphic";

const boxVariants = defineRecipe({
  base: "box-border",
  variants: {
    /** Background color variant */
    bg: {
      transparent: "bg-transparent",
      bg: "bg-page",
      surface: "bg-surface",
      primary: "bg-primary",
      secondary: "bg-secondary",
      success: "bg-success",
      warning: "bg-warning",
      danger: "bg-danger",
      muted: "bg-muted",
    },
    /** Text color variant */
    color: {
      inherit: "text-inherit",
      fg: "text-fg",
      "surface-fg": "text-fg",
      "primary-fg": "text-on-primary",
      "secondary-fg": "text-on-secondary",
      "success-fg": "text-on-success",
      "warning-fg": "text-on-warning",
      "danger-fg": "text-on-danger",
      "muted-fg": "text-fg-muted",
      primary: "text-primary-text",
      secondary: "text-secondary-text",
      success: "text-success-text",
      warning: "text-warning-text",
      danger: "text-danger-text",
    },
    /** Padding variant */
    padding: {
      none: "p-0",
      xs: "p-1",
      sm: "p-2",
      md: "p-4",
      lg: "p-6",
      xl: "p-8",
    },
    /** Horizontal padding variant */
    px: {
      none: "px-0",
      xs: "px-1",
      sm: "px-2",
      md: "px-4",
      lg: "px-6",
      xl: "px-8",
    },
    /** Vertical padding variant */
    py: {
      none: "py-0",
      xs: "py-1",
      sm: "py-2",
      md: "py-4",
      lg: "py-6",
      xl: "py-8",
    },
    /** Border radius variant */
    radius: {
      none: "rounded-none",
      xs: "rounded-xs",
      sm: "rounded-sm",
      md: "rounded-md",
      lg: "rounded-lg",
      xl: "rounded-xl",
      "2xl": "rounded-2xl",
      "3xl": "rounded-3xl",
      full: "rounded-full",
    },
    /** Shadow variant */
    shadow: {
      none: "shadow-none",
      sm: "shadow-sm",
      md: "shadow-md",
      lg: "shadow-lg",
      xl: "shadow-xl",
      "2xl": "shadow-2xl",
    },
    /** Border variant */
    border: {
      none: "",
      default: "border border-border",
      primary: "border border-primary",
      danger: "border border-danger",
    },
  },
  defaultVariants: {
    color: "inherit",
    padding: "none",
    radius: "none",
    shadow: "none",
    border: "none",
  },
});

type BoxVariants = VariantProps<typeof boxVariants>;

type BoxOwnProps = BoxVariants & {
  /** Additional CSS classes */
  className?: string;
};

type BoxProps<E extends ElementType = "div"> = PolymorphicComponentProps<E, BoxOwnProps>;

/**
 * Box is the most basic layout primitive.
 * It renders a `div` by default but can be changed with the `as` prop.
 *
 * @example
 * ```tsx
 * <Box padding="md" radius="lg" border="default" bg="surface">
 *   Content here
 * </Box>
 *
 * <Box as="section" padding="lg" shadow="md" bg="bg" color="fg">
 *   Section content
 * </Box>
 *
 * <Box as="a" href="/link" bg="primary" color="primary-fg" padding="sm" radius="md">
 *   Link styled as box
 * </Box>
 * ```
 */
export function Box<E extends ElementType = "div">({
  as,
  className,
  bg,
  color,
  padding,
  px,
  py,
  radius,
  shadow,
  border,
  ...props
}: BoxProps<E>) {
  const Component = as || "div";
  return (
    <Component
      className={cn(
        boxVariants({ bg, color, padding, px, py, radius, shadow, border }),
        className
      )}
      {...props}
    />
  );
}
