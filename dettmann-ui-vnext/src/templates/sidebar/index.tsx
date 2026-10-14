"use client";

import {
  useCallback,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { MenuIcon } from "../../icons/glyphs/menu";
import { PanelLeftCloseIcon } from "../../icons/glyphs/panel-left-close";
import { PanelLeftOpenIcon } from "../../icons/glyphs/panel-left-open";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Icon, type IconComponent } from "../../primitives/icon";
import { Button } from "../../components/button";
import { Accordion } from "../../components/accordion";
import { Drawer } from "../../components/drawer";
import { Tooltip } from "../../components/tooltip";
import { getNextRovingIndex, isRovingKey } from "../../hooks/use-roving-tabindex";
import { useControllableState } from "../../hooks/use-controllable-state";

export interface SidebarItem {
  id: string;
  label: string;
  icon?: IconComponent;
  href?: string;
  onClick?: () => void;
  children?: SidebarItem[];
  /** Reserved nav entries stay visible but do not navigate. */
  disabled?: boolean;
  /** Trailing slot, typically a Badge. Hidden while the column is collapsed. */
  badge?: ReactNode;
  /**
   * Contagem do item: pílula no fim da linha e selo sobre o ícone com a coluna recolhida.
   * Use `countLabel` para o texto lido junto do nome ("12 a decidir").
   */
  count?: number;
  /** Texto da contagem para leitores de tela e para a dica da coluna recolhida. */
  countLabel?: string;
  /** Pede atenção (âmbar, selo preenchido). Quem usa decide quando; o item só desenha. */
  attention?: boolean;
}

/** A titled group of items. `end` sections are pinned to the bottom of the column. */
export interface SidebarSection {
  id: string;
  /** Section heading; hidden (replaced by a divider) while collapsed. */
  label?: string;
  icon?: IconComponent;
  items: SidebarItem[];
  placement?: "start" | "end";
}

/** Built-in texts, overridable for localization. */
export interface SidebarLabels {
  navigation?: string;
  openSidebar?: string;
  collapseSidebar?: string;
  expandSidebar?: string;
}

/**
 * Solid (`strong`) or soft (`subtle`) fill of the 30% role. Named `variant` so it does not
 * collide with the shared `Emphasis` (`low|medium|high`) axis.
 */
export type SidebarVariant = "strong" | "subtle";

const asideVariants = defineRecipe({
  base: ["hidden h-full flex-col border-r", "md:flex"].join(" "),
  variants: {
    collapsed: {
      true: "w-16",
      false: "w-64",
    },
    variant: {
      strong: "border-border bg-structure text-fg",
      subtle: "border-border bg-surface text-fg",
    },
  },
  defaultVariants: {
    variant: "strong",
  },
});

/**
 * Larguras pela variável do consumidor, com o padrão do design (14,5rem e 3,75rem):
 * `style={{ "--sidebar-width": "13.75rem" }}`.
 */
const WIDTH = {
  open: "w-[var(--sidebar-width,14.5rem)]",
  collapsed: "w-[var(--sidebar-width-collapsed,3.75rem)]",
} as const;

const countVariants = defineRecipe({
  base: "inline-flex h-4 min-w-4 items-center justify-center rounded-pill text-caption font-semibold leading-none tabular-nums",
  variants: {
    attention: {
      true: "bg-intent-fill text-on-intent",
      false: "bg-fill-neutral text-fg-muted",
    },
    overlay: {
      true: "pointer-events-none absolute -right-0.5 top-0 px-1",
      false: "shrink-0 px-1.5",
    },
  },
  defaultVariants: { attention: false, overlay: false },
});

const itemVariants = defineRecipe({
  base: [
    "relative flex w-full items-center gap-2 rounded-chip px-2 text-left text-sm min-h-control-sm",
    "motion-transition focus-ring-inset",
  ].join(" "),
  variants: {
    collapsed: {
      true: "justify-center px-2",
      false: "",
    },
    /** Current page: tinted row plus the brand bar (D-033), never a filled block. */
    current: {
      true: "bg-selected font-medium text-fg hover:state-layer-hover before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-pill before:bg-brand-fill",
      false: "",
    },
    variant: {
      strong: "",
      subtle: "",
    },
    disabled: {
      true: "",
      false: "",
    },
    /** Pede atenção: linha tingida pelo intent `warning` (o nó declara `data-intent`). */
    attention: {
      true: "",
      false: "",
    },
  },
  compoundVariants: [
    {
      attention: true,
      current: false,
      disabled: false,
      class: "bg-intent-subtle text-intent-text hover:state-layer-hover active:state-layer-pressed",
    },
    {
      variant: "strong",
      current: false,
      disabled: false,
      attention: false,
      class: "text-fg hover:bg-state-hover active:bg-state-pressed",
    },
    {
      variant: "subtle",
      current: false,
      disabled: false,
      attention: false,
      class: "text-fg hover:bg-state-hover active:bg-state-pressed",
    },
    {
      disabled: true,
      class: "pointer-events-none text-fg-subtle",
    },
  ],
  defaultVariants: {
    current: false,
    variant: "strong",
    disabled: false,
    attention: false,
  },
});

