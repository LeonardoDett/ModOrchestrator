import { createStrictContext } from "../../utils/create-strict-context";

export type InputValue = string | string[];

export function inputValueAsString(value: InputValue): string {
  return Array.isArray(value) ? "" : value;
}

export function inputValueAsArray(value: InputValue): string[] {
  return Array.isArray(value) ? value : [];
}

export interface InputContextValue {
  /** Unique ID for the input field */
  id: string;
  /** Name attribute for form submission */
  name?: string;
  /** Whether the input is disabled */
  disabled: boolean;
  /** Error state - can be boolean, message string, or null/empty to hide Input.Error */
  error: string | boolean | null;
  /** Whether the input should take full width */
  fullWidth: boolean;
  /** Current value (string for Field/Pin, string[] for MultiSelect) */
  value: InputValue;
  /** Callback when value changes — always extracted data, never a DOM event */
  onChange: (value: InputValue) => void;
  /** Whether the input has a value (for floating label) */
  hasValue: boolean;
  /** Whether the input is focused */
  isFocused: boolean;
  /** Set focus state */
  setIsFocused: (focused: boolean) => void;
  /** Whether there's a floating label */
  hasFloatingLabel: boolean;
  /** Register that there's a floating label */
  setHasFloatingLabel: (value: boolean) => void;
}

export const [InputProvider, useInputContext] =
  createStrictContext<InputContextValue>("Input");
