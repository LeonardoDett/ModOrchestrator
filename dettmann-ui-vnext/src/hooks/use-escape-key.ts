"use client";

import { useEffect, useCallback } from "react";

interface UseEscapeKeyOptions {
  /** Whether the escape key handler is active */
  enabled?: boolean;
  /** Callback when Escape key is pressed */
  onEscape: () => void;
}

/**
 * Hook to handle Escape key press.
 * Used for closing modal dialogs, popovers, and other dismissible overlays.
 *
 * @example
 * ```tsx
 * function Modal({ isOpen, onClose }) {
 *   useEscapeKey({ enabled: isOpen, onEscape: onClose });
 *   return <div>...</div>;
 * }
 * ```
 */
export function useEscapeKey(options: UseEscapeKeyOptions): void {
  const { enabled = true, onEscape } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onEscape();
      }
    },
    [onEscape]
  );

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, handleKeyDown]);
}
