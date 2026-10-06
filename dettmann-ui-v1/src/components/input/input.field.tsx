"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { inputValueAsString, useInputContext } from "./input.context";
import type { InputRootOwnedNativeProps } from "./input.owned-props";

const inputFieldVariants = defineRecipe({
  base: [
    "w-full flex-1",
    "bg-transparent",
    "text-fg text-sm",
    "placeholder:text-fg-subtle",
    "outline-none",
    "disabled:cursor-not-allowed",
  ].join(" "),
});

interface InputFieldProps
  extends Omit<ComponentPropsWithoutRef<"input">, InputRootOwnedNativeProps> {
  /** Additional CSS classes */
  className?: string;
}

/**
 * Input.Field is the actual input element.
 * `value`/`onChange` live on `Input.Root` only — this miolo reads them from context
 * and forwards a plain string (never the DOM event).
 *
 * @example
 * ```tsx
 * <Input.Root name="email" value={email} onChange={setEmail}>
 *   <Input.Field type="email" placeholder="Enter your email" />
 * </Input.Root>
 * ```
 */
export function InputField({ className, onFocus, onBlur, placeholder, ...props }: InputFieldProps) {
  const { id, name, disabled, value, onChange, setIsFocused, hasFloatingLabel, hasValue, isFocused } = useInputContext("Field");
  const stringValue = inputValueAsString(value);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  // Hide placeholder when floating label is covering the input
  const showPlaceholder = !hasFloatingLabel || hasValue || isFocused;
  const effectivePlaceholder = showPlaceholder ? placeholder : undefined;

  return (
    <input
      {...props}
      id={id}
      name={name}
      disabled={disabled}
      value={stringValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={effectivePlaceholder}
      className={cn(inputFieldVariants(), className)}
    />
  );
}
