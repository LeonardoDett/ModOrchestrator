"use client";

import type { RefObject } from "react";
import { Portal } from "../primitives/portal";
import { useFocusTrap } from "./use-focus-trap";
import { useScrollLock } from "./use-scroll-lock";
import { useEscapeKey } from "./use-escape-key";

interface UseOverlayOptions {
  /** Whether the overlay is active (open) */
  enabled?: boolean;
  /** Close when Escape is pressed */
  closeOnEscape?: boolean;
  /** Called when the overlay should close */
  onClose: () => void;
  /** Element to focus when the trap activates */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Restore focus to the previously focused element on close */
  returnFocus?: boolean;
}

interface UseOverlayReturn<T extends HTMLElement> {
  /** Attach to the overlay container to trap focus */
  containerRef: RefObject<T | null>;
  /** Portal used to render the overlay outside the React tree */
  Portal: typeof Portal;
}

/**
 * Shared overlay behavior for Modal, Drawer, and similar organisms:
 * focus trap, body scroll lock, Escape to close, and Portal rendering.
 */
export function useOverlay<T extends HTMLElement = HTMLDivElement>(
  options: UseOverlayOptions
): UseOverlayReturn<T> {
  const {
    enabled = true,
    closeOnEscape = true,
    onClose,
    initialFocus,
    returnFocus,
  } = options;

  const containerRef = useFocusTrap<T>({
    enabled,
    initialFocus,
    returnFocus,
  });

  useScrollLock({ enabled });
  useEscapeKey({ enabled: enabled && closeOnEscape, onEscape: onClose });

  return { containerRef, Portal };
}
