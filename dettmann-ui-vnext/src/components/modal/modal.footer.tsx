import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";

const modalFooterVariants = defineRecipe({
  base: [
    "flex min-h-15 shrink-0 items-center justify-end gap-2",
    "px-6 py-3",
    "border-t border-border bg-structure",
  ].join(" "),
});

interface ModalFooterProps extends ComponentPropsWithoutRef<"div"> {}

/**
 * Modal.Footer is the footer section of the modal.
 * Defaults to `flex items-center justify-end gap-2` (overridable via className).
 */
export function ModalFooter({
  children,
  className,
  ...props
}: ModalFooterProps) {
  return (
    <div data-budget-region="modal-footer" data-layer="medium" className={cn(modalFooterVariants(), className)} {...props}>
      {children}
    </div>
  );
}
