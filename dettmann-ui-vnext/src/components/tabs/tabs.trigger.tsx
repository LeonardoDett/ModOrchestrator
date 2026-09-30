"use client";

import { useEffect, useRef, type ComponentPropsWithoutRef, type KeyboardEvent } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useTabsContext } from "./tabs.context";

const tabsTriggerVariants = defineRecipe({
  base: [
    "inline-flex items-center justify-center whitespace-nowrap px-4 py-2",
    "text-sm font-medium transition-colors duration-fast",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-page",
    "disabled:pointer-events-none disabled:bg-muted disabled:text-fg-subtle",
  ].join(" "),
  variants: {
    active: {
      true: "",
      false: "",
    },
    orientation: {
      horizontal: "",
      vertical: "justify-start w-full",
    },
    variant: {
      underline: "",
      segmented: "rounded-md",
    },
  },
  compoundVariants: [
    {
      variant: "underline",
      orientation: "horizontal",
      class: "border-b-2 -mb-px",
    },
    {
      variant: "underline",
      orientation: "vertical",
      class: "border-r-2 -mr-px",
    },
    {
      variant: "underline",
      active: true,
      class: "text-secondary-text border-secondary",
    },
    {
      variant: "underline",
      active: false,
      class: "text-fg-muted border-transparent hover:bg-hover hover:text-fg",
    },
    {
      variant: "segmented",
      active: true,
      class: "bg-secondary-subtle text-secondary-text shadow-xs",
    },
    {
      variant: "segmented",
      active: false,
      class: "text-fg-muted hover:bg-hover hover:text-fg",
    },
  ],
  defaultVariants: {
    active: false,
    orientation: "horizontal",
    variant: "underline",
  },
});

type TabsTriggerVariants = VariantProps<typeof tabsTriggerVariants>;

interface TabsTriggerProps
  extends Omit<ComponentPropsWithoutRef<"button">, "value">,
    Omit<TabsTriggerVariants, "active"> {
  /** Value of this tab */
  value: string;
}

/**
 * Tabs.Trigger is a clickable tab header with keyboard navigation.
 */
export function TabsTrigger({ value, className, ...props }: TabsTriggerProps) {
  const { value: activeValue, onChange, orientation, variant, registerTrigger, unregisterTrigger, handleRovingKeyDown } =
    useTabsContext("Trigger");
  const ref = useRef<HTMLButtonElement>(null);
  const isActive = activeValue === value;

  useEffect(() => {
    registerTrigger(value, ref.current);
    return () => unregisterTrigger(value);
  }, [value, registerTrigger, unregisterTrigger]);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const nextValue = handleRovingKeyDown(value, e);
    if (nextValue) {
      onChange(nextValue);
    }
  };

  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={`panel-${value}`}
      id={`trigger-${value}`}
      tabIndex={isActive ? 0 : -1}
      onClick={() => onChange(value)}
      onKeyDown={handleKeyDown}
      className={cn(tabsTriggerVariants({ active: isActive, orientation, variant }), className)}
      {...props}
    />
  );
}
