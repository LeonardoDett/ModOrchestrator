"use client";

import { useState, type ReactNode } from "react";
import { startOfMonth } from "date-fns";
import type { Locale } from "date-fns";
import { useControllableState } from "../../hooks/use-controllable-state";
import { DatePickerProvider, type DatePickerContextValue } from "./date-picker.context";

interface DatePickerRootProps {
  children: ReactNode;
  /** Controlled value */
  value?: Date | null;
  /** Default value */
  defaultValue?: Date | null;
  /** Callback when value changes */
  onChange?: (date: Date | null) => void;
  /** Min selectable date */
  minDate?: Date;
  /** Max selectable date */
  maxDate?: Date;
  /** Disabled state */
  disabled?: boolean;
  /** Date format string (date-fns format) */
  format?: string;
  /** date-fns locale. When omitted, date-fns default (English) is used. */
  locale?: Locale;
  /** Called when the calendar opens or closes */
  onOpenChange?: (open: boolean) => void;
}

/**
 * DatePicker.Root provides context for the date picker.
 *
 * @example
 * ```tsx
 * <DatePicker.Root value={date} onChange={setDate}>
 *   <DatePicker.Trigger>
 *     <Button>Pick date</Button>
 *   </DatePicker.Trigger>
 *   <DatePicker.Panel />
 * </DatePicker.Root>
 * ```
 */
export function DatePickerRoot({
  children,
  value: controlledValue,
  defaultValue = null,
  onChange,
  minDate,
  maxDate,
  disabled = false,
  format = "PP",
  locale,
  onOpenChange,
}: DatePickerRootProps) {
  const [value, setValue] = useControllableState<Date | null>({
    value: controlledValue,
    defaultValue,
    onChange,
  });

  const [isOpen, setIsOpenState] = useState(false);
  const setIsOpen = (open: boolean) => {
    setIsOpenState(open);
    onOpenChange?.(open);
  };
  const [viewDate, setViewDate] = useState(() => 
    startOfMonth(value ?? new Date())
  );

  const contextValue: DatePickerContextValue = {
    value,
    onChange: setValue,
    viewDate,
    setViewDate,
    isOpen,
    setIsOpen,
    minDate,
    maxDate,
    disabled,
    format,
    locale,
  };

  return (
    <DatePickerProvider value={contextValue}>
      {children}
    </DatePickerProvider>
  );
}
