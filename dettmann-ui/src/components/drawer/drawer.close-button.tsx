"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useDrawerContext } from "./drawer.context";
import { XIcon } from "../../icons/glyphs/x";

const drawerCloseButtonVariants = defineRecipe({
  base: [
    "inline-flex items-center justify-center",
    "h-8 w-8 rounded-control",
    "text-fg-muted hover:text-fg",
    "hover:bg-state-hover",
    "motion-transition",
    "focus-ring",
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
      <XIcon size="sm" />
    </button>
  );
}
