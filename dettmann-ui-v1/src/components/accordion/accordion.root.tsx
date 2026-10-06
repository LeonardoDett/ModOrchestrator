"use client";

import { useCallback, type ReactNode, type ComponentPropsWithoutRef } from "react";
import { useControllableState } from "../../hooks/use-controllable-state";
import { useRovingTabindex } from "../../hooks/use-roving-tabindex";
import { AccordionProvider } from "./accordion.context";
import { cn } from "../../utils/cn";

interface AccordionRootProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
  /** Controlled value (single or multiple) */
  value?: string | string[];
  /** Default value */
  defaultValue?: string | string[];
  /** Callback when value changes */
  onValueChange?: (value: string | string[]) => void;
  /** Allow multiple items open */
  multiple?: boolean;
}

/**
 * Accordion.Root provides context for accordion items.
 *
 * @example
 * ```tsx
 * <Accordion.Root defaultValue="item1">
 *   <Accordion.Item value="item1">
 *     <Accordion.Trigger>Title 1</Accordion.Trigger>
 *     <Accordion.Content>Content 1</Accordion.Content>
 *   </Accordion.Item>
 * </Accordion.Root>
 * ```
 */
export function AccordionRoot({
  children,
  value: controlledValue,
  defaultValue,
  onValueChange,
  multiple = false,
  className,
  ...props
}: AccordionRootProps) {
  const [value, setValue] = useControllableState<string | string[]>({
    value: controlledValue,
    defaultValue: defaultValue ?? (multiple ? [] : ""),
    onChange: onValueChange,
  });

  const { register, unregister, handleKeyDown } = useRovingTabindex({
    orientation: "vertical",
    loop: true,
  });

  const toggleItem = useCallback(
    (itemValue: string) => {
      if (multiple) {
        const currentValue = Array.isArray(value) ? value : [];
        const newValue = currentValue.includes(itemValue)
          ? currentValue.filter((v) => v !== itemValue)
          : [...currentValue, itemValue];
        setValue(newValue);
      } else {
        setValue(value === itemValue ? "" : itemValue);
      }
    },
    [value, setValue, multiple]
  );

  return (
    <AccordionProvider
      value={{
        value,
        toggleItem,
        multiple,
        registerTrigger: register,
        unregisterTrigger: unregister,
        handleRovingKeyDown: handleKeyDown,
      }}
    >
      <div className={cn("space-y-2", className)} {...props}>
        {children}
      </div>
    </AccordionProvider>
  );
}
