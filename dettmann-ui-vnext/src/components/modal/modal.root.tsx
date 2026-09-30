"use client";

import { useId, type ReactNode } from "react";
import { ModalProvider, type ModalContextValue } from "./modal.context";

interface ModalRootProps {
  /** Whether the modal is open */
  open: boolean;
  /** Called when open state should change */
  onOpenChange: (open: boolean) => void;
  /** Modal content */
  children: ReactNode;
  /** Whether clicking the backdrop closes the modal */
  closeOnBackdropClick?: boolean;
  /** Whether pressing Escape closes the modal */
  closeOnEscape?: boolean;
}

/**
 * Modal.Root is the provider for the Modal component.
 * It manages the open state and provides context to all children.
 *
 * @example
 * ```tsx
 * <Modal.Root open={open} onOpenChange={setOpen}>
 *   <Modal.Content>
 *     <Modal.Header>
 *       <Modal.CloseButton />
 *       <h2>Title</h2>
 *     </Modal.Header>
 *     <Modal.Body>Content</Modal.Body>
 *     <Modal.Footer>Actions</Modal.Footer>
 *   </Modal.Content>
 * </Modal.Root>
 * ```
 */
export function ModalRoot({
  open,
  onOpenChange,
  children,
  closeOnBackdropClick = true,
  closeOnEscape = true,
}: ModalRootProps) {
  const id = useId();
  const modalId = `modal-${id}`;
  const titleId = `modal-title-${id}`;
  const descriptionId = `modal-desc-${id}`;

  const contextValue: ModalContextValue = {
    open,
    onOpenChange,
    modalId,
    titleId,
    descriptionId,
    closeOnBackdropClick,
    closeOnEscape,
  };

  if (!open) {
    return null;
  }

  return <ModalProvider value={contextValue}>{children}</ModalProvider>;
}
