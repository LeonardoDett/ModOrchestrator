"use client";

import { createContext, useContext } from "react";

/** A follow-up the user can take from the toast ("Undo", "Also enable…"). */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  duration?: number;
  /** Optional action button; running it closes the toast. */
  action?: ToastAction;
}

export interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
