import type { ComponentProps } from "react";
import { describe, it, expect } from "vitest";
import { Input } from "../components/input";
import { DatePicker } from "../components/date-picker";

type FieldProps = ComponentProps<typeof Input.Field>;
type SelectProps = ComponentProps<typeof Input.Select>;
type ComboboxProps = ComponentProps<typeof Input.Combobox>;
type MultiSelectProps = ComponentProps<typeof Input.MultiSelect>;
type PinProps = ComponentProps<typeof Input.Pin>;
type TextareaProps = ComponentProps<typeof Input.Textarea>;
type RootProps = ComponentProps<typeof Input.Root>;
type DatePickerFieldProps = ComponentProps<typeof DatePicker.Field>;

type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;
type ExpectFalse<T extends false> = T;

type _FieldNoValue = ExpectFalse<HasKey<FieldProps, "value">>;
type _FieldNoOnChange = ExpectFalse<HasKey<FieldProps, "onChange">>;
type _SelectNoValue = ExpectFalse<HasKey<SelectProps, "value">>;
type _SelectNoOnChange = ExpectFalse<HasKey<SelectProps, "onChange">>;
type _ComboboxNoValue = ExpectFalse<HasKey<ComboboxProps, "value">>;
type _ComboboxNoOnChange = ExpectFalse<HasKey<ComboboxProps, "onChange">>;
type _MultiSelectNoValue = ExpectFalse<HasKey<MultiSelectProps, "value">>;
type _MultiSelectNoOnChange = ExpectFalse<HasKey<MultiSelectProps, "onChange">>;
type _PinNoValue = ExpectFalse<HasKey<PinProps, "value">>;
type _PinNoOnChange = ExpectFalse<HasKey<PinProps, "onChange">>;
type _TextareaNoValue = ExpectFalse<HasKey<TextareaProps, "value">>;
type _TextareaNoOnChange = ExpectFalse<HasKey<TextareaProps, "onChange">>;
type _DatePickerFieldNoValue = ExpectFalse<HasKey<DatePickerFieldProps, "value">>;
type _DatePickerFieldNoOnChange = ExpectFalse<HasKey<DatePickerFieldProps, "onChange">>;

type _RootHasValue = HasKey<RootProps, "value">;
type _RootHasOnChange = HasKey<RootProps, "onChange">;

/**
 * Compile-time lock: miolos must not accept value/onChange.
 * If a miolo starts inheriting those props again, this file fails `tsc`.
 */
export type InputMioloTypeChecks = [
  _FieldNoValue,
  _FieldNoOnChange,
  _SelectNoValue,
  _SelectNoOnChange,
  _ComboboxNoValue,
  _ComboboxNoOnChange,
  _MultiSelectNoValue,
  _MultiSelectNoOnChange,
  _PinNoValue,
  _PinNoOnChange,
  _TextareaNoValue,
  _TextareaNoOnChange,
  _DatePickerFieldNoValue,
  _DatePickerFieldNoOnChange,
];

describe("Input miolo public types", () => {
  it("keeps value/onChange on Root only", () => {
    const rootHasValue: _RootHasValue = true;
    const rootHasOnChange: _RootHasOnChange = true;
    expect(rootHasValue).toBe(true);
    expect(rootHasOnChange).toBe(true);
  });
});
