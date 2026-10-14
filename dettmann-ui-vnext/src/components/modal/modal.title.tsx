"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useModalContext } from "./modal.context";

const modalTitleVariants = defineRecipe({
  base: "font-semibold text-fg",
  variants: {
    /** `md` 18 px (default); `lg` 20 px, the name in a detail header. */
    size: { md: "text-lg", lg: "text-xl" },
  },
  defaultVariants: { size: "md" },
});

interface ModalTitleProps extends ComponentPropsWithoutRef<"h2"> {
  size?: "md" | "lg";
}

/**
 * Modal.Title is the title of the modal dialog.
 * It automatically sets the aria-labelledby for the modal.
 */
export function ModalTitle({
  children,
  className,
  size,
  ...props
}: ModalTitleProps) {
  const { titleId } = useModalContext("Title");

  return (
    <h2 id={titleId} className={cn(modalTitleVariants({ size }), className)} {...props}>
      {children}
    </h2>
  );
}
