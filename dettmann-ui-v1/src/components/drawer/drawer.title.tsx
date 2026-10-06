"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useDrawerContext } from "./drawer.context";

const drawerTitleVariants = defineRecipe({
  base: "text-lg font-semibold text-fg",
});

interface DrawerTitleProps extends ComponentPropsWithoutRef<"h2"> {}

/**
 * Drawer.Title sets aria-labelledby for the drawer dialog.
 */
export function DrawerTitle({
  children,
  className,
  ...props
}: DrawerTitleProps) {
  const { titleId } = useDrawerContext("Title");

  return (
    <h2 id={titleId} className={cn(drawerTitleVariants(), className)} {...props}>
      {children}
    </h2>
  );
}
