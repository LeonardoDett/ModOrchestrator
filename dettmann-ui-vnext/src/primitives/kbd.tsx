import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe, type VariantProps } from "../core/recipe";
import { cn } from "../utils/cn";

const kbdVariants = defineRecipe({
  base: [
    "inline-flex items-center justify-center",
    "font-mono font-medium",
    "bg-muted text-fg",
    "border border-border",
    "rounded-sm",
    "shadow-xs",
  ].join(" "),
  variants: {
    /** Size of the keyboard key */
    size: {
      sm: "h-5 min-w-5 px-1 text-xs",
      md: "h-6 min-w-6 px-1.5 text-xs",
      lg: "h-7 min-w-7 px-2 text-sm",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

type KbdVariants = VariantProps<typeof kbdVariants>;

type KbdProps = ComponentPropsWithoutRef<"kbd"> & KbdVariants;

/**
 * Kbd represents a keyboard key or shortcut.
 * Useful for showing keyboard shortcuts in tooltips, menus, or help text.
 *
 * @example
 * ```tsx
 * // Single key
 * <Kbd>⌘</Kbd>
 *
 * // Shortcut combination
 * <span className="flex items-center gap-1">
 *   <Kbd>⌘</Kbd>
 *   <Kbd>K</Kbd>
 * </span>
 *
 * // Different sizes
 * <Kbd size="sm">Esc</Kbd>
 * <Kbd size="lg">Enter</Kbd>
 * ```
 */
export function Kbd({ className, size, children, ...props }: KbdProps) {
  return (
    <kbd className={cn(kbdVariants({ size }), className)} {...props}>
      {children}
    </kbd>
  );
}
