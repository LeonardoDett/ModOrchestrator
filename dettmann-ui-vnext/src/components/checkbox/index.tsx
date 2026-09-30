"use client";

import { forwardRef, useId, type ComponentPropsWithoutRef } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { toneData, type Tone } from "../../theme/tone";

const checkboxVariants = defineRecipe({
  slots: {
    root: "inline-flex items-center gap-2",
    checkbox: [
      "shrink-0 flex items-center justify-center",
      "border border-border-strong rounded-md",
      "bg-surface",
      "transition-colors duration-fast ease-default",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-page",
      "disabled:cursor-not-allowed disabled:bg-muted disabled:text-fg-subtle",
      "data-[state=checked]:bg-tone data-[state=checked]:border-tone data-[state=checked]:text-on-tone",
      "data-[state=indeterminate]:bg-tone data-[state=indeterminate]:border-tone data-[state=indeterminate]:text-on-tone",
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
  tone?: Tone;
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
      tone,
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
          {...toneData(tone ?? "secondary")}
          {...props}
        >
          <svg
            className={cn(
              "h-3 w-3 text-current transition-transform duration-fast",
              isChecked || indeterminate ? "scale-100" : "scale-0"
            )}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {indeterminate ? (
              <line x1="5" y1="12" x2="19" y2="12" />
            ) : (
              <polyline points="20 6 9 17 4 12" />
            )}
          </svg>
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
