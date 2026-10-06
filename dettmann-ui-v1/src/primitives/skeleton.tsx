import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../core/recipe";
import { cn } from "../utils/cn";

const skeletonVariants = defineRecipe({
  base: "animate-pulse rounded-md bg-muted",
});

interface SkeletonProps extends ComponentPropsWithoutRef<"div"> {}

/**
 * Skeleton is a loading placeholder. Size it with className (w/h).
 *
 * @example
 * ```tsx
 * <Skeleton className="h-4 w-48" />
 * <Skeleton className="h-10 w-10 rounded-full" />
 * ```
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(skeletonVariants(), className)}
      {...props}
    />
  );
}
