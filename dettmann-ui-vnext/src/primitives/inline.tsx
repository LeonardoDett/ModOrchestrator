import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "../utils/cn";

export interface InlineProps extends ComponentPropsWithoutRef<"div"> {
  gap?: "none" | "xs" | "sm" | "md" | "lg" | "xl";
  align?: "start" | "center" | "end" | "baseline" | "stretch";
  justify?: "start" | "center" | "end" | "between";
  wrap?: boolean;
  as?: ElementType;
  children?: ReactNode;
}
const gapClass = { none: "gap-0", xs: "gap-1", sm: "gap-2", md: "gap-3", lg: "gap-4", xl: "gap-6" } as const;
const alignClass = { start: "items-start", center: "items-center", end: "items-end", baseline: "items-baseline", stretch: "items-stretch" } as const;
const justifyClass = { start: "justify-start", center: "justify-center", end: "justify-end", between: "justify-between" } as const;

export function Inline({ gap="md", align="center", justify="start", wrap=true, as: Component="div", className, children, ...props }: InlineProps) {
  return <Component className={cn("flex", gapClass[gap], alignClass[align], justifyClass[justify], wrap && "flex-wrap", className)} {...props}>{children}</Component>;
}
