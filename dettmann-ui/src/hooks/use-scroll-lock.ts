"use client";

import { useEffect, useRef } from "react";

interface UseScrollLockOptions {
  /** Whether the scroll lock is active */
  enabled?: boolean;
  /** Selector for the element to lock (defaults to document.body) */
  target?: string | HTMLElement;
}

/**
 * Hook to prevent body scrolling.
 * Used for modal dialogs to prevent background scroll while modal is open.
 *
 * @example
 * ```tsx
 * function Modal({ isOpen }) {
 *   useScrollLock({ enabled: isOpen });
 *   return <div>...</div>;
 * }
 * ```
 */
export function useScrollLock(options: UseScrollLockOptions = {}): void {
  const { enabled = true, target } = options;

  const originalStyleRef = useRef<{
    overflow: string;
    paddingRight: string;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const targetElement =
      typeof target === "string"
        ? document.querySelector<HTMLElement>(target)
        : target ?? document.body;

    if (!targetElement) return;

    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    originalStyleRef.current = {
      overflow: targetElement.style.overflow,
      paddingRight: targetElement.style.paddingRight,
    };

    targetElement.style.overflow = "hidden";

    if (scrollbarWidth > 0) {
      targetElement.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      if (originalStyleRef.current) {
        targetElement.style.overflow = originalStyleRef.current.overflow;
        targetElement.style.paddingRight = originalStyleRef.current.paddingRight;
      }
    };
  }, [enabled, target]);
}
