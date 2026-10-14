import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";

const modalFooterVariants = defineRecipe({
  base: "flex shrink-0 items-center gap-2 border-t border-border bg-structure",
  variants: {
    size: {
      /** Actions to the right, 60 px or taller. */
      md: "min-h-15 justify-end px-6 py-3",
      /** A 48 px status line: text on the left, small actions on the right (boards). */
      sm: "h-12 justify-between pl-6 pr-4 text-xs text-fg-muted",
      /** A 64 px action bar (wizard boards): put a spacer between left and right actions. */
      lg: "h-16 gap-2.5 pl-6 pr-5",
    },
  },
  defaultVariants: { size: "md" },
});

interface ModalFooterProps extends ComponentPropsWithoutRef<"div"> {
  /** `md` (default) for actions, `sm` for a status line with navigation, `lg` for a wizard's action bar. */
  size?: "md" | "sm" | "lg";
}

/**
 * Modal.Footer is the footer section of the modal.
 * Defaults to `flex items-center justify-end gap-2` (overridable via className).
 */
export function ModalFooter({
  children,
  className,
  size,
  ...props
}: ModalFooterProps) {
  return (
    <div data-budget-region="modal-footer" data-layer="medium" className={cn(modalFooterVariants({ size }), className)} {...props}>
      {children}
    </div>
  );
}
