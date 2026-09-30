"use client";

import {
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "../../utils/cn";

export interface SplitPaneProps extends ComponentPropsWithoutRef<"div"> {
  sidebar: ReactNode;
  main: ReactNode;
  initialSize?: number;
  minSize?: number;
  maxSize?: number;
  side?: "left" | "right";
}

export function SplitPane({
  sidebar,
  main,
  initialSize = 300,
  minSize = 220,
  maxSize = 520,
  side = "left",
  className,
  ...props
}: SplitPaneProps) {
  const [size, setSize] = useState(initialSize);
  const [dragging, setDragging] = useState(false);

  const updateFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const next = side === "left" ? event.clientX - rect.left : rect.right - event.clientX;
    setSize(Math.min(maxSize, Math.max(minSize, next)));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateFromPointer(event);
  };

  const onHandleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 32 : 16;
    const decreasing = side === "left" ? event.key === "ArrowLeft" : event.key === "ArrowRight";
    const increasing = side === "left" ? event.key === "ArrowRight" : event.key === "ArrowLeft";

    if (!decreasing && !increasing) return;
    event.preventDefault();
    setSize((current) =>
      Math.min(maxSize, Math.max(minSize, current + (increasing ? step : -step))),
    );
  };

  const style =
    side === "left"
      ? {
          gridTemplateColumns: `${size}px minmax(0, 1fr)`,
          "--split-size": `${size}px`,
        }
      : {
          gridTemplateColumns: `minmax(0, 1fr) ${size}px`,
          "--split-size": `${size}px`,
        };

  return (
    <div
      className={cn("relative grid min-h-0 min-w-0", className)}
      style={style as CSSProperties}
      onPointerMove={onPointerMove}
      onPointerUp={() => setDragging(false)}
      {...props}
    >
      {side === "left" ? (
        <>
          <aside className="min-h-0 min-w-0 overflow-auto border-r border-border">{sidebar}</aside>
          <main className="min-h-0 min-w-0 overflow-auto">{main}</main>
        </>
      ) : (
        <>
          <main className="min-h-0 min-w-0 overflow-auto">{main}</main>
          <aside className="min-h-0 min-w-0 overflow-auto border-l border-border">{sidebar}</aside>
        </>
      )}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={minSize}
        aria-valuemax={maxSize}
        aria-valuenow={size}
        tabIndex={0}
        className={cn(
          "absolute inset-y-0 z-10 w-2 cursor-col-resize bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          "hover:bg-primary/20",
          side === "left"
            ? "left-[calc(var(--split-size)-4px)]"
            : "right-[calc(var(--split-size)-4px)]",
          dragging && "bg-primary/30",
        )}
        onKeyDown={onHandleKeyDown}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!dragging) return;
          updateFromPointer(event);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          setDragging(false);
        }}
      />
    </div>
  );
}
