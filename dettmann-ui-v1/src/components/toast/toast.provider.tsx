"use client";

import { useReducer, useCallback, type ReactNode } from "react";
import { ToastContext, type Toast } from "./toast.context";
import { ToastViewport } from "./toast.viewport";

type ToastAction =
  | { type: "ADD_TOAST"; payload: Toast }
  | { type: "REMOVE_TOAST"; payload: string };

function toastReducer(state: Toast[], action: ToastAction): Toast[] {
  switch (action.type) {
    case "ADD_TOAST":
      return [...state, action.payload];
    case "REMOVE_TOAST":
      return state.filter((toast) => toast.id !== action.payload);
    default:
      return state;
  }
}

interface ToastProviderProps {
  children: ReactNode;
  /** Accessible name of the toast close buttons (localize it). */
  closeLabel?: string;
}

let toastCount = 0;

/**
 * ToastProvider manages toast notifications state globally.
 * Place at the root of your app to enable useToast() anywhere.
 *
 * @example
 * ```tsx
 * <ToastProvider>
 *   <App />
 * </ToastProvider>
 * ```
 */
export function ToastProvider({ children, closeLabel }: ToastProviderProps) {
  const [toasts, dispatch] = useReducer(toastReducer, []);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = `toast-${++toastCount}`;
    const newToast: Toast = {
      id,
      duration: 5000,
      variant: "default",
      ...toast,
    };
    dispatch({ type: "ADD_TOAST", payload: newToast });

    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        dispatch({ type: "REMOVE_TOAST", payload: id });
      }, newToast.duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    dispatch({ type: "REMOVE_TOAST", payload: id });
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastViewport toasts={toasts} onRemove={removeToast} closeLabel={closeLabel} />
    </ToastContext.Provider>
  );
}
