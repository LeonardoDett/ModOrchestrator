"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useInputContext } from "./input.context";

const inputErrorVariants = defineRecipe({
  base: "text-xs text-danger-text",
});

interface InputErrorProps extends ComponentPropsWithoutRef<"p"> {
  /** Custom error message (overrides context error) */
  message?: string;
}

/**
 * Input.Error displays the error message from context.
 * Returns `null` when `error` is `undefined`, `null`, `false`, or `""`.
 *
 * @example
 * ```tsx
 * // Uses error from context
 * <Input.Error />
 *
 * // Custom error message
 * <Input.Error message="Custom error message" />
 * ```
 */
export function InputError({
  children,
  message,
  className,
  ...props
}: InputErrorProps) {
  const { error } = useInputContext("Error");

  if (error == null || error === false || error === "") {
    return null;
  }

  const errorMessage = message ?? (typeof error === "string" ? error : null);
  const content = children ?? errorMessage;

  if (content == null || content === "") {
    return null;
  }

  return (
    <p
      role="alert"
      className={cn(inputErrorVariants(), className)}
      {...props}
    >
      {content}
    </p>
  );
}
