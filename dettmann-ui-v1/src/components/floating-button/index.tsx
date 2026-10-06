import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Button } from "../button";

const floatingButtonVariants = defineRecipe({
  base: "fixed z-sticky",
  variants: {
    /** Corner of the viewport */
    position: {
      "bottom-right": "",
      "bottom-left": "",
      "top-right": "",
      "top-left": "",
    },
    /** Distance from the edges (spacing tokens) */
    offset: {
      sm: "",
      md: "",
      lg: "",
    },
  },
  compoundVariants: [
    { position: "bottom-right", offset: "sm", class: "bottom-3 right-3" },
    { position: "bottom-right", offset: "md", class: "bottom-4 right-4" },
    { position: "bottom-right", offset: "lg", class: "bottom-6 right-6" },
    { position: "bottom-left", offset: "sm", class: "bottom-3 left-3" },
    { position: "bottom-left", offset: "md", class: "bottom-4 left-4" },
    { position: "bottom-left", offset: "lg", class: "bottom-6 left-6" },
    { position: "top-right", offset: "sm", class: "top-3 right-3" },
    { position: "top-right", offset: "md", class: "top-4 right-4" },
    { position: "top-right", offset: "lg", class: "top-6 right-6" },
    { position: "top-left", offset: "sm", class: "top-3 left-3" },
    { position: "top-left", offset: "md", class: "top-4 left-4" },
    { position: "top-left", offset: "lg", class: "top-6 left-6" },
  ],
  defaultVariants: {
    position: "bottom-right",
    offset: "md",
  },
});

type FloatingButtonVariants = VariantProps<typeof floatingButtonVariants>;

type ButtonProps = ComponentPropsWithoutRef<typeof Button>;

interface FloatingButtonProps
  extends Omit<ButtonProps, "fullWidth">,
    FloatingButtonVariants {}

/**
 * FloatingButton is a Button pinned to a viewport corner.
 * Positioning uses spacing and z-index tokens — no floating-ui.
 *
 * @example
 * ```tsx
 * <FloatingButton position="bottom-right" offset="md" size="icon" aria-label="Create">
 *   +
 * </FloatingButton>
 * ```
 */
export function FloatingButton({
  position,
  offset,
  className,
  size = "icon",
  ...props
}: FloatingButtonProps) {
  return (
    <Button
      size={size}
      className={cn(floatingButtonVariants({ position, offset }), className)}
      {...props}
    />
  );
}
