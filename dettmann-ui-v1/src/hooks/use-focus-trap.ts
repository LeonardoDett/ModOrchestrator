"use client";

import { useEffect, useRef, useCallback, type RefObject } from "react";

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "area[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

interface UseFocusTrapOptions {
  /** Whether the focus trap is active */
  enabled?: boolean;
  /** Element to focus when trap is activated (defaults to first focusable) */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Element to focus when trap is deactivated (defaults to previously focused) */
  returnFocus?: boolean;
}

/**
 * Hook to trap focus within a container element.
 * Used for modal dialogs to ensure keyboard navigation stays within the modal.
 *
 * @example
 * ```tsx
 * function Modal({ isOpen }) {
 *   const containerRef = useFocusTrap<HTMLDivElement>({ enabled: isOpen });
 *   return <div ref={containerRef}>...</div>;
 * }
 * ```
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  options: UseFocusTrapOptions = {}
): RefObject<T | null> {
  const { enabled = true, initialFocus, returnFocus = true } = options;

  const containerRef = useRef<T | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
    ).filter((el) => el.offsetParent !== null);
  }, []);

  const focusFirst = useCallback(() => {
    if (initialFocus?.current) {
      initialFocus.current.focus();
      return;
    }
    const elements = getFocusableElements();
    const firstElement = elements[0];
    if (firstElement) {
      firstElement.focus();
    }
  }, [getFocusableElements, initialFocus]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled || event.key !== "Tab") return;

      const elements = getFocusableElements();
      if (elements.length === 0) return;

      const firstElement = elements[0]!;
      const lastElement = elements[elements.length - 1]!;
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        if (activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    },
    [enabled, getFocusableElements]
  );

  useEffect(() => {
    if (!enabled) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement;

    const timeoutId = setTimeout(() => {
      focusFirst();
    }, 0);

    const container = containerRef.current;
    container?.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timeoutId);
      container?.removeEventListener("keydown", handleKeyDown);

      if (returnFocus && previouslyFocusedRef.current) {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [enabled, focusFirst, handleKeyDown, returnFocus]);

  return containerRef;
}
