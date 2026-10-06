"use client";

import { type ComponentPropsWithoutRef, useEffect } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useInputContext } from "./input.context";

const inputLabelVariants = defineRecipe({
  base: [
    "text-sm font-medium text-fg",
    "transition-all duration-normal ease-default",
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
      true: "text-fg-muted cursor-not-allowed",
      false: "",
    },
    /** Error state */
    error: {
      true: "text-danger-text",
      false: "",
    },
  },
  compoundVariants: [
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
