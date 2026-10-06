"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useOverlay } from "../../hooks/use-overlay";
import { Button } from "../button";
import { MediaImage } from "../media-image";
import { cn } from "../../utils/cn";

export interface LightboxItem {
  id: string;
  src: string;
  alt?: string;
  title?: ReactNode;
  description?: ReactNode;
}

export interface LightboxProps {
  open: boolean;
  items: readonly LightboxItem[];
  index?: number;
  onIndexChange?: (index: number) => void;
  onClose: () => void;
  className?: string;
}

export function Lightbox({
  open,
  items,
  index = 0,
  onIndexChange,
  onClose,
  className,
}: LightboxProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { containerRef, Portal } = useOverlay<HTMLDivElement>({
    enabled: open,
    closeOnEscape: true,
    onClose,
    initialFocus: closeRef,
  });

  useEffect(() => {
    if (!open || !items.length) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onIndexChange?.((index + 1) % items.length);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        onIndexChange?.((index - 1 + items.length) % items.length);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, index, items.length, onIndexChange]);

  if (!open || !items.length) return null;

  const item = items[Math.min(index, items.length - 1)]!;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-modal flex items-center justify-center bg-overlay p-6"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          ref={containerRef}
          className={cn(
            "relative flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-raised shadow-2xl",
            className,
          )}
          role="dialog"
          aria-modal="true"
          aria-label={typeof item.title === "string" ? item.title : "Image preview"}
        >
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-3">
            <div className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
              {item.title}
            </div>
            <span className="text-xs text-fg-muted">
              {index + 1} / {items.length}
            </span>
            <Button
              ref={closeRef}
              variant="ghost"
              size="icon-sm"
              aria-label="Close image preview"
              onClick={onClose}
            >
              <X aria-hidden="true" />
            </Button>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-page/20 p-6">
            <MediaImage
              src={item.src}
              alt={item.alt ?? ""}
              className="max-h-[70vh] w-auto rounded-lg object-contain"
            />
            {items.length > 1 ? (
              <>
                <Button
                  aria-label="Previous image"
                  variant="secondary"
                  size="icon"
                  className="absolute left-4 top-1/2 -translate-y-1/2"
                  onClick={() =>
                    onIndexChange?.((index - 1 + items.length) % items.length)
                  }
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <Button
                  aria-label="Next image"
                  variant="secondary"
                  size="icon"
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  onClick={() => onIndexChange?.((index + 1) % items.length)}
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </>
            ) : null}
          </div>

          {item.description ? (
            <div className="shrink-0 border-t border-border px-4 py-3 text-sm text-fg-muted">
              {item.description}
            </div>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}
