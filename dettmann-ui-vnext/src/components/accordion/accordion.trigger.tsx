"use client";

import { useEffect, useRef, type ComponentPropsWithoutRef, type KeyboardEvent } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useAccordionContext } from "./accordion.context";

const accordionTriggerVariants = defineRecipe({
  base: [
    "flex w-full items-center justify-between px-4 py-3",
    "text-sm font-medium text-left",
    "hover:bg-hover transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-page",
  ].join(" "),
});

type AccordionTriggerVariants = VariantProps<typeof accordionTriggerVariants>;

interface AccordionTriggerProps
  extends Omit<ComponentPropsWithoutRef<"button">, "value">,
    AccordionTriggerVariants {
  /** Value of the accordion item this trigger controls */
  value: string;
}

/**
 * Accordion.Trigger toggles the accordion item.
 */
export function AccordionTrigger({ value, className, children, ...props }: AccordionTriggerProps) {
  const { value: openValue, toggleItem, registerTrigger, unregisterTrigger, handleRovingKeyDown } =
    useAccordionContext("Trigger");
  const ref = useRef<HTMLButtonElement>(null);
  const isOpen = Array.isArray(openValue) ? openValue.includes(value) : openValue === value;

  useEffect(() => {
    registerTrigger(value, ref.current);
    return () => unregisterTrigger(value);
  }, [value, registerTrigger, unregisterTrigger]);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    handleRovingKeyDown(value, e);
  };

  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={isOpen}
      aria-controls={`content-${value}`}
      onClick={() => toggleItem(value)}
      onKeyDown={handleKeyDown}
      className={cn(accordionTriggerVariants(), className)}
      {...props}
    >
      {children}
      <svg
        className={cn(
          "h-4 w-4 shrink-0 transition-transform duration-200",
          isOpen && "rotate-180"
        )}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}
