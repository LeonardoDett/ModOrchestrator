import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";

const drawerFooterVariants = defineRecipe({
  base: [
    "flex items-center justify-end gap-2",
    "px-6 pt-4 pb-6",
    "border-t border-border",
  ].join(" "),
});

interface DrawerFooterProps extends ComponentPropsWithoutRef<"div"> {}

/**
 * Drawer.Footer is the footer section for actions.
 * Defaults to `flex items-center justify-end gap-2` (overridable via className).
 */
export function DrawerFooter({
  children,
  className,
  ...props
}: DrawerFooterProps) {
  return (
    <div className={cn(drawerFooterVariants(), className)} {...props}>
      {children}
    </div>
  );
}
