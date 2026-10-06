import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe, type VariantProps } from "../core/recipe";
import { cn } from "../utils/cn";

const backdropVariants = defineRecipe({
  base: "fixed inset-0 z-overlay transition-colors",
  variants: {
    /** Opacity level — uses overlay token alpha so children are unaffected */
    opacity: {
      light: "bg-overlay",
      medium: "bg-overlay",
      heavy: "bg-overlay",
      full: "bg-overlay",
    },
    /** Blur effect */
    blur: {
      none: "",
      sm: "backdrop-blur-sm",
      md: "backdrop-blur-md",
      lg: "backdrop-blur-lg",
      xl: "backdrop-blur-xl",
      overlay: "backdrop-blur-overlay",
    },
    /** Animation state */
    state: {
      entering: "animate-in fade-in duration-normal",
      entered: "",
      exiting: "animate-out fade-out duration-fast",
      exited: "hidden",
    },
  },
  defaultVariants: {
    opacity: "medium",
    blur: "overlay",
    state: "entered",
  },
});

type BackdropVariants = VariantProps<typeof backdropVariants>;

type BackdropProps = ComponentPropsWithoutRef<"div"> & BackdropVariants;

/**
 * Backdrop is a fixed overlay layer used behind modals, drawers, and popovers.
 * Default matches the kit: overlay at 70% plus 8px backdrop blur.
 *
 * @example
 * ```tsx
 * <Backdrop onClick={onClose} />
 *
 * <Backdrop opacity="heavy" blur="none" state={isOpen ? "entered" : "exited"} />
 * ```
 */
export function Backdrop({
  className,
  opacity,
  blur,
  state,
  ...props
}: BackdropProps) {
  return (
    <div
      className={cn(backdropVariants({ opacity, blur, state }), className)}
      aria-hidden="true"
      {...props}
    />
  );
}
