"use client";

import { useEffect, type ComponentPropsWithoutRef, type MouseEvent } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Backdrop } from "../../primitives/backdrop";
import { useOverlay } from "../../hooks/use-overlay";
import { useDrawerContext } from "./drawer.context";
import { Presence } from "../../motion/presence";
import { fadeEnter, fadeExit, slideEnter, slideExit } from "../../motion/overlay-keyframes";

const drawerContentVariants = defineRecipe({
  base: [
    "fixed z-modal flex flex-col",
    "bg-raised shadow-modal",
    "focus-bare overflow-hidden",
  ].join(" "),
  variants: {
    side: {
      left: "inset-y-0 left-0 h-full w-full max-w-md rounded-r-panel border-r border-border",
      right: "inset-y-0 right-0 h-full w-full max-w-md rounded-l-panel border-l border-border",
      top: "inset-x-0 top-0 w-full max-h-[80vh] rounded-b-panel border-b border-border",
      bottom: "inset-x-0 bottom-0 w-full max-h-[80vh] rounded-t-panel border-t border-border",
    },
  },
  defaultVariants: {
    side: "right",
  },
});

type DrawerContentVariants = VariantProps<typeof drawerContentVariants>;

interface DrawerContentProps
  extends ComponentPropsWithoutRef<"div">,
    DrawerContentVariants {}

/**
 * Drawer.Content is the sliding panel. Use `side` to choose the edge.
 */
export function DrawerContent({
  children,
  className,
  side,
  ...props
}: DrawerContentProps) {
  const {
    open,
    onOpenChange,
    drawerId,
    titleId,
    descriptionId,
    closeOnBackdropClick,
    closeOnEscape,
    onExited,
    registerPanel,
  } = useDrawerContext("Content");
  const from = side ?? "right";

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
      <Presence show={open} enter={slideEnter(from)} exit={slideExit(from)} onExited={onExited}>
        <div
          ref={containerRef}
          id={drawerId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          data-state="open"
          className={cn(drawerContentVariants({ side }), className)}
          {...props}
        >
          {children}
        </div>
      </Presence>
    </Portal>
  );
}
