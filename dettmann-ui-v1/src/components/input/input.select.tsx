"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { inputValueAsString, useInputContext } from "./input.context";
import type { InputRootOwnedNativeProps } from "./input.owned-props";

const inputSelectVariants = defineRecipe({
  base: [
    "w-full flex-1",
    "bg-transparent",
    "text-fg text-sm",
    "outline-none appearance-none",
    "cursor-pointer",
    "disabled:cursor-not-allowed",
  ].join(" "),
});

export interface SelectOption {
  /** Option value */
  value: string;
  /** Option display label */
  label: string;
  /** Whether the option is disabled */
  disabled?: boolean;
}

interface InputSelectProps
  extends Omit<ComponentPropsWithoutRef<"select">, InputRootOwnedNativeProps> {
  /** Array of options */
  options: SelectOption[];
  /** Placeholder text (shown as first disabled option) */
  placeholder?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Input.Select is a native select element styled to match the Input family.
 * `value`/`onChange` live on `Input.Root` only — this miolo reads them from context
 * and forwards a plain string (never the DOM event).
 *
 * @example
 * ```tsx
 * <Input.Root name="country" value={country} onChange={setCountry}>
 *   <Input.Select
 *     options={[
 *       { value: "opt1", label: "Option 1" },
 *       { value: "opt2", label: "Option 2" },
 *     ]}
 *     placeholder="Select an option"
 *   />
 * </Input.Root>
 * ```
 */
export function InputSelect({
  options,
  placeholder,
  className,
  onFocus,
  onBlur,
  ...props
}: InputSelectProps) {
  const { id, name, disabled, value, onChange, setIsFocused, hasFloatingLabel, hasValue, isFocused } = useInputContext("Select");
  const stringValue = inputValueAsString(value);

  const handleFocus = (e: React.FocusEvent<HTMLSelectElement>) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLSelectElement>) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  // When floating label is covering and no value selected, make text transparent
  const hideText = hasFloatingLabel && !hasValue && !isFocused;

  return (
    <select
      {...props}
      id={id}
      name={name}
      disabled={disabled}
      value={stringValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={cn(
        inputSelectVariants(),
        hideText && "text-transparent",
        className
      )}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
