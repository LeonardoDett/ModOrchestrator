"use client";

import { type ReactNode } from "react";
import { useControllableState } from "../../hooks/use-controllable-state";
import { useRovingTabindex } from "../../hooks/use-roving-tabindex";
import { TabsProvider } from "./tabs.context";

interface TabsRootProps {
  children: ReactNode;
  /** Controlled value */
  value?: string;
  /** Default value */
  defaultValue?: string;
  /** Callback when value changes */
  onValueChange?: (value: string) => void;
  /** Orientation */
  orientation?: "horizontal" | "vertical";
  /** Visual style — `segmented` is Untitled-style compact control */
  variant?: "underline" | "segmented";
}

/**
 * Tabs.Root provides context for the tabs component.
 *
 * @example
 * ```tsx
 * <Tabs.Root defaultValue="tab1">
 *   <Tabs.List>
 *     <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
 *     <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
 *   </Tabs.List>
 *   <Tabs.Panel value="tab1">Content 1</Tabs.Panel>
 *   <Tabs.Panel value="tab2">Content 2</Tabs.Panel>
 * </Tabs.Root>
 * ```
 */
export function TabsRoot({
  children,
  value: controlledValue,
  defaultValue = "",
  onValueChange,
  orientation = "horizontal",
  variant = "underline",
}: TabsRootProps) {
  const [value, setValue] = useControllableState({
    value: controlledValue,
    defaultValue,
    onChange: onValueChange,
  });

  const { register, unregister, handleKeyDown } = useRovingTabindex({
    orientation,
    loop: true,
  });

  return (
    <TabsProvider
      value={{
        value,
        onChange: setValue,
        orientation,
        variant,
        registerTrigger: register,
        unregisterTrigger: unregister,
        handleRovingKeyDown: handleKeyDown,
      }}
    >
      {children}
    </TabsProvider>
  );
}
