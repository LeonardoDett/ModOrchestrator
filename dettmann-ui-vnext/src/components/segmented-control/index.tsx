"use client";

import { useId, useState, type ComponentPropsWithoutRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../../utils/cn";
import { useFlip } from "../../motion/use-flip";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string>
  extends Omit<ComponentPropsWithoutRef<"div">, "onChange"> {
  options: readonly SegmentedControlOption<T>[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  size?: "sm" | "md" | "lg";
}

export function SegmentedControl<T extends string>({
  options,
  value: controlled,
  defaultValue,
  onChange,
  size = "md",
  className,
  ...props
}: SegmentedControlProps<T>) {
  const id = useId();
  const firstEnabled = options.find((option) => !option.disabled)?.value;
  const [internal, setInternal] = useState<T | undefined>(defaultValue ?? firstEnabled);
  const value = controlled ?? internal;
  const height = size === "sm" ? "h-control-sm" : size === "lg" ? "h-control-lg" : "h-control-md";
  const flip = useFlip<HTMLSpanElement>([value]);
  // Parada de tabulação única: a opção selecionada, se existir e estiver habilitada; senão a primeira habilitada.
  const tabStop = options.some((option) => option.value === value && !option.disabled) ? value : firstEnabled;

  const select = (nextValue: T) => {
    setInternal(nextValue);
    onChange?.(nextValue);
  };

  const move = (event: KeyboardEvent<HTMLButtonElement>, delta: number) => {
    const currentIndex = options.findIndex((option) => option.value === event.currentTarget.dataset.value);
    if (currentIndex < 0) return;

    for (let offset = 1; offset <= options.length; offset += 1) {
      const nextIndex = (currentIndex + delta * offset + options.length) % options.length;
      const candidate = options[nextIndex];
      if (candidate && !candidate.disabled) {
        event.preventDefault();
        candidate && select(candidate.value);
        event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-segment-value="${CSS.escape(candidate.value)}"]`)?.focus();
        return;
      }
    }
  };

  return (
    <div
      role="radiogroup"
      data-layer="medium"
      className={cn(
        "inline-flex rounded-control border border-border bg-structure p-0.5",
        className,
      )}
      {...props}
    >
      {options.map((option) => {
        const active = option.value === value;
        const tabIndex = option.value === tabStop ? 0 : -1;
        return (
          <button
            key={`${id}-${option.value}`}
            data-value={option.value}
            data-segment-value={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={option.disabled ? -1 : tabIndex}
            disabled={option.disabled}
            onClick={() => select(option.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                move(event, 1);
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                move(event, -1);
              } else if (event.key === "Home") {
                const first = options.find((candidate) => !candidate.disabled);
                if (first) {
                  event.preventDefault();
                  select(first.value);
                  (event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
                    `[data-segment-value="${CSS.escape(first.value)}"]`,
                  ))?.focus();
                }
              } else if (event.key === "End") {
                const last = [...options].reverse().find((candidate) => !candidate.disabled);
                if (last) {
                  event.preventDefault();
                  select(last.value);
                  (event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
                    `[data-segment-value="${CSS.escape(last.value)}"]`,
                  ))?.focus();
                }
              }
            }}
            className={cn(
              "relative rounded-chip px-3 text-sm font-medium motion-transition focus-ring",
              height,
              option.disabled
                ? "pointer-events-none text-fg-subtle"
                : active
                  ? "text-fg"
                  : "text-fg-muted hover:bg-state-hover hover:text-fg",
            )}
          >
            {active ? (
              <span
                ref={flip("indicator")}
                data-slot="indicator"
                aria-hidden="true"
                className="absolute inset-0 rounded-chip border border-border bg-surface"
              />
            ) : null}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
