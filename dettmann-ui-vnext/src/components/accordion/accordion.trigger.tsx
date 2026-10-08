"use client";

import { useEffect, useRef, type ComponentPropsWithoutRef, type KeyboardEvent } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useAccordionContext } from "./accordion.context";
import { ChevronDownIcon } from "../../icons/glyphs/chevron-down";

const accordionTriggerVariants = defineRecipe({
  base: [
    "flex w-full items-center justify-between px-4 py-3",
    "text-sm font-medium text-left",
    "hover:bg-state-hover motion-transition",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
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
      <ChevronDownIcon
        size="sm"
        className={cn(
          "shrink-0 transition-transform duration-(--motion-duration) ease-(--motion-ease)",
          isOpen && "rotate-180"
        )}
      />
    </button>
  );
}
