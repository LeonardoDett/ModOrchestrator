import { createStrictContext } from "../../utils/create-strict-context";

export interface ModalContextValue {
  /** Whether the modal is open */
  open: boolean;
  /** Change open state (`false` closes) */
  onOpenChange: (open: boolean) => void;
  /** Unique ID for the modal */
  modalId: string;
  /** ID for the modal title (for aria-labelledby) */
  titleId: string;
  /** ID for the modal description (for aria-describedby) */
  descriptionId: string;
  /** Whether clicking the backdrop closes the modal */
  closeOnBackdropClick: boolean;
  /** Whether pressing Escape closes the modal */
  closeOnEscape: boolean;
  /** Content calls it when its exit animation ends, so Root can unmount */
  onExited: () => void;
  /** Content registers itself while mounted (see `useExitPresence`) */
  registerPanel: () => () => void;
}

export const [ModalProvider, useModalContext] =
  createStrictContext<ModalContextValue>("Modal");
