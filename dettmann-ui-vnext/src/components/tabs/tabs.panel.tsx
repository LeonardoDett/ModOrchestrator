"use client";

import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../../utils/cn";
import { useTabsContext } from "./tabs.context";

interface TabsPanelProps extends Omit<ComponentPropsWithoutRef<"div">, "value"> {
  /** Value of the tab this panel corresponds to */
  value: string;
}

/**
 * Tabs.Panel shows content for the active tab.
 */
export function TabsPanel({ value, className, ...props }: TabsPanelProps) {
  const { value: activeValue } = useTabsContext("Panel");
  const isActive = activeValue === value;

  if (!isActive) return null;

  return (
    <div
      role="tabpanel"
      id={`panel-${value}`}
      aria-labelledby={`trigger-${value}`}
      className={cn("py-4", className)}
      {...props}
    />
  );
}
