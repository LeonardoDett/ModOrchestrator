"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useModalContext } from "./modal.context";
import { XIcon } from "../../icons/glyphs/x";

const modalCloseButtonVariants = defineRecipe({
  base: [
    "inline-flex items-center justify-center",
    "h-8 w-8 rounded-control",
    "text-fg-muted hover:text-fg",
    "hover:bg-state-hover",
    "motion-transition",
    "focus-ring",
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
      <XIcon size="sm" />
    </button>
  );
}
