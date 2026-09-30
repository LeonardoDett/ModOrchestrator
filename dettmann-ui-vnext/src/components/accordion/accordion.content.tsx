"use client";

import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../../utils/cn";
import { useAccordionContext } from "./accordion.context";

interface AccordionContentProps extends Omit<ComponentPropsWithoutRef<"div">, "value"> {
  /** Value of the accordion item this content belongs to */
  value: string;
}

/**
 * Accordion.Content shows the content when item is open.
 */
export function AccordionContent({ value, className, children, ...props }: AccordionContentProps) {
  const { value: openValue } = useAccordionContext("Content");
  const isOpen = Array.isArray(openValue) ? openValue.includes(value) : openValue === value;

  if (!isOpen) return null;

  return (
    <div
      id={`content-${value}`}
      role="region"
      aria-labelledby={`trigger-${value}`}
      className={cn("px-4 py-3 text-sm", className)}
      {...props}
    >
      {children}
    </div>
  );
}
