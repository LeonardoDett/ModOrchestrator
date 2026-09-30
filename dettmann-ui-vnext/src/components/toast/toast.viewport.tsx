"use client";

import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Portal } from "../../primitives/portal";
import type { Toast } from "./toast.context";
import { toneData, type Tone } from "../../theme/tone";

const toastSoft = "bg-tone-subtle text-tone-text border border-tone-border";
const toastNeutral = "bg-secondary-subtle text-secondary-text border border-secondary-border";

const toastTone: Record<string, Tone | undefined> = {
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
};

const toastVariants = defineRecipe({
  base: [
    "pointer-events-auto flex w-full max-w-sm items-start gap-3",
    "rounded-xl p-4 shadow-xl",
    "animate-in slide-in-from-right-full duration-300",
  ].join(" "),
  variants: {
    variant: {
      default: "",
      success: "",
      warning: "",
      danger: "",
      info: "",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

type ToastVariants = VariantProps<typeof toastVariants>;

interface ToastItemProps extends ComponentPropsWithoutRef<"div">, ToastVariants {
  toast: Toast;
  onRemove: (id: string) => void;
  closeLabel: string;
}

function ToastItem({ toast, onRemove, closeLabel, className, ...props }: ToastItemProps) {
  return (
    <div
      role="alert"
      className={cn(
        toastVariants({ variant: toast.variant }),
        toastTone[toast.variant ?? "default"] ? toastSoft : toastNeutral,
        className
      )}
      {...toneData(toastTone[toast.variant ?? "default"])}
      {...props}
    >
      <div className="flex-1">
        {toast.title && (
          <div className="text-sm font-semibold">{toast.title}</div>
        )}
        {toast.description && (
          <div className={cn("text-sm", toast.title && "mt-1 ")}>
            {toast.description}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(toast.id)}
        className="shrink-0 rounded-md text-fg-muted hover:bg-hover hover:text-fg transition-opacity"
        aria-label={closeLabel}
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

interface ToastViewportProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
  /** Accessible name of each toast's close button (localize it). */
  closeLabel?: string;
}

export function ToastViewport({ toasts, onRemove, closeLabel = "Close" }: ToastViewportProps) {
  if (toasts.length === 0) return null;

  return (
    <Portal>
      <div className="fixed top-0 right-0 z-toast flex max-h-screen w-full flex-col-reverse p-4 sm:flex-col md:max-w-sm pointer-events-none gap-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={onRemove} closeLabel={closeLabel} />
        ))}
      </div>
    </Portal>
  );
}
