"use client";

import {
  cloneElement,
  type ReactElement,
  type ComponentPropsWithoutRef,
} from "react";
import { format as formatDate } from "date-fns";
import { useDatePickerContext } from "./date-picker.context";

interface DatePickerTriggerProps {
  children: ReactElement<ComponentPropsWithoutRef<"button"> & { ref?: React.Ref<HTMLButtonElement> }>;
  /** Custom format function */
  formatFn?: (date: Date | null) => string;
  /** Ref callback for floating-ui (set by Panel) */
  setReference?: (node: HTMLButtonElement | null) => void;
  /** Props from floating interactions */
  referenceProps?: Record<string, unknown>;
}

/**
 * DatePicker.Trigger wraps a child element to toggle the date picker panel.
 *
 * @example
 * ```tsx
 * <DatePicker.Trigger>
 *   <Button>{formattedDate || "Select date"}</Button>
 * </DatePicker.Trigger>
 * ```
 */
export function DatePickerTrigger({
  children,
  formatFn,
  setReference,
  referenceProps = {},
}: DatePickerTriggerProps) {
  const { value, isOpen, setIsOpen, disabled, format, locale } = useDatePickerContext("Trigger");

  const displayValue = formatFn
    ? formatFn(value)
    : value
    ? formatDate(value, format, locale ? { locale } : undefined)
    : "";

  const handleClick = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  const childProps = children.props as { className?: string; onClick?: () => void };

  return cloneElement(
    children,
    {
      ref: setReference,
      onClick: handleClick,
      disabled,
      "aria-expanded": isOpen,
      "aria-haspopup": "dialog",
      "data-value": displayValue,
      ...childProps,
      ...referenceProps,
    } as ComponentPropsWithoutRef<"button">
  );
}
