"use client";

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../core/recipe";
import { animateLoop } from "../motion/animate-loop";
import { cn } from "../utils/cn";

const skeletonVariants = defineRecipe({
  base: "rounded-control bg-sunken",
});

/** Pulso de opacidade; sob redução de movimento `animateLoop` usa o pulso reduzido (D-030). */
const PULSE: Keyframe[] = [{ opacity: 1 }, { opacity: 0.5 }, { opacity: 1 }];
const PERIOD = 1600;

interface SkeletonProps extends ComponentPropsWithoutRef<"div"> {}

/**
 * Skeleton is a loading placeholder. Size it with className (w/h).
 *
 * @example
 * ```tsx
 * <Skeleton className="h-4 w-48" />
 * <Skeleton className="h-10 w-10 rounded-pill" />
 * ```
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const loop = animateLoop(el, PULSE, { period: PERIOD });
    return () => loop?.cancel();
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(skeletonVariants(), className)}
      {...props}
    />
  );
}
