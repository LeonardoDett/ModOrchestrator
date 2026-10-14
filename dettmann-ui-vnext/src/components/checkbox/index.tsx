"use client";

import { forwardRef, useId, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useControllableState } from "../../hooks/use-controllable-state";
import { intentData } from "../../theme/emphasis";
import type { Intent } from "../../theme/engine";
import { CheckIcon } from "../../icons/glyphs/check";
import { MinusIcon } from "../../icons/glyphs/minus";

const checkboxVariants = defineRecipe({
  slots: {
    root: "inline-flex items-center gap-2",
    checkbox: [
      "shrink-0 flex items-center justify-center",
      "border border-border-strong rounded-chip",
      "bg-surface",
      "motion-transition",
      "focus-ring",
      "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-fg-subtle",
      // `enabled:` para o desabilitado marcado cair em `disabled:bg-sunken` (o `cn` não resolve o conflito).
      "enabled:data-[state=checked]:bg-intent-fill enabled:data-[state=checked]:border-intent-fill enabled:data-[state=checked]:text-on-intent",
      "enabled:data-[state=indeterminate]:bg-intent-fill enabled:data-[state=indeterminate]:border-intent-fill enabled:data-[state=indeterminate]:text-on-intent",
    ].join(" "),
    label: "text-sm text-fg select-none",
    card: [
      "flex w-full items-start gap-3 rounded-card border border-border-strong bg-surface p-4 text-left",
      "motion-transition",
      "data-[state=checked]:border-intent-fill data-[state=checked]:bg-intent-subtle",
      "data-[state=indeterminate]:border-intent-fill",
    ].join(" "),
    /** D-040: a 44 px bordered option row (installer options on the boards). */
    row: [
      "flex min-h-11 w-full items-center gap-3 rounded-control border px-3.5 py-1.5 text-left",
      "motion-transition",
      "data-[state=unchecked]:border-border data-[state=unchecked]:hover:bg-state-hover",
      "data-[state=checked]:border-intent-fill data-[state=checked]:bg-intent-subtle",
      "data-[state=indeterminate]:border-intent-fill",
      "data-[disabled]:bg-sunken",
    ].join(" "),
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
  /**
   * `card`: cartão com rótulo, descrição e ação (escolha entre partes, como o Radio em cartão).
   * `row`: linha de opção de 44 px com borda; `action` vira a ponta direita (selos).
   */
  variant?: "default" | "card" | "row";
  /** Texto de apoio do cartão. */
  description?: ReactNode;
  /** Ação à direita do cartão, fora do controle ("Escolher mods"). */
  action?: ReactNode;
}

/**
 * Checkbox component for boolean selections.
 *
 * @example
 * ```tsx
 * <Checkbox label="Accept terms" />
 * <Checkbox checked={isChecked} onCheckedChange={setIsChecked} />
 * <Checkbox indeterminate label="Select all" />
 * <Checkbox variant="card" label="Regras entre mods" description="27 regras" action={<Button size="sm">Escolher</Button>} />
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
      variant = "default",
      description,
      action,
      id: providedId,
      ...props
    },
    ref
  ) {
    const generatedId = useId();
    const id = providedId ?? generatedId;

    const [isChecked, setChecked] = useControllableState({
      value: controlledChecked,
      defaultValue: defaultChecked,
      onChange: onCheckedChange,
    });

    const { root, checkbox, label: labelClass, card, row } = checkboxVariants({ size, disabled });

    const state = indeterminate ? "indeterminate" : isChecked ? "checked" : "unchecked";

    // Só as transições PARA marcado redesenham o traço; desmarcar não incrementa (sem redesenho).
    const marked = Boolean(isChecked || indeterminate);
    const [draws, setDraws] = useState({ marked, count: 0 });
    if (draws.marked !== marked) setDraws({ marked, count: marked ? draws.count + 1 : draws.count });

    const handleClick = () => {
      if (disabled) return;
      setChecked(!isChecked);
    };

    const markClass = cn(
      "text-current transition-transform duration-(--motion-duration) ease-(--motion-ease)",
      isChecked || indeterminate ? "scale-100" : "scale-0"
    );

    if (variant === "card" || variant === "row") {
      const labelId = `${id}-label`;
      return (
        <div
          data-state={state}
          data-disabled={disabled || undefined}
          className={cn(variant === "row" ? row() : card(), className)}
          {...intentData(intent ?? "brand")}
        >
          <button
            ref={ref}
            id={id}
            type="button"
            role="checkbox"
            aria-checked={indeterminate ? "mixed" : isChecked}
            aria-labelledby={label ? labelId : undefined}
            data-state={state}
            disabled={disabled}
            onClick={handleClick}
            className={cn(checkbox(), variant === "card" && "mt-0.5")}
            {...props}
          >
            {indeterminate ? (
              <MinusIcon size="xs" strokeWidth={3} trigger="none" playKey={draws.count} className={markClass} />
            ) : (
              <CheckIcon size="xs" strokeWidth={3} trigger="none" playKey={draws.count} className={markClass} />
            )}
          </button>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            {label ? (
              <label id={labelId} htmlFor={id} className={cn(labelClass(), "font-medium")}>
                {label}
              </label>
            ) : null}
            {description ? <span className="text-xs text-fg-muted">{description}</span> : null}
          </span>
          {action ? <span className="flex shrink-0 items-center">{action}</span> : null}
          {name && <input type="hidden" name={name} value={isChecked ? (value ?? "on") : ""} />}
        </div>
      );
    }

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
            <MinusIcon size="xs" strokeWidth={3} trigger="none" playKey={draws.count} className={markClass} />
          ) : (
            <CheckIcon size="xs" strokeWidth={3} trigger="none" playKey={draws.count} className={markClass} />
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
