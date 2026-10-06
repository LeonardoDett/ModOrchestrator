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
  type Placement,
} from "@floating-ui/react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
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
  registerItem: (id: string, element: HTMLElement | null, label: string) => number;
  menuId: string;
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

function MenuRoot({
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  placement = "bottom-start",
}: MenuRootProps) {
  const [isOpen, setIsOpen] = useControllableState({
    value: controlledOpen,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listRef = useRef<(HTMLElement | null)[]>([]);
  const labelsRef = useRef<(string | null)[]>([]);
  const itemsMap = useRef(new Map<string, { element: HTMLElement; label: string }>());
  const menuId = useId();

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
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

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    click,
    dismiss,
    role,
    listNavigation,
    typeahead,
  ]);

  const registerItem = useCallback((id: string, element: HTMLElement | null, label: string) => {
    if (element) {
      itemsMap.current.set(id, { element, label });
    } else {
      itemsMap.current.delete(id);
    }
    const entries = Array.from(itemsMap.current.values());
    listRef.current = entries.map((item) => item.element);
    labelsRef.current = entries.map((item) => item.label);
    return Array.from(itemsMap.current.keys()).indexOf(id);
  }, []);

  return (
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
      }}
    >
      {children}
    </MenuContext.Provider>
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
    "z-popover min-w-40 rounded-xl p-1",
    "bg-raised border border-border shadow-xl",
    "outline-none",
  ].join(" "),
});

type MenuContentVariants = VariantProps<typeof menuContentVariants>;

interface MenuContentProps
  extends ComponentPropsWithoutRef<"div">,
    MenuContentVariants {}

function MenuContent({ children, className, style, ...props }: MenuContentProps) {
  const { isOpen, refs, floatingStyles, context, getFloatingProps, menuId } =
    useMenuContext("Content");

  if (!isOpen) return null;

  return (
    <FloatingPortal>
      <FloatingFocusManager context={context} modal={false}>
        <div
          ref={refs.setFloating}
          id={menuId}
          role="menu"
          style={{ ...floatingStyles, ...style }}
          className={cn(menuContentVariants(), className)}
          {...getFloatingProps()}
          {...props}
        >
          {children}
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  );
}

const menuItemVariants = defineRecipe({
  base: [
    "flex w-full items-center rounded-md px-3 py-2 text-sm text-left",
    "text-fg cursor-pointer",
    "outline-none transition-colors duration-fast",
  ].join(" "),
  variants: {
    active: {
      true: "bg-secondary-subtle",
      false: "",
    },
    disabled: {
      true: "pointer-events-none text-fg-subtle text-fg-muted",
      false: "hover:bg-hover",
    },
  },
  defaultVariants: {
    active: false,
    disabled: false,
  },
});

interface MenuItemProps extends Omit<ComponentPropsWithoutRef<"button">, "onSelect"> {
  /** Called when the item is chosen; the menu then closes */
  onSelect?: () => void;
  /** Typeahead label (defaults to string children) */
  label?: string;
  /** Disable the item */
  disabled?: boolean;
}

function MenuItem({
  children,
  className,
  onSelect,
  label,
  disabled = false,
  onClick,
  ...props
}: MenuItemProps) {
  const { getItemProps, activeIndex, registerItem, setIsOpen, listRef } =
    useMenuContext("Item");
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(-1);

  const resolvedLabel =
    label ?? (typeof children === "string" ? children : "");

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
      role="menuitem"
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      className={cn(menuItemVariants({ active: isActive, disabled }), className)}
      {...getItemProps({
        onClick(event) {
          onClick?.(event as MouseEvent<HTMLButtonElement>);
          if (disabled) return;
          onSelect?.();
          setIsOpen(false);
        },
      })}
      {...props}
    >
      {children}
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
export const Menu = {
  Root: MenuRoot,
  Trigger: MenuTrigger,
  Content: MenuContent,
  Item: MenuItem,
};
