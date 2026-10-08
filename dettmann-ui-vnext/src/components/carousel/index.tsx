"use client";

import { useCallback, useEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { ChevronLeftIcon } from "../../icons/glyphs/chevron-left";
import { ChevronRightIcon } from "../../icons/glyphs/chevron-right";
import { Button } from "../button";
import { cn } from "../../utils/cn";

export interface CarouselProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
  step?: number;
  snap?: boolean;
  showControls?: boolean;
}

export function Carousel({
  children,
  step = 1,
  snap = true,
  showControls = true,
  className,
  ...props
}: CarouselProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    setCanLeft(element.scrollLeft > 2);
    setCanRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 2);
  }, []);

  useEffect(() => {
    update();
    const element = ref.current;
    if (!element) return;
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [update, children]);

  const scroll = (direction: 1 | -1) => {
    const element = ref.current;
    if (!element) return;
    element.scrollBy({
      left: direction * element.clientWidth * 0.82 * step,
      behavior: "smooth",
    });
  };

  return (
    <div className="relative" {...props}>
      <div
        ref={ref}
        onScroll={update}
        className={cn(
          "flex snap-x gap-4 overflow-x-auto overscroll-x-contain scroll-smooth py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          snap && "[&>*]:snap-start",
          className,
        )}
      >
        {children}
      </div>
      {showControls ? (
        <>
          <Button
            disabled={!canLeft}
            aria-label="Previous items"
            emphasis="medium"
            size="icon"
            className="absolute left-2 top-1/2 -translate-y-1/2 shadow-overlay"
            onClick={() => scroll(-1)}
          >
            <ChevronLeftIcon size="lg" />
          </Button>
          <Button
            disabled={!canRight}
            aria-label="Next items"
            emphasis="medium"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 shadow-overlay"
            onClick={() => scroll(1)}
          >
            <ChevronRightIcon size="lg" />
          </Button>
        </>
      ) : null}
    </div>
  );
}
