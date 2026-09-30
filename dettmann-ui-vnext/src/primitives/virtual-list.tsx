"use client";

import {
  useEffect,
  useRef,
  type ReactNode,
  type ComponentPropsWithoutRef,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { defineRecipe, type VariantProps } from "../core/recipe";
import { cn } from "../utils/cn";

const virtualListVariants = defineRecipe({
  base: "overflow-auto",
});

type VirtualListVariants = VariantProps<typeof virtualListVariants>;

interface VirtualListProps<T> extends Omit<ComponentPropsWithoutRef<"div">, "children">, VirtualListVariants {
  /** Array of items to render */
  items: T[];
  /** Height of each item in pixels */
  itemHeight: number;
  /** Maximum height of the container */
  maxHeight?: number;
  /** Render function for each item */
  renderItem: (item: T, index: number) => ReactNode;
  /** Overscan count (items to render outside visible area) */
  overscan?: number;
  /** Key extractor for items */
  getItemKey?: (item: T, index: number) => string | number;
  /** Scroll a given index into view (used by keyboard navigation) */
  scrollToIndex?: number;
}

/**
 * VirtualList renders only visible items for performance with large lists.
 * Uses @tanstack/react-virtual under the hood.
 *
 * @example
 * ```tsx
 * <VirtualList
 *   items={items}
 *   itemHeight={40}
 *   maxHeight={300}
 *   renderItem={(item, index) => (
 *     <div key={index}>{item.label}</div>
 *   )}
 * />
 * ```
 */
export function VirtualList<T>({
  items,
  itemHeight,
  maxHeight = 300,
  renderItem,
  overscan = 5,
  getItemKey,
  scrollToIndex,
  className,
  style,
  ...props
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight,
    overscan,
    getItemKey: getItemKey ? (index) => getItemKey(items[index]!, index) : undefined,
  });

  useEffect(() => {
    if (scrollToIndex == null) return;
    virtualizer.scrollToIndex(scrollToIndex, { align: "auto" });
  }, [scrollToIndex, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={cn(virtualListVariants(), className)}
      style={{
        maxHeight,
        ...style,
      }}
      {...props}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index]!;
          return (
            <div
              key={virtualItem.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
