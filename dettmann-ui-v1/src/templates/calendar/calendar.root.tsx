"use client";

import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Card } from "../../components/card";

const rootVariants = defineRecipe({
  base: "flex flex-col overflow-hidden",
});

interface CalendarRootProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
}

export function CalendarRoot({ children, className, ...props }: CalendarRootProps) {
  return (
    <Card.Root className={cn(rootVariants(), className)} {...props}>
      {children}
    </Card.Root>
  );
}
