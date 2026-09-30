import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../../utils/cn";

interface SlotProps extends ComponentPropsWithoutRef<"div"> { children?: ReactNode; }

function Root({ className, children, ...props }: SlotProps) {
  return <section className={cn("rounded-xl border border-border bg-surface shadow-xs", className)} {...props}>{children}</section>;
}
function Header({ className, children, ...props }: SlotProps) {
  return <header className={cn("flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 py-3", className)} {...props}>{children}</header>;
}
function Body({ className, children, ...props }: SlotProps) {
  return <div className={cn("p-4", className)} {...props}>{children}</div>;
}
function Footer({ className, children, ...props }: SlotProps) {
  return <footer className={cn("flex items-center justify-end gap-2 border-t border-border px-4 py-3", className)} {...props}>{children}</footer>;
}
function Title({ className, children, ...props }: SlotProps) {
  return <h3 className={cn("text-sm font-semibold text-fg", className)} {...props}>{children}</h3>;
}
function Description({ className, children, ...props }: SlotProps) {
  return <p className={cn("text-sm text-fg-muted", className)} {...props}>{children}</p>;
}

export const SurfaceGroup = { Root, Header, Body, Footer, Title, Description };
