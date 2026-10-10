"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useInputContext } from "./input.context";

const inputBoxVariants = defineRecipe({
  base: [
    "relative flex items-center",
    "rounded-control",
    "border",
    "motion-transition",
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
      true: "bg-sunken text-fg-subtle cursor-not-allowed",
      false: "bg-surface",
    },
    /** Error / destructive state */
    error: {
      true: "",
      false: "",
    },
  },
  // Uma cor de borda por estado (o `cn` não resolve conflito): repouso, foco ou erro.
  compoundVariants: [
    { error: false, focused: false, class: "border-border-strong" },
    { error: false, focused: false, disabled: false, class: "hover:border-fg-muted" },
    {
      error: false,
      focused: true,
      class: "border-focus ring-2 ring-focus",
    },
    {
      error: true,
      focused: false,
      class: "border-danger-border",
    },
    {
      error: true,
      focused: true,
      class: "border-danger-border ring-2 ring-focus",
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
