"use client";

import { type ReactNode, type ComponentPropsWithoutRef } from "react";
import { cn } from "../../utils/cn";
import { useAccordionContext } from "./accordion.context";

interface AccordionItemProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
  /** Value of this accordion item */
  value: string;
}

/**
 * Accordion.Item is a container for trigger and content.
 */
export function AccordionItem({ children, value, className, ...props }: AccordionItemProps) {
  const { value: openValue } = useAccordionContext("Item");
  const isOpen = Array.isArray(openValue) ? openValue.includes(value) : openValue === value;

  return (
    <div
      data-value={value}
      data-state={isOpen ? "open" : "closed"}
      className={cn("border border-border rounded-lg overflow-hidden", className)}
      {...props}
    >
      {children}
    </div>
  );
}
