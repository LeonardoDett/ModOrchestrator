"use client";

import { useId, useState, type ReactNode } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useControllableState } from "../../hooks/use-controllable-state";
import { InputProvider, type InputContextValue, type InputValue } from "./input.context";

const inputRootVariants = defineRecipe({
  base: "relative flex flex-col gap-1.5",
  variants: {
    fullWidth: {
      true: "w-full",
      false: "w-auto",
    },
  },
  defaultVariants: {
    fullWidth: false,
  },
});

type InputRootVariants = VariantProps<typeof inputRootVariants>;

type InputRootShared = InputRootVariants & {
  children: ReactNode;
  /** Name attribute for form submission */
  name?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Error state - can be boolean, message string, or null/empty to hide Input.Error */
  error?: string | boolean | null;
  /** Additional CSS classes */
  className?: string;
};

export type InputRootProps =
  | (InputRootShared & {
      value?: string;
      defaultValue?: string;
      onChange?: (value: string) => void;
    })
  | (InputRootShared & {
      value?: string[];
      defaultValue?: string[];
      onChange?: (value: string[]) => void;
    });

/**
 * Input.Root is the container for all Input components.
 * It provides context for the entire Input family.
 *
 * @example
 * ```tsx
 * <Input.Root name="email" fullWidth error="Invalid email">
 *   <Input.Label>Email</Input.Label>
 *   <Input.Box>
 *     <Input.Field type="email" />
 *   </Input.Box>
 *   <Input.Error />
 * </Input.Root>
 * ```
 */
export function InputRoot({
  children,
  name,
  disabled = false,
  error = false,
  value: controlledValue,
  defaultValue = "",
  onChange,
  fullWidth = false,
  className,
}: InputRootProps) {
  const generatedId = useId();
  const id = name ? `input-${name}` : generatedId;

  const [value, setValue] = useControllableState<InputValue>({
    value: controlledValue,
    defaultValue,
    onChange: onChange as ((value: InputValue) => void) | undefined,
  });

  const [isFocused, setIsFocused] = useState(false);
  const [hasFloatingLabel, setHasFloatingLabel] = useState(false);

  const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value?.length);

  const contextValue: InputContextValue = {
    id,
    name,
    disabled,
    error,
    fullWidth: fullWidth ?? false,
    value,
    onChange: setValue,
    hasValue,
    isFocused,
    setIsFocused,
    hasFloatingLabel,
    setHasFloatingLabel,
  };

  return (
    <InputProvider value={contextValue}>
      <div className={cn(inputRootVariants({ fullWidth }), className)}>
        {children}
      </div>
    </InputProvider>
  );
}
