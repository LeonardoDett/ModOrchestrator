"use client";

import type { KeyboardEvent } from "react";
import { createStrictContext } from "../../utils/create-strict-context";

export interface AccordionContextValue {
  /** Current open items (array for multiple, string for single) */
  value: string | string[];
  /** Toggle an item */
  toggleItem: (value: string) => void;
  /** Whether multiple items can be open */
  multiple: boolean;
  /** Register trigger for keyboard navigation */
  registerTrigger: (value: string, element: HTMLElement | null) => void;
  /** Unregister trigger */
  unregisterTrigger: (value: string) => void;
  /** Move focus between triggers */
  handleRovingKeyDown: (currentValue: string, event: KeyboardEvent) => string | null;
}

export const [AccordionProvider, useAccordionContext] =
  createStrictContext<AccordionContextValue>("Accordion");
