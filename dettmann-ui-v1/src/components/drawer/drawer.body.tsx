"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useDrawerContext } from "./drawer.context";

const drawerBodyVariants = defineRecipe({
  base: "flex-1 overflow-y-auto px-6 py-4 text-fg",
});

interface DrawerBodyProps extends ComponentPropsWithoutRef<"div"> {}

/**
 * Drawer.Body is the scrollable main content area.
 */
export function DrawerBody({
  children,
  className,
  ...props
}: DrawerBodyProps) {
  const { descriptionId } = useDrawerContext("Body");

  return (
    <div
      id={descriptionId}
      className={cn(drawerBodyVariants(), className)}
      {...props}
    >
      {children}
    </div>
  );
}
