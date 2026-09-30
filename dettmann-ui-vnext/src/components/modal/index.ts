import { ModalRoot } from "./modal.root";
import { ModalContent } from "./modal.content";
import { ModalHeader } from "./modal.header";
import { ModalTitle } from "./modal.title";
import { ModalBody } from "./modal.body";
import { ModalFooter } from "./modal.footer";
import { ModalCloseButton } from "./modal.close-button";

/**
 * Modal is a compound component for dialog overlays.
 *
 * @example
 * ```tsx
 * <Modal.Root open={open} onOpenChange={setOpen}>
 *   <Modal.Content size="md">
 *     <Modal.Header>
 *       <Modal.Title>Dialog Title</Modal.Title>
 *       <Modal.CloseButton />
 *     </Modal.Header>
 *     <Modal.Body>
 *       <p>Dialog content goes here.</p>
 *     </Modal.Body>
 *     <Modal.Footer>
 *       <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
 *       <Button>Confirm</Button>
 *     </Modal.Footer>
 *   </Modal.Content>
 * </Modal.Root>
 * ```
 */
export const Modal = {
  /** Root provider - manages state and context */
  Root: ModalRoot,
  /** Main container with backdrop and focus trap */
  Content: ModalContent,
  /** Header section */
  Header: ModalHeader,
  /** Title element (sets aria-labelledby) */
  Title: ModalTitle,
  /** Scrollable body section */
  Body: ModalBody,
  /** Footer section for actions */
  Footer: ModalFooter,
  /** Close button */
  CloseButton: ModalCloseButton,
};
