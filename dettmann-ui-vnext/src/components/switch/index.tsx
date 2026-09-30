"use client";

import { forwardRef, useId, type ComponentPropsWithoutRef } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { toneData, type Tone } from "../../theme/tone";

const switchVariants = defineRecipe({
  slots: {
    root: "inline-flex items-start gap-3",
    track: [
      "relative inline-flex shrink-0 items-center",
      "rounded-full p-0.5",
      "bg-border-strong",
      "transition-colors duration-fast ease-default",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-page",
      "disabled:cursor-not-allowed disabled:bg-muted disabled:text-fg-subtle",
      "data-[state=checked]:bg-tone",
    ].join(" "),
    thumb: [
      "pointer-events-none block shrink-0 rounded-full bg-surface shadow-xs",
      "translate-x-0",
      "transition-transform duration-fast ease-default",
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

type SwitchVariants = VariantProps<typeof switchVariants>;

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
  tone?: Tone;
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
      tone,
      id: providedId,
      ...props
    },
    ref
  ) {
    const generatedId = useId();
    const descriptionGeneratedId = useId();
    const id = providedId ?? generatedId;
    const descriptionId = description ? descriptionGeneratedId : undefined;

    const isControlled = controlledChecked !== undefined;
    const isChecked = isControlled ? controlledChecked : defaultChecked;

    const { root, track, thumb, label: labelClass } = switchVariants({ size, disabled });

    const state = isChecked ? "checked" : "unchecked";

    const handleClick = () => {
      if (disabled) return;
      onCheckedChange?.(!isChecked);
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
          {...toneData(tone ?? "secondary")}
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