/** Beats classes baked into Button, Accordion and Drawer, which assume a neutral surface. */
const strongChromeClass =
  "!text-fg hover:!bg-state-hover hover:!text-fg active:!bg-state-pressed";

const drawerSurfaceClass: Record<SidebarVariant, string> = {
  strong: "!border-border !bg-structure !text-fg",
  subtle: "!border-border !bg-surface !text-fg",
};

interface SidebarRootProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  /** Flat navigation. Use `sections` instead for titled groups. */
  items?: SidebarItem[];
  /** Titled groups; takes precedence over `items`. */
  sections?: SidebarSection[];
  labels?: SidebarLabels;
  /** Marks the matching item with aria-current="page" */
  currentId?: string;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /**
   * Fill of the 30% role (`secondary`).
   * `strong` is the solid color; `subtle` is the soft color.
   */
  variant?: SidebarVariant;
  header?: ReactNode;
  /** Replaces `header` on the collapsed desktop column (for example a mark instead of a wordmark). */
  collapsedHeader?: ReactNode;
  /**
   * Preso no fim da coluna (cartão de progresso, ação principal). Uma função recebe o
   * estado da coluna, para trocar o conteúdo quando ela está recolhida.
   */
  footer?: ReactNode | ((state: { collapsed: boolean }) => ReactNode);
  /** Rótulo visível ao lado do botão de recolher, com a coluna aberta ("Menu"). */
  heading?: ReactNode;
}

function SidebarLeaf({
  item,
  collapsed,
  current,
  variant,
}: {
  item: SidebarItem;
  collapsed: boolean;
  current: boolean;
  variant: SidebarVariant;
}) {
  const hasCount = item.count !== undefined;
  const attention = Boolean(item.attention) && !item.disabled;
  const countText = item.countLabel ?? (hasCount ? String(item.count) : undefined);
  const content = (
    <>
      {item.icon ? <Icon icon={item.icon} size="sm" color="current" /> : null}
      {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
      {countText !== undefined && !collapsed ? <span className="sr-only">{`, ${countText}`}</span> : null}
      {!collapsed && item.badge ? <span className="shrink-0">{item.badge}</span> : null}
      {hasCount ? (
        <span aria-hidden="true" className={countVariants({ attention, overlay: collapsed })}>
          {item.count}
        </span>
      ) : null}
    </>
  );

  const className = itemVariants({
    collapsed,
    current: item.disabled ? false : current,
    variant,
    disabled: Boolean(item.disabled),
    attention,
  });
  const intentAttrs = attention ? { "data-intent": "warning" as const } : {};
  // Recolhida: o nome (com a contagem) vai no aria-label e numa dica à direita.
  const collapsedName = countText !== undefined ? `${item.label}, ${countText}` : item.label;
  const withTip = (node: ReactElement<{ className?: string }>) =>
    collapsed ? (
      <Tooltip.Root placement="right">
        <Tooltip.Trigger>{node}</Tooltip.Trigger>
        <Tooltip.Content>{collapsedName}</Tooltip.Content>
      </Tooltip.Root>
    ) : (
      node
    );

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
    return withTip(
      <a
        href={item.href}
        className={className}
        title={collapsed ? undefined : item.label}
        aria-label={collapsed ? collapsedName : undefined}
        aria-current={current ? "page" : undefined}
        onClick={item.onClick}
        {...intentAttrs}
      >
        {content}
      </a>
    );
  }

  return withTip(
    <button
      type="button"
      className={className}
      title={collapsed ? undefined : item.label}
      aria-label={collapsed ? collapsedName : undefined}
      aria-current={current ? "page" : undefined}
      onClick={item.onClick}
      {...intentAttrs}
    >
      {content}
    </button>
  );
}

function SidebarSections({
  sections,
  collapsed,
  currentId,
  variant,
  label,
}: {
  sections: SidebarSection[];
  collapsed: boolean;
  currentId?: string;
  variant: SidebarVariant;
  label: string;
}) {
  const start = sections.filter((section) => section.placement !== "end");
  const end = sections.filter((section) => section.placement === "end");
  const renderSection = (section: SidebarSection, index: number) => (
    <div key={section.id} role="group" aria-label={section.label} className="flex flex-col gap-1">
      {section.label && !collapsed ? (
        <div
          className={cn(
            "flex items-center gap-2 px-2 pb-1 text-xs font-semibold uppercase tracking-wide",
            index > 0 && "pt-3",
            variant === "strong" ? "text-fg opacity-70" : "text-fg-subtle"
          )}
        >
          {section.icon ? <Icon icon={section.icon} size="xs" color="current" /> : null}
          <span className="min-w-0 truncate">{section.label}</span>
        </div>
      ) : index > 0 ? (
        <div role="none" className="mx-2 my-1 h-px bg-border" />
      ) : null}
      <SidebarItems items={section.items} collapsed={collapsed} currentId={currentId} variant={variant} />
    </div>
  );
  return (
    <nav aria-label={label} className="flex min-h-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto p-2">
      {start.map(renderSection)}
      {end.length > 0 ? (
        <div className="mt-auto flex flex-col gap-1 pt-2">{end.map((section, i) => renderSection(section, i + 1))}</div>
      ) : null}
    </nav>
  );
}

