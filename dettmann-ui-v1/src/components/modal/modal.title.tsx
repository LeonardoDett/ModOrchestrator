"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useModalContext } from "./modal.context";

const modalTitleVariants = defineRecipe({
  base: "text-lg font-semibold text-fg",
});

interface ModalTitleProps extends ComponentPropsWithoutRef<"h2"> {}

/**
 * Modal.Title is the title of the modal dialog.
 * It automatically sets the aria-labelledby for the modal.
 */
export function ModalTitle({
  children,
  className,
  ...props
}: ModalTitleProps) {
  const { titleId } = useModalContext("Title");

  return (
    <h2 id={titleId} className={cn(modalTitleVariants(), className)} {...props}>
      {children}
    </h2>
  );
}
