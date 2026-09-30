"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type PortalProps = {
  /** Content to render in the portal */
  children: ReactNode;
  /** DOM element to render into (defaults to document.body) */
  container?: Element | null;
  /** Custom container selector (alternative to container prop) */
  containerSelector?: string;
  /** Disable the portal (renders children in place) */
  disabled?: boolean;
};

/**
 * Portal renders children into a DOM node outside the parent component's hierarchy.
 * Useful for modals, tooltips, popovers, and other overlay elements.
 *
 * @example
 * ```tsx
 * // Render to document.body (default)
 * <Portal>
 *   <Modal>Content</Modal>
 * </Portal>
 *
 * // Render to a specific container
 * <Portal container={document.getElementById("modal-root")}>
 *   <Modal>Content</Modal>
 * </Portal>
 *
 * // Render to container by selector
 * <Portal containerSelector="#modal-root">
 *   <Modal>Content</Modal>
 * </Portal>
 *
 * // Disable portal (render in place)
 * <Portal disabled>
 *   <div>Renders here, not in portal</div>
 * </Portal>
 * ```
 */
export function Portal({
  children,
  container,
  containerSelector,
  disabled = false,
}: PortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (disabled) {
    return <>{children}</>;
  }

  if (!mounted) {
    return null;
  }

  const resolvedContainer =
    container ??
    (containerSelector ? document.querySelector(containerSelector) : null) ??
    document.body;

  return createPortal(children, resolvedContainer);
}
