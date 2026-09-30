"use client";

import { type ComponentPropsWithoutRef, type MouseEvent } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Backdrop } from "../../primitives/backdrop";
import { useOverlay } from "../../hooks/use-overlay";
import { useDrawerContext } from "./drawer.context";

const drawerContentVariants = defineRecipe({
  base: [
    "fixed z-modal flex flex-col",
    "bg-raised shadow-xl rounded-xl",
    "outline-none overflow-hidden",
  ].join(" "),
  variants: {
    side: {
      left: "inset-y-0 left-0 h-full w-full max-w-md rounded-l-none rounded-r-xl border-r border-border",
      right: "inset-y-0 right-0 h-full w-full max-w-md rounded-r-none rounded-l-xl border-l border-border",
      top: "inset-x-0 top-0 w-full max-h-[80vh] rounded-t-none rounded-b-xl border-b border-border",
      bottom: "inset-x-0 bottom-0 w-full max-h-[80vh] rounded-b-none rounded-t-xl border-t border-border",
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
  } = useDrawerContext("Content");

  const { containerRef, Portal } = useOverlay<HTMLDivElement>({
    enabled: open,
    closeOnEscape,
    onClose: () => onOpenChange(false),
  });

  const handleBackdropClick = (event: MouseEvent) => {
    if (closeOnBackdropClick && event.target === event.currentTarget) {
      onOpenChange(false);
    }
  };

  return (
    <Portal>
      <Backdrop state="entered" onClick={handleBackdropClick} />
      <div
        ref={containerRef}
        id={drawerId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={cn(drawerContentVariants({ side }), className)}
        {...props}
      >
        {children}
      </div>
    </Portal>
  );
}
