"use client";

import {
  useState,
  type ComponentPropsWithoutRef,
  type DragEvent,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { cn } from "../../utils/cn";

export interface ReorderableListItem<T = unknown> {
  id: string;
  data: T;
}

export interface ReorderableListProps<T = unknown>
  extends Omit<ComponentPropsWithoutRef<"div">, "onChange"> {
  items: readonly ReorderableListItem<T>[];
  onReorder?: (items: ReorderableListItem<T>[]) => void;
  renderItem: (item: ReorderableListItem<T>, index: number) => ReactNode;
  disabled?: boolean;
  keyboardControls?: boolean;
}

export function ReorderableList<T>({
  items,
  onReorder,
  renderItem,
  disabled = false,
  keyboardControls = true,
  className,
  ...props
}: ReorderableListProps<T>) {
  const [internal, setInternal] = useState([...items]);
  const [dragging, setDragging] = useState<string | null>(null);
  const source = onReorder ? items : internal;

  const commit = (next: ReorderableListItem<T>[]) => {
    if (!onReorder) setInternal(next);
    onReorder?.(next);
  };

  const moveBy = (id: string, delta: -1 | 1) => {
    const from = source.findIndex((item) => item.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= source.length) return;
    const next = [...source];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    commit(next);
  };

  const moveTo = (target: string) => {
    if (!dragging || dragging === target) return;
    const from = source.findIndex((item) => item.id === dragging);
    const to = source.findIndex((item) => item.id === target);
    if (from < 0 || to < 0) return;

    const next = [...source];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    commit(next);
  };

  return (
    <div
      role="list"
      className={cn(
        "divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface",
        className,
      )}
      {...props}
    >
      {source.map((item, index) => (
        <div
          key={item.id}
          role="listitem"
          draggable={!disabled}
          aria-posinset={index + 1}
          aria-setsize={source.length}
          onDragStart={() => setDragging(item.id)}
          onDragOver={(event: DragEvent) => {
            event.preventDefault();
            moveTo(item.id);
          }}
          onDragEnd={() => setDragging(null)}
          className={cn(
            "flex min-h-12 items-stretch",
            dragging === item.id && "opacity-60",
          )}
        >
          <div
            className="flex w-9 shrink-0 items-center justify-center text-fg-subtle"
            aria-label="Drag to reorder"
            title="Drag to reorder"
          >
            <GripVertical aria-hidden="true" className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">{renderItem(item, index)}</div>
          {keyboardControls && !disabled ? (
            <div className="flex shrink-0 items-center gap-0.5 pr-1">
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition-colors",
                  "hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  index === 0 && "invisible pointer-events-none",
                )}
                aria-label="Move item up"
                onClick={() => moveBy(item.id, -1)}
                disabled={index === 0}
              >
                <ChevronUp aria-hidden="true" className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition-colors",
                  "hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  index === source.length - 1 && "invisible pointer-events-none",
                )}
                aria-label="Move item down"
                onClick={() => moveBy(item.id, 1)}
                disabled={index === source.length - 1}
              >
                <ChevronDown aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
