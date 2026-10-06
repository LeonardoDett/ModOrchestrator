import { type ElementType } from "react";
import { defineRecipe, type VariantProps } from "../core/recipe";
import { cn } from "../utils/cn";
import type { PolymorphicComponentProps } from "../utils/polymorphic";

const containerVariants = defineRecipe({
  base: "mx-auto w-full",
  variants: {
    /** Max width from container tokens */
    size: {
      sm: "max-w-container-sm",
      md: "max-w-container-md",
      lg: "max-w-container-lg",
      xl: "max-w-container-xl",
      "2xl": "max-w-container-2xl",
      full: "max-w-container-full",
    },
    /**
     * Horizontal padding. `md`/`lg` scale up at larger breakpoints
     * (16px mobile → 24/32px tablet → 32/80px desktop).
     */
    padding: {
      none: "px-0",
      sm: "px-4",
      md: "px-4 sm:px-6 lg:px-8",
      lg: "px-4 md:px-8 xl:px-20",
    },
  },
  defaultVariants: {
    size: "lg",
    padding: "md",
  },
});

type ContainerVariants = VariantProps<typeof containerVariants>;

type ContainerOwnProps = ContainerVariants & {
  /** Additional CSS classes */
  className?: string;
};

type ContainerProps<E extends ElementType = "div"> = PolymorphicComponentProps<
  E,
  ContainerOwnProps
>;

/**
 * Container centers content with a max-width and horizontal padding from tokens.
 *
 * @example
 * ```tsx
 * <Container size="lg" padding="md">
 *   Page content
 * </Container>
 * ```
 */
export function Container<E extends ElementType = "div">({
  as,
  className,
  size,
  padding,
  ...props
}: ContainerProps<E>) {
  const Component = as || "div";
  return (
    <Component
      className={cn(containerVariants({ size, padding }), className)}
      {...props}
    />
  );
}

export type { ContainerVariants, ContainerProps };
