"use client";

import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Avatar } from "../../components/avatar";
import { Button } from "../../components/button";
import { Menu } from "../../components/menu";

const rootVariants = defineRecipe({
  base: [
    "flex h-16 w-full items-center gap-4",
    "border-b border-secondary-border bg-secondary-subtle px-4 text-fg",
  ].join(" "),
});

interface NavbarRootProps extends ComponentPropsWithoutRef<"header"> {
  brand?: ReactNode;
  actions?: ReactNode;
}

function NavbarRoot({ brand, actions, children, className, ...props }: NavbarRootProps) {
  return (
    <header className={cn(rootVariants(), className)} {...props}>
      {brand ? <div className="shrink-0">{brand}</div> : null}
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export interface NavbarUserMenuItem {
  id: string;
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
}

interface NavbarUserMenuProps {
  items: NavbarUserMenuItem[];
  /** Controlled menu open */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  fallback?: string;
  src?: string;
  alt?: string;
  status?: "online" | "offline" | "busy";
}

function NavbarUserMenu({
  items,
  open,
  onOpenChange,
  fallback = "U",
  src,
  alt,
  status,
}: NavbarUserMenuProps) {
  return (
    <Menu.Root open={open} onOpenChange={onOpenChange}>
      <Menu.Trigger>
        <Button type="button" variant="ghost" size="icon" aria-label="User menu">
          <Avatar src={src} alt={alt} fallback={fallback} size="sm" status={status} />
        </Button>
      </Menu.Trigger>
      <Menu.Content>
        {items.map((item) => (
          <Menu.Item key={item.id} onSelect={item.onSelect} disabled={item.disabled}>
            {item.label}
          </Menu.Item>
        ))}
      </Menu.Content>
    </Menu.Root>
  );
}

/**
 * Navbar is a shell header with brand, free middle slot, and UserMenu (Avatar + Menu).
 */
export const Navbar = {
  Root: NavbarRoot,
  UserMenu: NavbarUserMenu,
};
