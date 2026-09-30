import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";

const drawerHeaderVariants = defineRecipe({
  base: [
    "flex items-center justify-between gap-4",
    "px-6 pt-6 pb-4",
    "border-b border-border",
  ].join(" "),
});

interface DrawerHeaderProps extends ComponentPropsWithoutRef<"div"> {}

/**
 * Drawer.Header is the header section of the drawer.
 */
export function DrawerHeader({
  children,
  className,
  ...props
}: DrawerHeaderProps) {
  return (
    <div className={cn(drawerHeaderVariants(), className)} {...props}>
      {children}
    </div>
  );
}
