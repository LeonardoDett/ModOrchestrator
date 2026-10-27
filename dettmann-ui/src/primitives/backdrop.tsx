import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { defineRecipe, type VariantProps } from "../core/recipe";
import { cn } from "../utils/cn";

const backdropVariants = defineRecipe({
  base: "fixed inset-0 z-overlay motion-transition",
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
    /** Estado de montagem. A animação vem do `Presence` de quem usa (Modal, Drawer); só `exited` muda o estilo. */
    state: {
      entering: "",
      entered: "",
      exiting: "",
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
export const Backdrop = forwardRef<HTMLDivElement, BackdropProps>(function Backdrop(
  { className, opacity, blur, state, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(backdropVariants({ opacity, blur, state }), className)}
      aria-hidden="true"
      {...props}
    />
  );
});
