"use client";

import { useId, type ReactNode } from "react";
import { DrawerProvider, type DrawerContextValue } from "./drawer.context";

interface DrawerRootProps {
  /** Whether the drawer is open */
  open: boolean;
  /** Called when open state should change */
  onOpenChange: (open: boolean) => void;
  /** Drawer content */
  children: ReactNode;
  /** Whether clicking the backdrop closes the drawer */
  closeOnBackdropClick?: boolean;
  /** Whether pressing Escape closes the drawer */
  closeOnEscape?: boolean;
}

/**
 * Drawer.Root is the provider for the Drawer component.
 *
 * @example
 * ```tsx
 * <Drawer.Root open={open} onOpenChange={setOpen}>
 *   <Drawer.Content side="right">
 *     <Drawer.Header>Title</Drawer.Header>
 *     <Drawer.Body>Content</Drawer.Body>
 *     <Drawer.Footer>Actions</Drawer.Footer>
 *   </Drawer.Content>
 * </Drawer.Root>
 * ```
 */
export function DrawerRoot({
  open,
  onOpenChange,
  children,
  closeOnBackdropClick = true,
  closeOnEscape = true,
}: DrawerRootProps) {
  const id = useId();
  const drawerId = `drawer-${id}`;
  const titleId = `drawer-title-${id}`;
  const descriptionId = `drawer-desc-${id}`;

  const contextValue: DrawerContextValue = {
    open,
    onOpenChange,
    drawerId,
    titleId,
    descriptionId,
    closeOnBackdropClick,
    closeOnEscape,
  };

  if (!open) {
    return null;
  }

  return <DrawerProvider value={contextValue}>{children}</DrawerProvider>;
}
