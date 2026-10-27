"use client";

import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Avatar } from "../../components/avatar";
import { Button } from "../../components/button";
import { Menu } from "../../components/menu";

const navbarVariants = defineRecipe({
  slots: {
    root: "flex w-full shrink-0 items-center gap-3 border-b border-border bg-structure text-fg",
    brand: "flex shrink-0 items-center gap-2",
    middle: "flex min-w-0 flex-1 items-center gap-2",
    actions: "flex shrink-0 items-center gap-1",
    windowControls: "flex h-full shrink-0 items-stretch",
  },
  variants: {
    /** `compact` (48 px): barra de app de desktop. `regular` (64 px): cabeçalho de site. */
    size: {
      compact: { root: "h-12 pl-2" },
      regular: { root: "h-16 px-4" },
    },
  },
  defaultVariants: { size: "regular" },
});

interface NavbarRootProps extends ComponentPropsWithoutRef<"header"> {
  brand?: ReactNode;
  actions?: ReactNode;
  /**
   * Controles da janela (minimizar, maximizar, fechar) de uma janela sem moldura: ficam
   * colados à borda direita e ocupam a altura toda da barra.
   */
  windowControls?: ReactNode;
  size?: "compact" | "regular";
}

function NavbarRoot({ brand, actions, windowControls, size = "regular", children, className, ...props }: NavbarRootProps) {
  const s = navbarVariants({ size });
  return (
    <header
      data-layer="medium"
      className={cn(s.root(), windowControls && "pr-0", !windowControls && size === "compact" && "pr-2", className)}
      {...props}
    >
      {brand ? <div className={s.brand()}>{brand}</div> : null}
      <div className={s.middle()}>{children}</div>
      {actions ? <div className={s.actions()}>{actions}</div> : null}
      {windowControls ? <div className={s.windowControls()}>{windowControls}</div> : null}
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
  /** Nome acessível do botão. */
  label?: string;
}

function NavbarUserMenu({
  items,
  open,
  onOpenChange,
  fallback = "U",
  src,
  alt,
  status,
  label = "User menu",
}: NavbarUserMenuProps) {
  return (
    <Menu.Root open={open} onOpenChange={onOpenChange}>
      <Menu.Trigger>
        <Button type="button" emphasis="low" size="icon" aria-label={label}>
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
 * Navbar is the shell's top bar: brand, free middle slot, actions and (for a frameless
 * desktop window) the window controls flush right. Structure layer (`bg-structure`).
 *
 * @example
 * ```tsx
 * <Navbar.Root size="compact" brand={<BackToLibrary />} actions={<NotificationsButton />} windowControls={<WindowControls />}>
 *   <GameSwitcher />
 *   <ProfileSelect />
 * </Navbar.Root>
 * ```
 */
export const Navbar = {
  Root: NavbarRoot,
  UserMenu: NavbarUserMenu,
};
