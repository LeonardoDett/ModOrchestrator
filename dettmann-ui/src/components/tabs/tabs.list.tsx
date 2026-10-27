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
      segmented: "rounded-control bg-sunken p-1",
    },
    size: { md: "", sm: "" },
  },
  compoundVariants: [
    {
      variant: "underline",
      orientation: "horizontal",
      size: "md",
      class: "items-end border-b border-border",
    },
    {
      variant: "underline",
      orientation: "horizontal",
      size: "sm",
      class: "items-end",
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
    size: "md",
  },
});

interface TabsListProps extends ComponentPropsWithoutRef<"div"> {}

/**
 * Tabs.List is the container for tab triggers.
 */
export function TabsList({ className, ...props }: TabsListProps) {
  const { orientation, variant, size } = useTabsContext("List");

  return (
    <div
      role="tablist"
      data-layer="medium"
      aria-orientation={orientation}
      className={cn(tabsListVariants({ orientation, variant, size }), className)}
      {...props}
    />
  );
}
