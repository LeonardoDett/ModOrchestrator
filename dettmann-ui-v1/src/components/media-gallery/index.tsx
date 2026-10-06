"use client";

import { useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "../../utils/cn";
import { MediaImage } from "../media-image";
import { Lightbox, type LightboxItem } from "../lightbox";

export interface MediaGalleryProps
  extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  items: readonly LightboxItem[];
  columns?: 2 | 3 | 4 | 5;
  gap?: "sm" | "md" | "lg";
  renderOverlay?: (item: LightboxItem, index: number) => ReactNode;
}

export function MediaGallery({
  items,
  columns = 4,
  gap = "md",
  renderOverlay,
  className,
  ...props
}: MediaGalleryProps) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const gapClass = { sm: "gap-2", md: "gap-4", lg: "gap-6" }[gap];
  const cols = {
    2: "grid-cols-2",
    3: "grid-cols-2 md:grid-cols-3",
    4: "grid-cols-2 md:grid-cols-4",
    5: "grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
  }[columns];

  return (
    <>
      <div className={cn("grid", cols, gapClass, className)} {...props}>
        {items.map((item, itemIndex) => (
          <button
            key={item.id}
            type="button"
            className="group relative min-w-0 overflow-hidden rounded-lg border border-border bg-sunken text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              setIndex(itemIndex);
              setOpen(true);
            }}
          >
            <MediaImage
              src={item.src}
              alt={item.alt ?? ""}
              aspect="square"
              className="w-full transition-transform duration-normal group-hover:scale-[1.02]"
            />
            {item.title || renderOverlay ? (
              <span className="absolute inset-x-0 bottom-0 bg-overlay px-3 py-2 text-xs text-fg-inverse opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {renderOverlay?.(item, itemIndex) ?? item.title}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <Lightbox
        open={open}
        items={items}
        index={index}
        onIndexChange={setIndex}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
