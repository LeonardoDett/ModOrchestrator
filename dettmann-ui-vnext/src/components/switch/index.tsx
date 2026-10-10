"use client";

import { forwardRef, useId, type ComponentPropsWithoutRef } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useControllableState } from "../../hooks/use-controllable-state";
import { intentData } from "../../theme/emphasis";
import type { Intent } from "../../theme/engine";

const switchVariants = defineRecipe({
  slots: {
    root: "inline-flex items-start gap-3",
    track: [
      "relative inline-flex shrink-0 items-center",
      "rounded-pill p-0.5",
      "bg-border-strong",
      "motion-transition",
      "focus-ring",
      "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-fg-subtle",
      "enabled:data-[state=checked]:bg-intent-fill",
    ].join(" "),
    thumb: [
      "pointer-events-none block shrink-0 rounded-pill bg-surface border border-border",
      "translate-x-0",
      "transition-transform duration-(--motion-duration) ease-(--motion-ease)",
    ].join(" "),
    label: "text-sm text-fg select-none",
  },
  variants: {
    size: {
      sm: {
        track: "h-5 w-9",
        thumb: "h-4 w-4 data-[state=checked]:translate-x-4",
        label: "text-xs",
      },
      md: {
        track: "h-6 w-11",
        thumb: "h-5 w-5 data-[state=checked]:translate-x-5",
        label: "text-sm",
      },
      lg: {
        track: "h-7 w-12",
        thumb: "h-6 w-6 data-[state=checked]:translate-x-5",
        label: "text-base",
      },
    },
    disabled: {
      true: {
        root: "cursor-not-allowed",
        label: "cursor-not-allowed text-fg-subtle",
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

type SwitchVariants = Omit<VariantProps<typeof switchVariants>, "disabled">;

interface SwitchProps
  extends Omit<ComponentPropsWithoutRef<"button">, "type" | "role">,
    SwitchVariants {
  /** Whether the switch is on */
  checked?: boolean;
  /** Default checked state (uncontrolled) */
  defaultChecked?: boolean;
  /** Callback when checked state changes */
  onCheckedChange?: (checked: boolean) => void;
  /** Label text */
  label?: string;
  /** Helper text associated via aria-describedby */
  description?: string;
  /** Position of label */
  labelPosition?: "left" | "right";
  /** Name for form submission */
  name?: string;
  /** Value for form submission */
  value?: string;
  intent?: Intent;
}

/**
 * Switch component for toggling between on/off states.
 *
 * @example
 * ```tsx
 * <Switch label="Dark mode" />
 * <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
 * <Switch label="Notifications" labelPosition="left" />
 * ```
 */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  function Switch(
    {
      className,
      checked: controlledChecked,
      defaultChecked = false,
      onCheckedChange,
      label,
      description,
      labelPosition = "right",
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
    const descriptionGeneratedId = useId();
    const id = providedId ?? generatedId;
    const descriptionId = description ? descriptionGeneratedId : undefined;

    const [isChecked, setChecked] = useControllableState({
      value: controlledChecked,
      defaultValue: defaultChecked,
      onChange: onCheckedChange,
    });

    const { root, track, thumb, label: labelClass } = switchVariants({ size, disabled });

    const state = isChecked ? "checked" : "unchecked";

    const handleClick = () => {
      if (disabled) return;
      setChecked(!isChecked);
    };

    const textBlock = (label || description) ? (
      <span className="flex min-w-0 flex-col gap-0.5">
        {label ? (
          <label htmlFor={id} className={labelClass()}>
            {label}
          </label>
        ) : null}
        {description ? (
          <span id={descriptionId} className="text-sm text-fg-muted">
            {description}
          </span>
        ) : null}
      </span>
    ) : null;

    return (
      <div className={cn(root(), className)}>
        {labelPosition === "left" && textBlock}
        <button
          ref={ref}
          id={id}
          type="button"
          role="switch"
          aria-checked={isChecked}
          aria-describedby={descriptionId}
          data-state={state}
          disabled={disabled}
          onClick={handleClick}
          className={track()}
          {...intentData(intent ?? "brand")}
          {...props}
        >
          <span data-state={state} className={thumb()} />
        </button>
        {labelPosition === "right" && textBlock}
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
