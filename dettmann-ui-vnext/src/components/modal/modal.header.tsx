import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";

const modalHeaderVariants = defineRecipe({
  base: [
    "flex items-center justify-between gap-4",
    "px-6 pt-6 pb-4",
    "border-b border-border",
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
    <div className={cn(modalHeaderVariants(), className)} {...props}>
      {children}
    </div>
  );
}
