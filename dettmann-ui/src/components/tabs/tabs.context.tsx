"use client";

import type { KeyboardEvent } from "react";
import { createStrictContext } from "../../utils/create-strict-context";

export interface TabsContextValue {
  /** Current active tab value */
  value: string;
  /** Change active tab */
  onChange: (value: string) => void;
  /** Orientation of tabs */
  orientation: "horizontal" | "vertical";
  /** Visual style */
  variant: "underline" | "segmented";
  /** Density: `sm` are the 38 px tabs of a header band */
  size: "md" | "sm";
  /** Register tab trigger for roving tabindex */
  registerTrigger: (value: string, element: HTMLElement | null) => void;
  /** Unregister tab trigger */
  unregisterTrigger: (value: string) => void;
  /** Move focus between triggers; returns the next value when focus moved */
  handleRovingKeyDown: (currentValue: string, event: KeyboardEvent) => string | null;
}

export const [TabsProvider, useTabsContext] =
  createStrictContext<TabsContextValue>("Tabs");
