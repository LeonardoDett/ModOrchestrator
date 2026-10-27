"use client";

import {
  useCallback,
  useState,
  useId,
  useRef,
  useLayoutEffect,
  createContext,
  useContext,
  type ReactNode,
  type ComponentPropsWithoutRef,
  type MutableRefObject,
  type MouseEvent,
  cloneElement,
  isValidElement,
  type ReactElement,
} from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useRole,
  useListNavigation,
  useTypeahead,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
  FloatingNode,
  FloatingTree,
  useFloatingNodeId,
  useFloatingParentNodeId,
  type Placement,
} from "@floating-ui/react";
import { Icon, type IconComponent } from "../../primitives/icon";
import { CheckIcon } from "../../icons/glyphs/check";
import { ChevronRightIcon } from "../../icons/glyphs/chevron-right";
import { OverlayScope } from "../../primitives/portal";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Presence } from "../../motion/presence";
import { overlayEnter } from "../../motion/overlay-keyframes";
import { rowRecipe } from "../../core/styles/row";
import { useControllableState } from "../../hooks/use-controllable-state";

interface MenuContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  refs: ReturnType<typeof useFloating>["refs"];
  floatingStyles: ReturnType<typeof useFloating>["floatingStyles"];
  context: ReturnType<typeof useFloating>["context"];
  getReferenceProps: ReturnType<typeof useInteractions>["getReferenceProps"];
  getFloatingProps: ReturnType<typeof useInteractions>["getFloatingProps"];
  getItemProps: ReturnType<typeof useInteractions>["getItemProps"];
  activeIndex: number | null;
  listRef: MutableRefObject<(HTMLElement | null)[]>;
  labelsRef: MutableRefObject<(string | null)[]>;
  registerItem: (
    id: string,
    element: HTMLElement | null,
    label: string,
  ) => number;
  menuId: string;
  /** Closes this menu and every menu it opened from (an item was chosen). */
  closeAll: () => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

function useMenuContext(component: string) {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error(`<Menu.${component}> must be used within <Menu.Root>`);
  }
  return context;
}

interface MenuRootProps {
  children: ReactNode;
  /** Controlled open state */
  open?: boolean;
  /** Uncontrolled initial open state */
  defaultOpen?: boolean;
  /** Called when open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Placement relative to the trigger */
  placement?: Placement;
}

function MenuRoot(props: MenuRootProps) {
  // Submenus share one floating tree, so a click inside a submenu is not a
  // click outside its parent.
  const parentId = useFloatingParentNodeId();
  if (parentId === null) {
    return (
      <FloatingTree>
        <MenuTreeNode {...props} />
      </FloatingTree>
    );
  }
  return <MenuTreeNode {...props} />;
}

