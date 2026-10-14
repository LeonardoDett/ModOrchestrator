import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";

const modalHeaderVariants = defineRecipe({
  base: [
    "flex shrink-0 items-center justify-between gap-4",
    "px-6 pt-5 pb-4",
    // D-040: header and footer are structure bands around the raised body (boards).
    "border-b border-border bg-structure",
  ].join(" "),
});

interface ModalHeaderProps extends ComponentPropsWithoutRef<"div"> {}

/**
 * Modal.Header is the header section of the modal.
 * Typically contains the title and close button.
 */
export function ModalHeader({
  children,
  className,
  ...props
}: ModalHeaderProps) {
  return (
    <div data-layer="medium" className={cn(modalHeaderVariants(), className)} {...props}>
      {children}
    </div>
  );
}
