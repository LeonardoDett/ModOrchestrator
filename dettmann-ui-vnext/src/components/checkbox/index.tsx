"use client";

import { forwardRef, useId, type ComponentPropsWithoutRef } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { intentData } from "../../theme/emphasis";
import type { Intent } from "../../theme/engine";
import { CheckIcon } from "../../icons/glyphs/check";
import { MinusIcon } from "../../icons/glyphs/minus";

const checkboxVariants = defineRecipe({
  slots: {
    root: "inline-flex items-center gap-2",
    checkbox: [
      "shrink-0 flex items-center justify-center",
      "border border-border-strong rounded-control",
      "bg-surface",
      "motion-transition",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
      "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-fg-subtle",
      "data-[state=checked]:bg-intent-fill data-[state=checked]:border-intent-fill data-[state=checked]:text-on-intent",
      "data-[state=indeterminate]:bg-intent-fill data-[state=indeterminate]:border-intent-fill data-[state=indeterminate]:text-on-intent",
    ].join(" "),
    label: "text-sm text-fg select-none",
  },
  variants: {
    size: {
      sm: {
        checkbox: "h-4 w-4",
        label: "text-xs",
      },
      md: {
        checkbox: "h-5 w-5",
        label: "text-sm",
      },
      lg: {
        checkbox: "h-6 w-6",
        label: "text-base",
      },
    },
    disabled: {
      true: {
        root: "cursor-not-allowed text-fg-subtle",
        label: "cursor-not-allowed",
      },
      false: {
        root: "cursor-pointer",
        label: "cursor-pointer",
      },
    },
  },
  defaultVariants: {
    size: "md",
    disabled: false,
  },
});

type CheckboxVariants = Omit<VariantProps<typeof checkboxVariants>, "disabled">;

interface CheckboxProps
  extends Omit<ComponentPropsWithoutRef<"button">, "type" | "role">,
    CheckboxVariants {
  /** Whether the checkbox is checked */
  checked?: boolean;
  /** Default checked state (uncontrolled) */
  defaultChecked?: boolean;
  /** Callback when checked state changes */
  onCheckedChange?: (checked: boolean) => void;
  /** Indeterminate state (partial selection) */
  indeterminate?: boolean;
  /** Label text */
  label?: string;
  /** Name for form submission */
  name?: string;
  /** Value for form submission */
  value?: string;
  intent?: Intent;
}

/**
 * Checkbox component for boolean selections.
 *
 * @example
 * ```tsx
 * <Checkbox label="Accept terms" />
 * <Checkbox checked={isChecked} onCheckedChange={setIsChecked} />
 * <Checkbox indeterminate label="Select all" />
 * ```
 */
export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(
  function Checkbox(
    {
      className,
      checked: controlledChecked,
      defaultChecked = false,
      onCheckedChange,
      indeterminate = false,
      label,
      name,
      value,
      size,
      disabled = false,
      intent,
      id: providedId,
      ...props
    },
    ref
  ) {
    const generatedId = useId();
    const id = providedId ?? generatedId;

    const isControlled = controlledChecked !== undefined;
    const isChecked = isControlled ? controlledChecked : undefined;

    const { root, checkbox, label: labelClass } = checkboxVariants({ size, disabled });

    const state = indeterminate ? "indeterminate" : isChecked ? "checked" : "unchecked";

    const handleClick = () => {
      if (disabled) return;
      onCheckedChange?.(!isChecked);
    };

    const markClass = cn(
      "text-current transition-transform duration-(--motion-duration) ease-(--motion-ease)",
      isChecked || indeterminate ? "scale-100" : "scale-0"
    );

    return (
      <div className={cn(root(), className)}>
        <button
          ref={ref}
          id={id}
          type="button"
          role="checkbox"
          aria-checked={indeterminate ? "mixed" : isChecked}
          data-state={state}
          disabled={disabled}
          onClick={handleClick}
          className={checkbox()}
          {...intentData(intent ?? "brand")}
          {...props}
        >
          {indeterminate ? (
            <MinusIcon size="xs" strokeWidth={3} trigger="none" playKey={state} className={markClass} />
          ) : (
            <CheckIcon size="xs" strokeWidth={3} trigger="none" playKey={state} className={markClass} />
          )}
        </button>
        {label && (
          <label htmlFor={id} className={labelClass()}>
            {label}
          </label>
        )}
        {/* Hidden input for form submission */}
        {name && (
          <input
            type="hidden"
            name={name}
            value={isChecked ? (value ?? "on") : ""}
          />
        )}
      </div>
    );
  }
);