function MenuTreeNode({
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  placement = "bottom-start",
}: MenuRootProps) {
  const parent = useContext(MenuContext);
  const nodeId = useFloatingNodeId();
  const [isOpen, setIsOpen] = useControllableState({
    value: controlledOpen,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listRef = useRef<(HTMLElement | null)[]>([]);
  const labelsRef = useRef<(string | null)[]>([]);
  const itemsMap = useRef(
    new Map<string, { element: HTMLElement; label: string }>(),
  );
  const menuId = useId();

  const { refs, floatingStyles, context } = useFloating({
    nodeId,
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    // Posiciona por left/top: o `transform` fica livre para a animação de entrada (escala).
    transform: false,
    middleware: [
      offset(parent ? { mainAxis: 2, crossAxis: -5 } : 4),
      flip(),
      shift({ padding: 8 }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "menu" });
  const listNavigation = useListNavigation(context, {
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
    loop: true,
    nested: Boolean(parent),
  });
  const typeahead = useTypeahead(context, {
    listRef: labelsRef,
    activeIndex,
    onMatch: (index) => {
      setActiveIndex(index);
      listRef.current[index]?.focus();
    },
    enabled: isOpen,
  });

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions(
    [click, dismiss, role, listNavigation, typeahead],
  );

  const registerItem = useCallback(
    (id: string, element: HTMLElement | null, label: string) => {
      if (element) {
        itemsMap.current.set(id, { element, label });
      } else {
        itemsMap.current.delete(id);
      }
      const entries = Array.from(itemsMap.current.values());
      listRef.current = entries.map((item) => item.element);
      labelsRef.current = entries.map((item) => item.label);
      return Array.from(itemsMap.current.keys()).indexOf(id);
    },
    [],
  );

  const closeAll = useCallback(() => {
    setIsOpen(false);
    parent?.closeAll();
  }, [setIsOpen, parent]);

  return (
    <FloatingNode id={nodeId}>
      <MenuContext.Provider
        value={{
          isOpen,
          setIsOpen,
          refs,
          floatingStyles,
          context,
          getReferenceProps,
          getFloatingProps,
          getItemProps,
          activeIndex,
          listRef,
          labelsRef,
          registerItem,
          menuId,
          closeAll,
        }}
      >
        {children}
      </MenuContext.Provider>
    </FloatingNode>
  );
}

interface MenuTriggerProps {
  children: ReactElement<{ className?: string }>;
  /** Additional class name */
  className?: string;
}

function MenuTrigger({ children, className }: MenuTriggerProps) {
  const { refs, getReferenceProps, isOpen } = useMenuContext("Trigger");

  if (!isValidElement(children)) {
    throw new Error("<Menu.Trigger> must have a single React element child");
  }

  const childProps = children.props as { className?: string };

  return cloneElement(children, {
    ref: refs.setReference,
    "aria-haspopup": "menu",
    "aria-expanded": isOpen,
    ...getReferenceProps(),
    className: cn(childProps.className, className),
  } as Record<string, unknown>);
}

const menuContentVariants = defineRecipe({
  base: [
    "z-popover flex min-w-40 flex-col gap-0.5 rounded-card p-1",
    "bg-raised border border-border shadow-overlay",
    "focus-bare",
  ].join(" "),
});

type MenuContentVariants = VariantProps<typeof menuContentVariants>;

interface MenuContentProps
  extends ComponentPropsWithoutRef<"div">, MenuContentVariants {}

function MenuContent({
  children,
  className,
  style,
  ...props
}: MenuContentProps) {
  const { isOpen, refs, floatingStyles, context, getFloatingProps, menuId } =
    useMenuContext("Content");

  if (!isOpen) return null;

  return (
    <FloatingPortal>
      <OverlayScope>
        <FloatingFocusManager context={context} modal={false}>
          <Presence show enter={overlayEnter}>
            <div
              ref={refs.setFloating}
              id={menuId}
              role="menu"
              data-motion="responsive"
              style={{ ...floatingStyles, ...style }}
              className={cn(menuContentVariants(), className)}
              {...getFloatingProps()}
              {...props}
            >
              {children}
            </div>
          </Presence>
        </FloatingFocusManager>
      </OverlayScope>
    </FloatingPortal>
  );
}

interface MenuItemProps extends Omit<
  ComponentPropsWithoutRef<"button">,
  "onSelect"
> {
  /** Called when the item is chosen; the menu then closes */
  onSelect?: () => void;
  /** Typeahead label (defaults to string children) */
  label?: string;
  /** Disable the item */
  disabled?: boolean;
  /** D-040: icon before the label (board "Mais ações"). */
  icon?: IconComponent;
  /**
   * D-040: a toggle (`menuitemcheckbox`) with a check at the end when on; choosing it
   * keeps the menu open ("Colunas da lista").
   */
  checked?: boolean;
  /**
   * D-044: a second line under the label ("Em execução", the value of a variable);
   * the item grows to two lines.
   */
  description?: ReactNode;
  /** D-044: a visual before the label in place of `icon` (an app's icon, an avatar). */
  media?: ReactNode;
  /** D-044: a mark after the label (a status dot); decorative unless it has its own name. */
  end?: ReactNode;
}

function MenuItem({
  children,
  className,
  onSelect,
  label,
  disabled = false,
  icon,
  checked,
  description,
  media,
  end,
  onClick,
  ...props
}: MenuItemProps) {
  const { getItemProps, activeIndex, registerItem, closeAll, listRef } =
    useMenuContext("Item");
  const checkable = checked !== undefined;
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(-1);

  const resolvedLabel = label ?? (typeof children === "string" ? children : "");

  useLayoutEffect(() => {
    const nextIndex = registerItem(id, ref.current, resolvedLabel);
    setIndex(nextIndex);
    return () => {
      registerItem(id, null, resolvedLabel);
    };
  }, [id, resolvedLabel, registerItem]);

  const isActive = index >= 0 && activeIndex === index;

  return (
    <button
      ref={(node) => {
        ref.current = node;
        if (index >= 0) {
          listRef.current[index] = node;
        }
      }}
      type="button"
      role={checkable ? "menuitemcheckbox" : "menuitem"}
      aria-checked={checkable ? checked : undefined}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      className={cn(
        rowRecipe({ active: isActive, disabled, multiline: description !== undefined && description !== null }),
        "w-full gap-2.5 rounded-chip text-left",
        className,
      )}
      {...getItemProps({
        onClick(event) {
          onClick?.(event as MouseEvent<HTMLButtonElement>);
          if (disabled) return;
          onSelect?.();
          if (!checkable) closeAll();
        },
      })}
      {...props}
    >
      {media ? (
        <span className="flex shrink-0 self-center">{media}</span>
      ) : icon ? (
        <Icon icon={icon} size="sm" className="shrink-0 text-fg-muted" />
      ) : null}
      {description !== undefined && description !== null ? (
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate">{children}</span>
          <span data-slot="description" className="truncate text-caption text-fg-muted">
            {description}
          </span>
        </span>
      ) : icon || media || checkable || end ? (
        <span className="min-w-0 flex-1 truncate">{children}</span>
      ) : (
        children
      )}
      {end ? <span className="flex shrink-0 self-center">{end}</span> : null}
      {checkable ? (
        <CheckIcon
          size="sm"
          className={cn("shrink-0 text-intent-text", !checked && "invisible")}
        />
      ) : null}
    </button>
  );
}

/**
 * Menu is a floating action menu with keyboard navigation and typeahead.
 *
 * @example
 * ```tsx
 * <Menu.Root open={open} onOpenChange={setOpen}>
 *   <Menu.Trigger>
 *     <Button>Actions</Button>
 *   </Menu.Trigger>
 *   <Menu.Content>
 *     <Menu.Item onSelect={() => {}}>Edit</Menu.Item>
 *     <Menu.Item onSelect={() => {}}>Delete</Menu.Item>
 *   </Menu.Content>
 * </Menu.Root>
 * ```
 */
/** D-040: a line between groups of items. */
function MenuSeparator({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      role="separator"
      className={cn("mx-0 my-1 h-px shrink-0 bg-border-subtle", className)}
      {...props}
    />
  );
}

interface MenuSubProps {
  /** Label of the item that opens the submenu. */
  label: string;
  icon?: IconComponent;
  disabled?: boolean;
  children: ReactNode;
}

/**
 * D-040: an item that opens a submenu at its side (chevron at the end):
 * click, Enter or ArrowRight open it; Escape or ArrowLeft close it.
 */
function MenuSub({ label, icon, disabled, children }: MenuSubProps) {
  const parent = useMenuContext("Sub");
  return (
    <MenuTreeNode placement="right-start">
      <SubTrigger
        parent={parent}
        label={label}
        icon={icon}
        disabled={disabled}
      />
      <MenuContent>{children}</MenuContent>
    </MenuTreeNode>
  );
}

function SubTrigger({
  parent,
  label,
  icon,
  disabled = false,
}: {
  parent: MenuContextValue;
  label: string;
  icon?: IconComponent;
  disabled?: boolean;
}) {
  const own = useMenuContext("Sub");
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(-1);
  const { registerItem, listRef, getItemProps, activeIndex } = parent;
  useLayoutEffect(() => {
    const nextIndex = registerItem(id, ref.current, label);
    setIndex(nextIndex);
    return () => {
      registerItem(id, null, label);
    };
  }, [id, label, registerItem]);
  const isActive = index >= 0 && activeIndex === index;
  return (
    <button
      ref={(node) => {
        ref.current = node;
        own.refs.setReference(node);
        if (index >= 0) listRef.current[index] = node;
      }}
      type="button"
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={own.isOpen}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      className={cn(
        rowRecipe({ active: isActive || own.isOpen, disabled }),
        "w-full gap-2.5 rounded-chip text-left",
      )}
      {...getItemProps(
        own.getReferenceProps({
          onKeyDown(event) {
            if (event.key === "ArrowRight" && !disabled) {
              event.preventDefault();
              own.setIsOpen(true);
            }
          },
        }),
      )}
    >
      {icon ? (
        <Icon icon={icon} size="sm" className="shrink-0 text-fg-muted" />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ChevronRightIcon size="sm" className="shrink-0 text-fg-muted" />
    </button>
  );
}

export const Menu = {
  Root: MenuRoot,
  Trigger: MenuTrigger,
  Content: MenuContent,
  Item: MenuItem,
  Separator: MenuSeparator,
  Sub: MenuSub,
};
