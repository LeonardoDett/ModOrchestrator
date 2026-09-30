import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "../utils/cn";

export interface SurfaceProps extends ComponentPropsWithoutRef<"div"> {
  layer?: "canvas" | "surface" | "raised" | "sunken" | "structure";
  bordered?: boolean;
  interactive?: boolean;
  children?: ReactNode;
}

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface({ layer="surface", bordered=false, interactive=false, className, children, ...props }, ref) {
  const background = { canvas: "bg-page", surface: "bg-surface", raised: "bg-raised", sunken: "bg-sunken", structure: "bg-structure" }[layer];
  return <div ref={ref} className={cn("relative", background, bordered && "border border-border", interactive && "transition-colors duration-fast hover:bg-hover", className)} {...props}>{children}</div>;
});
