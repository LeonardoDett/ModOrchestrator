"use client";

import { useCallback, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

export type RovingOrientation = "horizontal" | "vertical" | "both";

export interface GetNextRovingIndexOptions {
  /** Which arrow keys move focus */
  orientation?: RovingOrientation;
  /** Wrap from last to first (and vice versa) */
  loop?: boolean;
}

/**
 * Pure index math for roving tabindex (Tabs, Accordion, List).
 * Returns the next index, or `null` if the key is not a navigation key.
 */
export function getNextRovingIndex(
  currentIndex: number,
  itemCount: number,
  key: string,
  options: GetNextRovingIndexOptions = {}
): number | null {
  const { orientation = "horizontal", loop = true } = options;
  if (itemCount <= 0 || currentIndex < 0) return null;

  const last = itemCount - 1;
  const horizontal = orientation === "horizontal" || orientation === "both";
  const vertical = orientation === "vertical" || orientation === "both";

  const prev = () => {
    if (currentIndex > 0) return currentIndex - 1;
    return loop ? last : currentIndex;
  };

  const next = () => {
    if (currentIndex < last) return currentIndex + 1;
    return loop ? 0 : currentIndex;
  };

  if (horizontal && key === "ArrowLeft") return prev();
  if (horizontal && key === "ArrowRight") return next();
  if (vertical && key === "ArrowUp") return prev();
  if (vertical && key === "ArrowDown") return next();
  if (key === "Home") return 0;
  if (key === "End") return last;

  return null;
}

export function isRovingKey(key: string, orientation: RovingOrientation = "horizontal"): boolean {
  const horizontal = orientation === "horizontal" || orientation === "both";
  const vertical = orientation === "vertical" || orientation === "both";

  if (key === "Home" || key === "End") return true;
  if (horizontal && (key === "ArrowLeft" || key === "ArrowRight")) return true;
  if (vertical && (key === "ArrowUp" || key === "ArrowDown")) return true;
  return false;
}

interface UseRovingTabindexOptions {
  /** Which arrow keys move focus */
  orientation?: RovingOrientation;
  /** Wrap from last to first (and vice versa) */
  loop?: boolean;
}

/**
 * Registers focusable items by value and moves focus with arrow/Home/End keys.
 * Used by Tabs and Accordion; List uses {@link getNextRovingIndex} when items are virtualized.
 */
export function useRovingTabindex(options: UseRovingTabindexOptions = {}) {
  const { orientation = "horizontal", loop = true } = options;
  const itemsRef = useRef<Map<string, HTMLElement>>(new Map());

  const register = useCallback((value: string, element: HTMLElement | null) => {
    if (element) {
      itemsRef.current.set(value, element);
    }
  }, []);

  const unregister = useCallback((value: string) => {
    itemsRef.current.delete(value);
  }, []);

  const getItems = useCallback(() => itemsRef.current, []);

  const handleKeyDown = useCallback(
    (currentValue: string, event: ReactKeyboardEvent | KeyboardEvent): string | null => {
      if (!isRovingKey(event.key, orientation)) return null;

      const entries = Array.from(itemsRef.current.entries());
      const currentIndex = entries.findIndex(([value]) => value === currentValue);
      if (currentIndex === -1) return null;

      event.preventDefault();

      const nextIndex = getNextRovingIndex(currentIndex, entries.length, event.key, {
        orientation,
        loop,
      });

      if (nextIndex === null || nextIndex === currentIndex) return null;

      const next = entries[nextIndex];
      if (!next) return null;

      const [nextValue, nextElement] = next;
      nextElement.focus();
      return nextValue;
    },
    [orientation, loop]
  );

  return { register, unregister, getItems, handleKeyDown };
}
