"use client";

import {
  useCallback,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Icon, type LucideIconComponent } from "../../primitives/icon";
import { Button } from "../../components/button";
import { Accordion } from "../../components/accordion";
import { Drawer } from "../../components/drawer";
import { getNextRovingIndex, isRovingKey } from "../../hooks/use-roving-tabindex";
import { useControllableState } from "../../hooks/use-controllable-state";

export interface SidebarItem {
  id: string;
  label: string;
  icon?: LucideIconComponent;
  href?: string;
  onClick?: () => void;
  children?: SidebarItem[];
  /** Reserved nav entries stay visible but do not navigate. */
  disabled?: boolean;
  /** Trailing slot, typically a Badge. Hidden while the column is collapsed. */
  badge?: ReactNode;
}

/** Solid (`strong`) or soft (`subtle`) fill of the 30% role (`secondary`). */
export type SidebarEmphasis = "strong" | "subtle";

const asideVariants = defineRecipe({
  base: ["hidden h-full flex-col border-r", "md:flex"].join(" "),
  variants: {
    collapsed: {
      true: "w-16",
      false: "w-64",
    },
    emphasis: {
      strong: "border-secondary bg-secondary text-on-secondary",
      subtle: "border-secondary-border bg-secondary-subtle text-fg",
    },
  },
  defaultVariants: {
    emphasis: "strong",
  },
});

const itemVariants = defineRecipe({
  base: [
    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  ].join(" "),
  variants: {
    collapsed: {
      true: "justify-center px-2",
      false: "",
    },
    /** Current page: primary subtle fill and primary text. */
    current: {
      true: "bg-primary-subtle font-medium text-primary-text hover:bg-primary-subtle-hover",
      false: "",
    },
    emphasis: {
      strong: "focus-visible:ring-primary focus-visible:ring-offset-secondary",
      subtle: "focus-visible:ring-offset-page",
    },
    disabled: {
      true: "",
      false: "",
    },
  },
  compoundVariants: [
    {
      emphasis: "strong",
      current: false,
      disabled: false,
      class: "text-on-secondary hover:bg-secondary-hover active:bg-secondary-pressed",
    },
    {
      emphasis: "subtle",
      current: false,
      disabled: false,
      class: "text-fg hover:bg-hover active:bg-pressed",
    },
    {
      disabled: true,
      class: "pointer-events-none bg-muted text-fg-subtle",
    },
  ],
  defaultVariants: {
    current: false,
    emphasis: "strong",
    disabled: false,
  },
});

/** Beats classes baked into Button, Accordion and Drawer, which assume a neutral surface. */
const strongChromeClass =
  "!text-on-secondary hover:!bg-secondary-hover hover:!text-on-secondary active:!bg-secondary-pressed focus-visible:!ring-primary focus-visible:!ring-offset-secondary";

const drawerSurfaceClass: Record<SidebarEmphasis, string> = {
  strong: "!border-secondary !bg-secondary !text-on-secondary",
  subtle: "!border-secondary-border !bg-secondary-subtle !text-fg",
};

interface SidebarRootProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  items: SidebarItem[];
  /** Marks the matching item with aria-current="page" */
  currentId?: string;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /**
   * Fill of the 30% role (`secondary`).
   * `strong` is the solid color; `subtle` is the soft color.
   */
  emphasis?: SidebarEmphasis;
  header?: ReactNode;
  /** Replaces `header` on the collapsed desktop column (for example a mark instead of a wordmark). */
  collapsedHeader?: ReactNode;
  footer?: ReactNode;
}

