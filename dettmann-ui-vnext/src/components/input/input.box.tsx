"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useInputContext } from "./input.context";

const inputBoxVariants = defineRecipe({
  base: [
    "relative flex items-center",
    "rounded-lg",
    "bg-surface border border-border-strong shadow-xs",
    "transition-colors duration-fast ease-default",
    "has-[:is(textarea)]:items-start",
  ].join(" "),
  variants: {
    /** Horizontal/vertical padding. `none` for miolos that bring their own (DatePicker). */
    padding: {
      none: "p-0",
      sm: "px-2.5 py-1.5",
      md: "px-3.5 py-2.5",
      lg: "px-4 py-3",
    },
    /** Focus state */
    focused: {
      true: "",
      false: "",
    },
    /** Disabled state */
    disabled: {
      true: "bg-muted text-fg-subtle shadow-none cursor-not-allowed",
      false: "hover:border-fg-muted",
    },
    /** Error / destructive state */
    error: {
      true: "",
      false: "",
    },
  },
  compoundVariants: [
    {
      error: false,
      focused: true,
      class: "border-ring ring-2 ring-ring",
    },
    {
      error: true,
      focused: false,
      class: "border-danger",
    },
    {
      error: true,
      focused: true,
      class: "border-danger ring-2 ring-ring",
    },
  ],
  defaultVariants: {
    padding: "md",
    focused: false,
    disabled: false,
    error: false,
  },
});

type InputBoxVariants = Omit<
  VariantProps<typeof inputBoxVariants>,
  "focused" | "disabled" | "error"
>;

interface InputBoxProps
  extends ComponentPropsWithoutRef<"div">,
    InputBoxVariants {}

/**
 * Input.Box is the visual container for the input field.
 * It provides the border, background, focus ring, and default padding (14px / 10px).
 *
 * @example
 * ```tsx
 * <Input.Box>
 *   <Input.Field placeholder="Enter value" />
 * </Input.Box>
 *
 * <Input.Box padding="none">
 *   <DatePicker.Field />
 * </Input.Box>
 * ```
 */
export function InputBox({
  children,
  className,
  padding,
  ...props
}: InputBoxProps) {
  const { disabled, error, isFocused, hasFloatingLabel } = useInputContext("Box");

  return (
    <div
      className={cn(
        inputBoxVariants({
          padding,
          focused: isFocused,
          disabled,
          error: Boolean(error),
        }),
        hasFloatingLabel && padding !== "none" && "pt-5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
