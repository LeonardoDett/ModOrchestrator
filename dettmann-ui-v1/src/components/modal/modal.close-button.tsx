"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useModalContext } from "./modal.context";

const modalCloseButtonVariants = defineRecipe({
  base: [
    "inline-flex items-center justify-center",
    "h-8 w-8 rounded-lg",
    "text-fg-muted hover:text-fg",
    "hover:bg-hover",
    "transition-colors duration-fast",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  ].join(" "),
});

interface ModalCloseButtonProps
  extends Omit<ComponentPropsWithoutRef<"button">, "type" | "onClick"> {}

/**
 * Modal.CloseButton is a button to close the modal.
 * Uses an X icon via SVG (no external icon library).
 */
export function ModalCloseButton({
  className,
  "aria-label": ariaLabel = "Close",
  ...props
}: ModalCloseButtonProps) {
  const { onOpenChange } = useModalContext("CloseButton");

  return (
    <button
      type="button"
      onClick={() => onOpenChange(false)}
      aria-label={ariaLabel}
      className={cn(modalCloseButtonVariants(), className)}
      {...props}
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}