function SidebarItems({
  items,
  collapsed,
  currentId,
  variant,
}: {
  items: SidebarItem[];
  collapsed: boolean;
  currentId?: string;
  variant: SidebarVariant;
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
          variant={variant}
        />
      ));

  const groupNodes = items.filter((item) => item.children?.length);

  return (
    <>
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
                  "rounded-control px-2 py-2",
                  variant === "strong" && strongChromeClass
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
                      variant={variant}
                    />
                  ))}
                </div>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      ) : null}
    </>
  );
}

function SidebarNavList({
  sections,
  collapsed,
  currentId,
  variant,
  label,
}: {
  sections: SidebarSection[];
  collapsed: boolean;
  currentId?: string;
  variant: SidebarVariant;
  label: string;
}) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const flat = flattenItems(sections.flatMap((section) => section.items));

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
      <SidebarSections
        sections={sections}
        collapsed={collapsed}
        currentId={currentId}
        variant={variant}
        label={label}
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
  sections: sectionsProp,
  labels,
  currentId,
  collapsed: collapsedProp,
  defaultCollapsed = false,
  onCollapsedChange,
  header,
  collapsedHeader,
  footer,
  heading,
  variant = "strong",
  className,
  ...props
}: SidebarRootProps) {
  const [collapsed, setCollapsed] = useControllableState({
    value: collapsedProp,
    defaultValue: defaultCollapsed,
    onChange: onCollapsedChange,
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const sections: SidebarSection[] = sectionsProp ?? [{ id: "main", items: items ?? [] }];
  const navigationLabel = labels?.navigation ?? "Sidebar";

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!collapsed);
  }, [collapsed, setCollapsed]);

  return (
    <div className={cn("flex h-full", className)} {...props}>
      <Button
        type="button"
        emphasis="low"
        size="icon"
        className="md:hidden"
        aria-label={labels?.openSidebar ?? "Open sidebar"}
        onClick={() => setMobileOpen(true)}
      >
        <Icon icon={MenuIcon} size="sm" />
      </Button>

      <aside
        data-layer="medium"
        data-collapsed={collapsed || undefined}
        className={cn(asideVariants({ collapsed, variant }), collapsed ? WIDTH.collapsed : WIDTH.open, "overflow-hidden")}
      >
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
        <div
          className={cn(
            "flex shrink-0 items-center p-2",
            collapsed ? "justify-center" : heading ? "justify-between" : "justify-end"
          )}
        >
          {heading && !collapsed ? (
            <span className="min-w-0 truncate pl-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              {heading}
            </span>
          ) : null}
          <Button
            type="button"
            emphasis="low"
            size="icon-sm"
            aria-label={
              collapsed
                ? (labels?.expandSidebar ?? "Expand sidebar")
                : (labels?.collapseSidebar ?? "Collapse sidebar")
            }
            className={variant === "strong" ? strongChromeClass : undefined}
            onClick={toggleCollapsed}
          >
            <Icon icon={collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon} size="sm" />
          </Button>
        </div>
        <SidebarNavList
          sections={sections}
          collapsed={collapsed}
          currentId={currentId}
          variant={variant}
          label={navigationLabel}
        />
        {footer ? (
          <div
            data-slot="sidebar-footer"
            className={cn("flex shrink-0 flex-col gap-2 p-2", collapsed && "items-center")}
          >
            {typeof footer === "function" ? footer({ collapsed }) : footer}
          </div>
        ) : null}
      </aside>

      <Drawer.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Drawer.Content
          side="left"
          className={cn("max-w-xs", drawerSurfaceClass[variant])}
        >
          <Drawer.Header className="!border-border-strong">
            {header ? <div className="min-w-0 flex-1">{header}</div> : null}
            <Drawer.Title className={header ? "sr-only" : variant === "strong" ? "!text-fg" : undefined}>
              {navigationLabel}
            </Drawer.Title>
            <Drawer.CloseButton className={variant === "strong" ? strongChromeClass : undefined} />
          </Drawer.Header>
          <Drawer.Body className={cn("p-0", variant === "strong" && "!text-fg")}>
            <SidebarSections
              sections={sections}
              collapsed={false}
              currentId={currentId}
              variant={variant}
              label={navigationLabel}
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
 * <Sidebar.Root
 *   heading="Menu"
 *   sections={[{ id: "content", label: "Conteúdo", items: [
 *     { id: "conflicts", label: "Conflitos", icon: GitMergeIcon, count: 12, countLabel: "12 a decidir", attention: true },
 *   ] }]}
 *   footer={({ collapsed }) => (collapsed ? <DeployRing /> : <DeployCard />)}
 * />
 * ```
 */
export const Sidebar = {
  Root: SidebarRoot,
};
