"use client";

import { format, isValid, parse } from "date-fns";
import type { Locale } from "date-fns";
import { inputValueAsString, useInputContext } from "../input/input.context";
import { DatePickerRoot } from "./date-picker.root";
import { DatePickerInput, DatePickerPopover } from "./date-picker";

const DATE_VALUE_FORMAT = "yyyy-MM-dd";

function parseInputDate(value: string): Date | null {
  if (!value) return null;
  const parsed = parse(value, DATE_VALUE_FORMAT, new Date());
  return isValid(parsed) ? parsed : null;
}

function serializeInputDate(date: Date | null): string {
  if (!date || !isValid(date)) return "";
  return format(date, DATE_VALUE_FORMAT);
}

interface DatePickerFieldProps {
  /** Placeholder shown when no date is selected */
  placeholder?: string;
  /** date-fns format string used only for display */
  format?: string;
  /** date-fns locale. When omitted, date-fns default (English) is used. */
  locale?: Locale;
  /** Min selectable date */
  minDate?: Date;
  /** Max selectable date */
  maxDate?: Date;
  /** Custom display formatter (overrides `format`) */
  formatFn?: (date: Date | null) => string;
  /** Additional CSS classes on the trigger */
  className?: string;
}

/**
 * DatePicker.Field is the form miolo: Root + Popover + Input in one piece.
 * `value`/`onChange` live on `Input.Root` only — the string contract is
 * ISO calendar date (`yyyy-MM-dd`), never a DOM event.
 *
 * @example
 * ```tsx
 * <Input.Root name="startDate" fullWidth value={date} onChange={setDate}>
 *   <Input.Label>Data de início</Input.Label>
 *   <Input.Box padding="none">
 *     <DatePicker.Field placeholder="dd/mm/yyyy" locale={ptBR} format="P" />
 *   </Input.Box>
 * </Input.Root>
 * ```
 */
export function DatePickerField({
  placeholder,
  format: displayFormat,
  locale,
  minDate,
  maxDate,
  formatFn,
  className,
}: DatePickerFieldProps) {
  const { id, name, value, onChange, disabled, setIsFocused } =
    useInputContext("DatePicker.Field");
  const stringValue = inputValueAsString(value);

  const dateValue = parseInputDate(stringValue);

  return (
    <>
      {name ? (
        <input type="hidden" name={name} value={stringValue} disabled={disabled} />
      ) : null}
      <DatePickerRoot
        value={dateValue}
        onChange={(date) => onChange(serializeInputDate(date))}
        disabled={disabled}
        format={displayFormat}
        locale={locale}
        minDate={minDate}
        maxDate={maxDate}
        onOpenChange={setIsFocused}
      >
        <DatePickerPopover>
          <DatePickerInput
            id={id}
            placeholder={placeholder}
            formatFn={formatFn}
            className={className}
          />
        </DatePickerPopover>
      </DatePickerRoot>
    </>
  );
}
