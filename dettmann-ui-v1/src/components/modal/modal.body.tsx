"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useModalContext } from "./modal.context";

const modalBodyVariants = defineRecipe({
  base: "flex-1 overflow-y-auto px-6 py-4 text-fg",
});

interface ModalBodyProps extends ComponentPropsWithoutRef<"div"> {}

/**
 * Modal.Body is the main content area of the modal.
 * It's scrollable if content exceeds the available height.
 */
export function ModalBody({
  children,
  className,
  ...props
}: ModalBodyProps) {
  const { descriptionId } = useModalContext("Body");

  return (
    <div
      id={descriptionId}
      className={cn(modalBodyVariants(), className)}
      {...props}
    >
      {children}
    </div>
  );
}