function SidebarLeaf({
  item,
  collapsed,
  current,
  emphasis,
}: {
  item: SidebarItem;
  collapsed: boolean;
  current: boolean;
  emphasis: SidebarEmphasis;
}) {
  const content = (
    <>
      {item.icon ? <Icon icon={item.icon} size="sm" color="current" /> : null}
      {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
      {!collapsed && item.badge ? <span className="shrink-0">{item.badge}</span> : null}
    </>
  );

  const className = itemVariants({
    collapsed,
    current: item.disabled ? false : current,
    emphasis,
    disabled: Boolean(item.disabled),
  });

  if (item.disabled) {
    return (
      <span className="block w-full" title={item.label}>
        <button
          type="button"
          className={className}
          disabled
          aria-label={collapsed ? item.label : undefined}
        >
          {content}
        </button>
      </span>
    );
  }

  if (item.href) {
    return (
      <a
        href={item.href}
        className={className}
        title={item.label}
        aria-current={current ? "page" : undefined}
        onClick={item.onClick}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={className}
      title={item.label}
      aria-current={current ? "page" : undefined}
      onClick={item.onClick}
    >
      {content}
    </button>
  );
}

function SidebarTree({
  items,
  collapsed,
  currentId,
  emphasis,
}: {
  items: SidebarItem[];
  collapsed: boolean;
  currentId?: string;
  emphasis: SidebarEmphasis;
}) {
  const groups = items.filter((item) => item.children && item.children.length > 0);
  const defaultOpen = groups.map((item) => item.id);

  const renderLeaves = (nodes: SidebarItem[]) =>
    nodes
      .filter((item) => !item.children?.length)
      .map((item) => (
        <SidebarLeaf
          key={item.id}
          item={item}
          collapsed={collapsed}
          current={item.id === currentId}
          emphasis={emphasis}
        />
      ));

  const groupNodes = items.filter((item) => item.children?.length);

  return (
    <nav aria-label="Sidebar" className="flex flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto p-2">
      {renderLeaves(items)}
      {groupNodes.length > 0 ? (
        <Accordion.Root multiple defaultValue={defaultOpen} className="space-y-1">
          {groupNodes.map((group) => (
            <Accordion.Item
              key={group.id}
              value={group.id}
              className="border-0 bg-transparent"
            >
              <Accordion.Trigger
                value={group.id}
                className={cn(
                  "rounded-lg px-2 py-2",
                  emphasis === "strong" && strongChromeClass
                )}
              >
                <span className="flex items-center gap-2">
                  {group.icon ? <Icon icon={group.icon} size="sm" /> : null}
                  {!collapsed ? group.label : null}
                </span>
              </Accordion.Trigger>
              <Accordion.Content value={group.id} className="px-1 py-1">
                <div className="flex flex-col gap-1 pl-2">
                  {group.children!.map((child) => (
                    <SidebarLeaf
                      key={child.id}
                      item={child}
                      collapsed={collapsed}
                      current={child.id === currentId}
                      emphasis={emphasis}
                    />
                  ))}
                </div>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      ) : null}
    </nav>
  );
}

function SidebarNavList({
  items,
  collapsed,
  currentId,
  emphasis,
}: {
  items: SidebarItem[];
  collapsed: boolean;
  currentId?: string;
  emphasis: SidebarEmphasis;
}) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const flat = flattenItems(items);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isRovingKey(event.key, "vertical")) return;
    const next = getNextRovingIndex(focusedIndex, flat.length, event.key, {
      orientation: "vertical",
      loop: true,
    });
    if (next === null) return;
    event.preventDefault();
    setFocusedIndex(next);
  };

  return (
    <div onKeyDown={onKeyDown} className="flex min-h-0 flex-1 flex-col">
      <SidebarTree
        items={items}
        collapsed={collapsed}
        currentId={currentId}
        emphasis={emphasis}
      />
    </div>
  );
}

function flattenItems(items: SidebarItem[]): SidebarItem[] {
  return items.flatMap((item) =>
    item.children?.length ? [item, ...flattenItems(item.children)] : [item]
  );
}

function SidebarRoot({
  items,
  currentId,
  collapsed: collapsedProp,
  defaultCollapsed = false,
  onCollapsedChange,
  header,
  collapsedHeader,
  footer,
  emphasis = "strong",
  className,
  ...props
}: SidebarRootProps) {
  const [collapsed, setCollapsed] = useControllableState({
    value: collapsedProp,
    defaultValue: defaultCollapsed,
    onChange: onCollapsedChange,
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!collapsed);
  }, [collapsed, setCollapsed]);

  return (
    <div className={cn("flex h-full", className)} {...props}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open sidebar"
        onClick={() => setMobileOpen(true)}
      >
        <Icon icon={Menu} size="sm" />
      </Button>

      <aside className={cn(asideVariants({ collapsed, emphasis }), "overflow-hidden")}>
        {(collapsed ? collapsedHeader : header) ? (
          <div
            className={cn(
              "min-w-0 shrink-0 overflow-hidden",
              collapsed && "flex justify-center"
            )}
          >
            {collapsed ? collapsedHeader : header}
          </div>
        ) : null}
        <div className={cn("flex shrink-0 p-2", collapsed ? "justify-center" : "justify-end")}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={emphasis === "strong" ? strongChromeClass : undefined}
            onClick={toggleCollapsed}
          >
            <Icon icon={collapsed ? PanelLeftOpen : PanelLeftClose} size="sm" />
          </Button>
        </div>
        <SidebarNavList
          items={items}
          collapsed={collapsed}
          currentId={currentId}
          emphasis={emphasis}
        />
        {footer}
      </aside>

      <Drawer.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Drawer.Content
          side="left"
          className={cn("max-w-xs", drawerSurfaceClass[emphasis])}
        >
          <Drawer.Header className="!border-secondary-border">
            {header ? <div className="min-w-0 flex-1">{header}</div> : null}
            <Drawer.Title className={header ? "sr-only" : emphasis === "strong" ? "!text-on-secondary" : undefined}>
              Navigation
            </Drawer.Title>
            <Drawer.CloseButton className={emphasis === "strong" ? strongChromeClass : undefined} />
          </Drawer.Header>
          <Drawer.Body className={cn("p-0", emphasis === "strong" && "!text-on-secondary")}>
            <SidebarTree
              items={items}
              collapsed={false}
              currentId={currentId}
              emphasis={emphasis}
            />
          </Drawer.Body>
        </Drawer.Content>
      </Drawer.Root>
    </div>
  );
}

/**
 * Sidebar is a JSON-driven nav. Desktop is a collapsible column; mobile uses Drawer.
 *
 * @example
 * ```tsx
 * <Sidebar.Root items={[{ id: "home", label: "Home", href: "/" }]} />
 * ```
 */
export const Sidebar = {
  Root: SidebarRoot,
};
