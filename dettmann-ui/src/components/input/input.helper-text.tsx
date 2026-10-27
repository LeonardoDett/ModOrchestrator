"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useInputContext } from "./input.context";

const inputHelperTextVariants = defineRecipe({
  base: "text-xs text-fg-muted",
  variants: {
    disabled: {
      true: "text-fg-subtle",
      false: "",
    },
  },
  defaultVariants: {
    disabled: false,
  },
});

interface InputHelperTextProps extends ComponentPropsWithoutRef<"p"> {}

/**
 * Input.HelperText displays additional information below the input.
 * It's hidden when there's an error (Input.Error takes precedence).
 *
 * @example
 * ```tsx
 * <Input.HelperText>Enter your full legal name</Input.HelperText>
 * ```
 */
export function InputHelperText({
  children,
  className,
  ...props
}: InputHelperTextProps) {
  const { error, disabled } = useInputContext("HelperText");

  // Hide helper text when there's an error
  if (error) {
    return null;
  }

  return (
    <p
      className={cn(inputHelperTextVariants({ disabled }), className)}
      {...props}
    >
      {children}
    </p>
  );
}
