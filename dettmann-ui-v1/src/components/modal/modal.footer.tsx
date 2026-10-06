import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";

const modalFooterVariants = defineRecipe({
  base: [
    "flex items-center justify-end gap-2",
    "px-6 pt-4 pb-6",
    "border-t border-border",
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
    <div className={cn(modalFooterVariants(), className)} {...props}>
      {children}
    </div>
  );
}
