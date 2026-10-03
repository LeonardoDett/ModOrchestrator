"use client";

import { useEffect, useState, type ComponentPropsWithoutRef, type KeyboardEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { inputValueAsString, useInputContext } from "./input.context";
import type { InputRootOwnedNativeProps } from "./input.owned-props";

const inputNumberVariants = defineRecipe({
  base: [
    "w-full min-w-0 flex-1",
    "bg-transparent",
    "text-fg text-sm tabular-nums",
    "outline-none",
    "disabled:cursor-not-allowed",
    "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
  ].join(" "),
});

const stepButton = [
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
  "text-fg-muted hover:bg-hover hover:text-fg",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "disabled:pointer-events-none disabled:opacity-50",
].join(" ");

interface InputNumberProps
  extends Omit<ComponentPropsWithoutRef<"input">, InputRootOwnedNativeProps | "type" | "min" | "max" | "step"> {
  /** Smallest accepted value. */
  min?: number;
  /** Largest accepted value. */
  max?: number;
  /** Increment of the buttons and of ArrowUp/ArrowDown. */
  step?: number;
  /** Accessible name of the decrement button. */
  decrementLabel?: string;
  /** Accessible name of the increment button. */
  incrementLabel?: string;
  className?: string;
}

function clamp(n: number, min?: number, max?: number): number {
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}

/**
 * Input.Number is a numeric stepper miolo: a number field between a
 * decrement and an increment button. `value`/`onChange` live on
 * `Input.Root` (plain strings). Typing is a draft committed on blur or
 * Enter (so "12" never commits "1" on the way); the buttons and
 * ArrowUp/ArrowDown commit at once. Committed values are clamped to
 * [min, max]; an empty or invalid draft returns to the current value.
 *
 * @example
 * ```tsx
 * <Input.Root name="retention" value={days} onChange={setDays}>
 *   <Input.Label>Retention (days)</Input.Label>
 *   <Input.Box>
 *     <Input.Number min={7} max={3650} decrementLabel="Less" incrementLabel="More" />
 *   </Input.Box>
 * </Input.Root>
 * ```
 */
export function InputNumber({
  min,
  max,
  step = 1,
  decrementLabel = "Decrease",
  incrementLabel = "Increase",
  className,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: InputNumberProps) {
  const { id, name, disabled, value, onChange, setIsFocused } = useInputContext("Number");
  const current = inputValueAsString(value);
  const [draft, setDraft] = useState(current);

  useEffect(() => setDraft(current), [current]);

  const numeric = Number(current);
  const commit = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(n)) {
      setDraft(current);
      return;
    }
    const next = String(clamp(Math.round(n / step) * step, min, max));
    setDraft(next);
    if (next !== current) onChange(next);
  };
  const stepBy = (delta: number) => commit(String((Number.isFinite(numeric) ? numeric : (min ?? 0)) + delta));

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      stepBy(e.key === "ArrowUp" ? step : -step);
    } else if (e.key === "Enter") {
      commit(draft);
    } else if (e.key === "Escape") {
      setDraft(current);
    }
  };

  return (
    <div className="flex w-full items-center gap-1">
      <button
        type="button"
        className={stepButton}
        aria-label={decrementLabel}
        aria-controls={id}
        disabled={disabled || (min !== undefined && numeric <= min)}
        onClick={() => stepBy(-step)}
      >
        <Minus aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      <input
        {...props}
        id={id}
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          commit(draft);
          onBlur?.(e);
        }}
        onKeyDown={handleKeyDown}
        className={cn(inputNumberVariants(), "text-center", className)}
      />
      <button
        type="button"
        className={stepButton}
        aria-label={incrementLabel}
        aria-controls={id}
        disabled={disabled || (max !== undefined && numeric >= max)}
        onClick={() => stepBy(step)}
      >
        <Plus aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
