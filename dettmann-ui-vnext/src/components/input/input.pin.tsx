"use client";

import {
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
} from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { inputValueAsString, useInputContext } from "./input.context";
import type { InputRootOwnedNativeProps } from "./input.owned-props";

const pinSlotVariants = defineRecipe({
  base: [
    "h-12 w-10 text-center text-md font-semibold",
    "rounded-lg bg-surface border border-border shadow-xs",
    "text-fg",
    "transition-colors duration-fast ease-default",
    "focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring",
    "disabled:bg-muted disabled:text-fg-subtle disabled:border-transparent disabled:shadow-none",
  ].join(" "),
});

interface InputPinProps
  extends Omit<ComponentPropsWithoutRef<"div">, InputRootOwnedNativeProps | "onChange"> {
  /** Number of digits */
  length?: number;
  /** Numeric input only */
  numeric?: boolean;
}

/**
 * Input.Pin is an OTP / verification-code miolo. Concatenated value lives on Input.Root.
 *
 * @example
 * ```tsx
 * <Input.Root name="otp" value={otp} onChange={setOtp}>
 *   <Input.Pin length={6} />
 * </Input.Root>
 * ```
 */
export function InputPin({
  length = 6,
  numeric = true,
  className,
  ...props
}: InputPinProps) {
  const { id, name, disabled, value, onChange, error, setIsFocused } =
    useInputContext("Pin");
  const stringValue = inputValueAsString(value).slice(0, length);
  const chars = Array.from({ length }, (_, i) => stringValue[i] ?? "");
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const emit = (next: string[]) => {
    onChange(next.join("").slice(0, length));
  };

  const focusIndex = (index: number) => {
    const clamped = Math.max(0, Math.min(length - 1, index));
    refs.current[clamped]?.focus();
  };

  const handleChange = (index: number, event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    const filtered = numeric ? raw.replace(/\D/g, "") : raw;
    if (!filtered) {
      const next = [...chars];
      next[index] = "";
      emit(next);
      return;
    }
    const digits = filtered.split("");
    const next = [...chars];
    digits.forEach((digit, offset) => {
      if (index + offset < length) {
        next[index + offset] = digit;
      }
    });
    emit(next);
    focusIndex(index + digits.length);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !chars[index] && index > 0) {
      event.preventDefault();
      const next = [...chars];
      next[index - 1] = "";
      emit(next);
      focusIndex(index - 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusIndex(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusIndex(index + 1);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text");
    const filtered = (numeric ? pasted.replace(/\D/g, "") : pasted).slice(0, length);
    const next = Array.from({ length }, (_, i) => filtered[i] ?? "");
    emit(next);
    focusIndex(filtered.length);
  };

  return (
    <div
      className={cn("flex items-center gap-2", className)}
      {...props}
    >
      {name ? (
        <input type="hidden" name={name} value={stringValue} disabled={disabled} />
      ) : null}
      {chars.map((char, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          id={index === 0 ? id : undefined}
          inputMode={numeric ? "numeric" : "text"}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          disabled={disabled}
          maxLength={1}
          aria-invalid={Boolean(error) || undefined}
          value={char}
          onChange={(event) => handleChange(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={cn(
            pinSlotVariants(),
            Boolean(error) && "border-danger focus:border-danger focus:ring-danger"
          )}
        />
      ))}
    </div>
  );
}
