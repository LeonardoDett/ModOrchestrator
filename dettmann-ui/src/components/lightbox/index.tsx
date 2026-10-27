"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { XIcon } from "../../icons/glyphs/x";
import { ChevronLeftIcon } from "../../icons/glyphs/chevron-left";
import { ChevronRightIcon } from "../../icons/glyphs/chevron-right";
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

/** Accessible names of the lightbox (localize them). */
export interface LightboxLabels {
  /** Name of the dialog when the item has no string title. */
  dialog?: string;
  close?: string;
  previous?: string;
  next?: string;
}

export interface LightboxProps {
  open: boolean;
  items: readonly LightboxItem[];
  index?: number;
  onIndexChange?: (index: number) => void;
  onClose: () => void;
  className?: string;
  labels?: LightboxLabels;
}

export function Lightbox({
  open,
  items,
  index = 0,
  onIndexChange,
  onClose,
  className,
  labels,
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
            "relative flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-card border border-border bg-raised shadow-modal",
            className,
          )}
          role="dialog"
          aria-modal="true"
          aria-label={typeof item.title === "string" ? item.title : (labels?.dialog ?? "Image preview")}
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
              emphasis="low"
              size="icon-sm"
              aria-label={labels?.close ?? "Close image preview"}
              onClick={onClose}
            >
              <XIcon size="lg" />
            </Button>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-canvas/20 p-6">
            <MediaImage
              src={item.src}
              alt={item.alt ?? ""}
              className="max-h-[70vh] w-auto rounded-control object-contain"
            />
            {items.length > 1 ? (
              <>
                <Button
                  aria-label={labels?.previous ?? "Previous image"}
                  emphasis="medium"
                  size="icon"
                  className="absolute left-4 top-1/2 -translate-y-1/2"
                  onClick={() =>
                    onIndexChange?.((index - 1 + items.length) % items.length)
                  }
                >
                  <ChevronLeftIcon size="lg" />
                </Button>
                <Button
                  aria-label={labels?.next ?? "Next image"}
                  emphasis="medium"
                  size="icon"
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  onClick={() => onIndexChange?.((index + 1) % items.length)}
                >
                  <ChevronRightIcon size="lg" />
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
