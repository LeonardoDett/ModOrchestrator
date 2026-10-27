import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "../utils/cn";

export interface StackProps extends ComponentPropsWithoutRef<"div"> {
  gap?: "none" | "xs" | "sm" | "md" | "lg" | "xl";
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
  as?: ElementType;
  children?: ReactNode;
}
const gapClass = { none: "gap-0", xs: "gap-1", sm: "gap-2", md: "gap-3", lg: "gap-4", xl: "gap-6" } as const;
const alignClass = { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch" } as const;
const justifyClass = { start: "justify-start", center: "justify-center", end: "justify-end", between: "justify-between" } as const;

export function Stack({ gap="md", align="stretch", justify="start", as: Component="div", className, children, ...props }: StackProps) {
  return <Component className={cn("flex flex-col", gapClass[gap], alignClass[align], justifyClass[justify], className)} {...props}>{children}</Component>;
}
