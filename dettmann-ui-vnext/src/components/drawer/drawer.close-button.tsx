"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useDrawerContext } from "./drawer.context";

const drawerCloseButtonVariants = defineRecipe({
  base: [
    "inline-flex items-center justify-center",
    "h-8 w-8 rounded-lg",
    "text-fg-muted hover:text-fg",
    "hover:bg-hover",
    "transition-colors duration-fast",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  ].join(" "),
});

interface DrawerCloseButtonProps
  extends Omit<ComponentPropsWithoutRef<"button">, "type" | "onClick"> {}

/**
 * Drawer.CloseButton closes the drawer.
 */
export function DrawerCloseButton({
  className,
  "aria-label": ariaLabel = "Close",
  ...props
}: DrawerCloseButtonProps) {
  const { onOpenChange } = useDrawerContext("CloseButton");

  return (
    <button
      type="button"
      onClick={() => onOpenChange(false)}
      aria-label={ariaLabel}
      className={cn(drawerCloseButtonVariants(), className)}
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
