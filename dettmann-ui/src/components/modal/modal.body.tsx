"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useModalContext } from "./modal.context";

const modalBodyVariants = defineRecipe({
  base: "flex-1 text-fg",
  variants: {
    /** `md` (default): padded, scrolls. `none`: the screen lays out its own columns and scrolls (boards). */
    padding: {
      md: "overflow-y-auto px-6 py-4",
      none: "min-h-0 overflow-hidden",
    },
  },
  defaultVariants: { padding: "md" },
});

interface ModalBodyProps extends ComponentPropsWithoutRef<"div"> {
  padding?: "md" | "none";
}

/**
 * Modal.Body is the main content area of the modal.
 * It's scrollable if content exceeds the available height.
 */
export function ModalBody({
  children,
  className,
  padding,
  ...props
}: ModalBodyProps) {
  const { descriptionId } = useModalContext("Body");

  return (
    <div
      id={descriptionId}
      className={cn(modalBodyVariants({ padding }), className)}
      {...props}
    >
      {children}
    </div>
  );
}
