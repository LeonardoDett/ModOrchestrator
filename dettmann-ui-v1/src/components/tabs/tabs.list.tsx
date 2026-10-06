"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useTabsContext } from "./tabs.context";

const tabsListVariants = defineRecipe({
  base: "flex gap-1",
  variants: {
    orientation: {
      horizontal: "flex-row",
      vertical: "flex-col",
    },
    variant: {
      underline: "",
      segmented: "rounded-lg bg-muted p-1",
    },
  },
  compoundVariants: [
    {
      variant: "underline",
      orientation: "horizontal",
      class: "items-end border-b border-border",
    },
    {
      variant: "underline",
      orientation: "vertical",
      class: "items-stretch border-r border-border",
    },
  ],
  defaultVariants: {
    orientation: "horizontal",
    variant: "underline",
  },
});

interface TabsListProps extends ComponentPropsWithoutRef<"div"> {}

/**
 * Tabs.List is the container for tab triggers.
 */
export function TabsList({ className, ...props }: TabsListProps) {
  const { orientation, variant } = useTabsContext("List");

  return (
    <div
      role="tablist"
      aria-orientation={orientation}
      className={cn(tabsListVariants({ orientation, variant }), className)}
      {...props}
    />
  );
}
