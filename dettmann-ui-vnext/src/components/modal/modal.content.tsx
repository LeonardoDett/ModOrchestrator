"use client";

import { useEffect, type ComponentPropsWithoutRef, type MouseEvent } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Backdrop } from "../../primitives/backdrop";
import { useOverlay } from "../../hooks/use-overlay";
import { useModalContext } from "./modal.context";
import { Presence } from "../../motion/presence";
import { fadeEnter, fadeExit, overlayEnter, overlayExit } from "../../motion/overlay-keyframes";

const modalContentVariants = defineRecipe({
  base: [
    "relative flex flex-col",
    "bg-raised rounded-card shadow-modal",
    "max-h-[85vh] overflow-hidden",
  ].join(" "),
  variants: {
    size: {
      sm: "w-full max-w-sm",
      md: "w-full max-w-md",
      lg: "w-full max-w-lg",
      xl: "w-full max-w-xl",
      "2xl": "w-full max-w-2xl",
      wide: "w-full max-w-[min(68.75rem,90vw)] h-[min(85vh,85dvh)]",
      full: "w-full max-w-[calc(100vw-2rem)] h-[calc(100vh-2rem)]",
      /** D-040: the screen gives width and height (`className`), as its board measures them. */
      custom: "",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

type ModalContentVariants = VariantProps<typeof modalContentVariants>;

interface ModalContentProps
  extends ComponentPropsWithoutRef<"div">,
    ModalContentVariants {}

/**
 * Modal.Content is the main container for the modal dialog.
 * It renders inside a Portal with a Backdrop and handles focus trap.
 */
export function ModalContent({
  children,
  className,
  size,
  ...props
}: ModalContentProps) {
  const {
    open,
    onOpenChange,
    modalId,
    titleId,
    descriptionId,
    closeOnBackdropClick,
    closeOnEscape,
    onExited,
    registerPanel,
  } = useModalContext("Content");

  useEffect(() => registerPanel(), [registerPanel]);

  const { containerRef, Portal } = useOverlay<HTMLDivElement>({
    enabled: open,
    closeOnEscape,
    onClose: () => onOpenChange(false),
  });

  // Em saída o `Presence` mantém o último filho renderizado aberto: o estado vai direto no nó.
  // Fechado, o painel segue visível, mas fora do foco, do ponteiro e da árvore de acessibilidade.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.toggleAttribute("inert", !open);
    el.dataset.state = open ? "open" : "closed";
  }, [open, containerRef]);

  const handleBackdropClick = (event: MouseEvent) => {
    if (open && closeOnBackdropClick && event.target === event.currentTarget) {
      onOpenChange(false);
    }
  };

  return (
    <Portal>
      <Presence show={open} enter={fadeEnter} exit={fadeExit}>
        <Backdrop state="entered" onClick={handleBackdropClick} />
      </Presence>
      <Presence show={open} enter={overlayEnter} exit={overlayExit} onExited={onExited}>
        <div
          className="fixed inset-0 z-modal flex items-center justify-center p-4 pointer-events-none"
          onClick={handleBackdropClick}
        >
          <div
            ref={containerRef}
            id={modalId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            data-state="open"
            className={cn(modalContentVariants({ size }), "pointer-events-auto", className)}
            onClick={(e) => e.stopPropagation()}
            {...props}
          >
            {children}
          </div>
        </div>
      </Presence>
    </Portal>
  );
}
