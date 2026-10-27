"use client";

import { type ComponentPropsWithoutRef, useEffect } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useInputContext } from "./input.context";

const inputLabelVariants = defineRecipe({
  base: [
    "font-medium",
    "transition-[top,font-size,translate] duration-(--motion-duration) ease-(--motion-ease)",
    "pointer-events-none",
  ].join(" "),
  variants: {
    /** Floating label mode */
    floating: {
      true: [
        "absolute left-3.5 z-10",
        "bg-surface px-1",
        "origin-top-left",
      ].join(" "),
      false: "",
    },
    /** Disabled state */
    disabled: {
      true: "cursor-not-allowed",
      false: "",
    },
    /** Error state */
    error: {
      true: "",
      false: "",
    },
  },
  // Uma cor de texto por estado (o `cn` não resolve conflito).
  compoundVariants: [
    { error: true, className: "text-danger-text" },
    { error: false, disabled: false, className: "text-fg" },
    { error: false, disabled: true, className: "text-fg-muted" },
    {
      floating: true,
      disabled: true,
      className: "bg-surface",
    },
  ],
  defaultVariants: {
    floating: false,
    disabled: false,
    error: false,
  },
});

type InputLabelVariants = Omit<VariantProps<typeof inputLabelVariants>, "disabled" | "error">;

interface InputLabelProps
  extends Omit<ComponentPropsWithoutRef<"label">, "htmlFor">,
    InputLabelVariants {}

/**
 * Input.Label renders a label associated with the input.
 * Supports floating mode where the label floats above the input when focused or has value.
 *
 * Floating label uses CSS only (peer/group classes) - no JavaScript required.
 *
 * @example
 * ```tsx
 * // Standard label
 * <Input.Label>Email</Input.Label>
 *
 * // Floating label
 * <Input.Label floating>Email</Input.Label>
 * ```
 */
export function InputLabel({
  children,
  className,
  floating = false,
  ...props
}: InputLabelProps) {
  const { id, disabled, error, hasValue, isFocused, setHasFloatingLabel } = useInputContext("Label");

  const isFloating = floating;
  const isRaised = isFloating && (hasValue || isFocused);

  useEffect(() => {
    if (isFloating) {
      setHasFloatingLabel(true);
      return () => setHasFloatingLabel(false);
    }
  }, [isFloating, setHasFloatingLabel]);

  return (
    <label
      htmlFor={id}
      className={cn(
        inputLabelVariants({
          floating: isFloating,
          disabled,
          error: Boolean(error),
        }),
        !isFloating && "text-sm",
        isFloating && [
          isRaised
            ? "top-0 -translate-y-1/2 text-xs"
            : "top-1/2 -translate-y-1/2 text-sm",
        ],
        className
      )}
      {...props}
    >
      {children}
    </label>
  );
}
