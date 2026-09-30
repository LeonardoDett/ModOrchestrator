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
import { toneData, type Tone } from "../../theme/tone";
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
      "border border-border-strong rounded-full",
      "bg-surface",
      "transition-colors duration-fast ease-default",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-page",
      "disabled:cursor-not-allowed disabled:bg-muted disabled:text-fg-subtle",
      "data-[state=checked]:border-tone",
    ].join(" "),
    indicator: [
      "rounded-full bg-tone",
      "transition-transform duration-fast ease-default",
      "scale-0 data-[state=checked]:scale-100",
    ].join(" "),
    label: "text-sm text-fg select-none",
    card: [
      "flex w-full items-start gap-3 rounded-xl border border-border-strong bg-surface p-4 text-left shadow-xs",
      "transition-colors duration-fast ease-default",
      "hover:border-fg-muted",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-page",
      "disabled:cursor-not-allowed disabled:bg-muted disabled:text-fg-subtle",
      "data-[state=checked]:border-tone data-[state=checked]:bg-tone-subtle",
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
  tone?: Tone;
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
    tone,
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
        {...toneData(tone ?? "secondary")}
        {...props}
      >
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
});

type RadioItemVariants = VariantProps<typeof radioVariants>;

interface RadioItemProps
  extends Omit<ComponentPropsWithoutRef<"button">, "type" | "role" | "value">,
    RadioItemVariants {
  /** Value for this radio item */
  value: string;
  /** Label text */
  label?: string;
  /** Card wraps the whole control; use children for extra copy */
  variant?: "default" | "card";
  children?: ReactNode;
  tone?: Tone;
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
    tone,
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
  } = radioVariants({ size, disabled });

  const handleClick = () => {
    if (disabled) return;
    group.onValueChange?.(value);
  };

  const glyph = (
    <span data-state={state} className={radio()} aria-hidden={variant === "card"}>
      <span data-state={state} className={indicator()} />
    </span>
  );

  const copy = (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
      {label ? <span className={labelClass()}>{label}</span> : null}
      {children}
    </span>
  );

  if (variant === "card") {
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
        className={cn(card(), className)}
        {...toneData(tone ?? "secondary")}
        {...props}
      >
        {glyph}
        {copy}
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
        {...toneData(tone ?? "secondary")}
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
