"use client";

import {
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type Ref,
} from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { mergeRefs } from "../../utils/merge-refs";
import { inputValueAsString, useInputContext } from "./input.context";
import type { InputRootOwnedNativeProps } from "./input.owned-props";

const inputTextareaVariants = defineRecipe({
  base: [
    "w-full flex-1",
    "bg-transparent",
    "text-fg text-sm",
    "placeholder:text-fg-subtle",
    "outline-none resize-y",
    "disabled:cursor-not-allowed",
  ].join(" "),
  variants: {
    /** Grow height to fit content */
    autoResize: {
      true: "resize-none overflow-hidden",
      false: "",
    },
  },
  defaultVariants: {
    autoResize: false,
  },
});

type InputTextareaVariants = VariantProps<typeof inputTextareaVariants>;

interface InputTextareaProps
  extends Omit<
      ComponentPropsWithoutRef<"textarea">,
      InputRootOwnedNativeProps
    >,
    InputTextareaVariants {
  /** Additional CSS classes */
  className?: string;
  /** Forwarded ref to the textarea element */
  ref?: Ref<HTMLTextAreaElement>;
}

/**
 * Input.Textarea is the textarea miolo of the Input family.
 * `value`/`onChange` live on `Input.Root` only — this miolo reads them from context
 * and forwards a plain string (never the DOM event).
 *
 * @example
 * ```tsx
 * <Input.Root name="bio" fullWidth value={bio} onChange={setBio}>
 *   <Input.Label>Bio</Input.Label>
 *   <Input.Box>
 *     <Input.Textarea rows={4} autoResize />
 *   </Input.Box>
 *   <Input.Error />
 * </Input.Root>
 * ```
 */
export function InputTextarea({
  className,
  onFocus,
  onBlur,
  placeholder,
  autoResize = false,
  rows = 3,
  ref,
  ...props
}: InputTextareaProps) {
  const {
    id,
    name,
    disabled,
    value,
    onChange,
    setIsFocused,
    hasFloatingLabel,
    hasValue,
    isFocused,
  } = useInputContext("Textarea");
  const stringValue = inputValueAsString(value);

  const innerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!autoResize) return;
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [autoResize, stringValue]);

  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const showPlaceholder = !hasFloatingLabel || hasValue || isFocused;
  const effectivePlaceholder = showPlaceholder ? placeholder : undefined;

  return (
    <textarea
      {...props}
      ref={mergeRefs([innerRef, ref])}
      id={id}
      name={name}
      disabled={disabled}
      value={stringValue}
      rows={rows}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={effectivePlaceholder}
      className={cn(inputTextareaVariants({ autoResize }), className)}
    />
  );
}

export type { InputTextareaProps };
