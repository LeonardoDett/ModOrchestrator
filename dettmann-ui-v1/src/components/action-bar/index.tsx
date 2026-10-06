import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";

const barVariants = defineRecipe({
  base: [
    "flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end",
    "border-t border-border bg-surface px-4 py-4 sm:px-6",
  ].join(" "),
  variants: {
    sticky: {
      true: "sticky bottom-0 z-10",
      false: "",
    },
  },
  defaultVariants: {
    sticky: false,
  },
});

interface ActionBarProps extends ComponentPropsWithoutRef<"div"> {
  /** Stick to the bottom of the scroll container */
  sticky?: boolean;
}

/**
 * ActionBar is a footer strip for Cancel/Save (or any actions as children).
 *
 * @example
 * ```tsx
 * <ActionBar sticky>
 *   <Button variant="outline">Cancel</Button>
 *   <Button>Save</Button>
 * </ActionBar>
 * ```
 */
export function ActionBar({ className, sticky = false, ...props }: ActionBarProps) {
  return <div className={cn(barVariants({ sticky }), className)} {...props} />;
}
