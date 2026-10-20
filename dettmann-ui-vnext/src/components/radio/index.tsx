"use client";

import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { intentData } from "../../theme/emphasis";
import type { Intent } from "../../theme/engine";
import { useControllableState } from "../../hooks/use-controllable-state";

interface RadioGroupContextValue {
  name: string;
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

function useRadioGroupContext() {
  return useContext(RadioGroupContext);
}

const radioGroupVariants = defineRecipe({
  base: "flex gap-2",
  variants: {
    orientation: {
      horizontal: "flex-row",
      vertical: "flex-col",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
});

const radioVariants = defineRecipe({
  slots: {
    root: "inline-flex items-center gap-2",
    radio: [
      "shrink-0 flex items-center justify-center",
      "border border-border-strong rounded-pill",
      "bg-surface",
      "motion-transition",
      "focus-ring",
      "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-fg-subtle",
      "enabled:data-[state=checked]:border-intent-fill",
    ].join(" "),
    indicator: [
      "rounded-pill",
      "transition-transform duration-(--motion-duration) ease-(--motion-ease)",
      "scale-0 data-[state=checked]:scale-100",
    ].join(" "),
    label: "text-sm text-fg select-none",
    card: [
      "flex w-full rounded-card border border-border-strong bg-surface text-left",
      "motion-transition",
      "hover:border-fg-muted",
      "focus-ring",
      "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-fg-subtle",
      "enabled:data-[state=checked]:border-intent-fill enabled:data-[state=checked]:bg-intent-subtle",
    ].join(" "),
    /** D-040: a 44 px bordered option row (installer options on the boards). */
    row: [
      "flex min-h-11 w-full items-center gap-3 rounded-control border px-3.5 py-1.5 text-left",
      "motion-transition",
      "focus-ring",
      "data-[state=unchecked]:border-border enabled:data-[state=unchecked]:hover:bg-state-hover",
      "data-[state=checked]:border-intent-fill data-[state=checked]:bg-intent-subtle",
      "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-fg-subtle",
    ].join(" "),
  },
  variants: {
    size: {
      sm: {
        radio: "h-4 w-4",
        indicator: "h-2 w-2",
        label: "text-xs",
      },
      md: {
        radio: "h-5 w-5",
        indicator: "h-2.5 w-2.5",
        label: "text-sm",
      },
      lg: {
        radio: "h-6 w-6",
        indicator: "h-3 w-3",
        label: "text-base",
      },
    },
    disabled: {
      true: {
        root: "cursor-not-allowed text-fg-subtle",
        label: "cursor-not-allowed",
        indicator: "bg-fg-subtle",
      },
      false: {
        root: "cursor-pointer",
        label: "cursor-pointer",
        indicator: "bg-intent-fill",
      },
    },
  },
  defaultVariants: {
    size: "md",
    disabled: false,
  },
});

type RadioGroupVariants = VariantProps<typeof radioGroupVariants>;

interface RadioGroupProps extends ComponentPropsWithoutRef<"div">, RadioGroupVariants {
  /** Name for form submission */
  name: string;
  /** Controlled value */
  value?: string;
  /** Default value (uncontrolled) */
  defaultValue?: string;
  /** Callback when value changes */
  onValueChange?: (value: string) => void;
  /** Disable all radio items */
  disabled?: boolean;
  intent?: Intent;
}

/**
 * Radio.Group is the container for Radio items.
 */
const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(function RadioGroup(
  {
    children,
    className,
    name,
    value: controlledValue,
    defaultValue = "",
    onValueChange,
    disabled,
    orientation,
    intent,
    ...props
  },
  ref
) {
  const [value, setValue] = useControllableState({
    value: controlledValue,
    defaultValue,
    onChange: onValueChange,
  });

  return (
    <RadioGroupContext.Provider value={{ name, value, onValueChange: setValue, disabled }}>
      <div
        ref={ref}
        role="radiogroup"
        className={cn(radioGroupVariants({ orientation }), className)}
        {...intentData(intent ?? "brand")}
        {...props}
      >
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
});

type RadioItemVariants = Omit<VariantProps<typeof radioVariants>, "disabled">;

interface RadioItemProps
  extends Omit<ComponentPropsWithoutRef<"button">, "type" | "role" | "value">,
    RadioItemVariants {
  /** Value for this radio item */
  value: string;
  /** Label text */
  label?: string;
  /** Card wraps the whole control; use children for extra copy. `row`: a 44 px bordered option row. */
  variant?: "default" | "card" | "row";
  /** End of a `row` (badges, an image mark). */
  action?: ReactNode;
  /**
   * D-040: a mark between the radio and the copy of a `card` (the 44 px monogram of a
   * source); with it the card centers its content.
   */
  media?: ReactNode;
  children?: ReactNode;
  /** Sobrescreve o intent do grupo; sem ele, o item herda o do `Radio.Group` (padrão `brand`). */
  intent?: Intent;
}

/**
 * Radio.Item is an individual radio button within a Radio.Group.
 */
const RadioItem = forwardRef<HTMLButtonElement, RadioItemProps>(function RadioItem(
  {
    className,
    value,
    label,
    size,
    variant = "default",
    children,
    disabled: itemDisabled,
    intent,
    action,
    media,
    id: providedId,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const group = useRadioGroupContext();

  if (!group) {
    throw new Error("Radio.Item must be used within a Radio.Group");
  }

  const isChecked = group.value === value;
  const disabled = itemDisabled ?? group.disabled ?? false;
  const state = isChecked ? "checked" : "unchecked";

  const {
    root,
    radio,
    indicator,
    label: labelClass,
    card,
    row,
  } = radioVariants({ size, disabled });

  const handleClick = () => {
    if (disabled) return;
    group.onValueChange?.(value);
  };

  const glyph = (
    <span data-state={state} className={radio()} aria-hidden={variant !== "default"}>
      <span data-state={state} className={indicator()} />
    </span>
  );

  const copy = (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
      {label ? <span className={labelClass()}>{label}</span> : null}
      {children}
    </span>
  );

  if (variant === "card" || variant === "row") {
    return (
      <button
        ref={ref}
        id={id}
        type="button"
        role="radio"
        aria-checked={isChecked}
        data-state={state}
        disabled={disabled}
        onClick={handleClick}
        className={cn(variant === "row" ? row() : card(), variant === "card" && (media ? "items-center gap-3.5 px-4 py-3.5" : "items-start gap-3 p-4"), className)}
        {...intentData(intent)}
        {...props}
      >
        {glyph}
        {media ? <span className="flex shrink-0 items-center">{media}</span> : null}
        {copy}
        {variant === "row" && action ? <span className="flex shrink-0 items-center gap-1.5">{action}</span> : null}
      </button>
    );
  }

  return (
    <div className={cn(root(), className)}>
      <button
        ref={ref}
        id={id}
        type="button"
        role="radio"
        aria-checked={isChecked}
        data-state={state}
        disabled={disabled}
        onClick={handleClick}
        className={radio()}
        {...intentData(intent)}
        {...props}
      >
        <span data-state={state} className={indicator()} />
      </button>
      {label ? (
        <label htmlFor={id} className={labelClass()}>
          {label}
        </label>
      ) : null}
      {children}
    </div>
  );
});

export const Radio = {
  Group: RadioGroup,
  Item: RadioItem,
};
