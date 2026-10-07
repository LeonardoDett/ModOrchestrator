"use client";

import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Portal } from "../../primitives/portal";
import type { Toast } from "./toast.context";
import { intentData } from "../../theme/emphasis";
import type { Intent } from "../../theme/engine";
import { Presence } from "../../motion/presence";
import type { MotionValues } from "../../motion/read-motion";

/**
 * Entrada pela camada de movimento: desliza da direita (16px × amp) e aparece. Sob redução
 * de movimento `animate` descarta o deslocamento e mantém só a opacidade, curta e linear.
 */
const toastEnter = (m: MotionValues): Keyframe[] => [
  { opacity: 0, transform: `translateX(${16 * m.amp}px)` },
  { opacity: 1, transform: "translateX(0px)" },
];

/** Superfície de status pelo contrato de intent; `neutral` resolve para selected/fg/border-strong. */
const toastSurface = "bg-intent-subtle text-intent-text border border-intent-border";

const toastIntent: Record<string, Intent> = {
  default: "neutral",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
};

const toastVariants = defineRecipe({
  base: [
    "pointer-events-auto flex w-full max-w-sm items-start gap-3",
    "rounded-card p-4 shadow-modal",
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

const ToastItem = forwardRef<HTMLDivElement, ToastItemProps>(function ToastItem(
  { toast, onRemove, closeLabel, className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role="alert"
      className={cn(
        toastVariants({ variant: toast.variant }),
        toastSurface,
        className
      )}
      {...intentData(toastIntent[toast.variant ?? "default"])}
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
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              onRemove(toast.id);
            }}
            className="mt-2 rounded-control border border-current/30 px-2 py-1 text-sm font-medium hover:bg-state-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(toast.id)}
        className="shrink-0 rounded-control text-fg-muted hover:bg-state-hover hover:text-fg transition-opacity duration-(--motion-duration) ease-(--motion-ease)"
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
});

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
          <Presence key={toast.id} show enter={toastEnter}>
            <ToastItem toast={toast} onRemove={onRemove} closeLabel={closeLabel} />
          </Presence>
        ))}
      </div>
    </Portal>
  );
}
