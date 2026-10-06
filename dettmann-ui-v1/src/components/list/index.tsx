"use client";

import {
  useCallback,
  useId,
  useRef,
  useEffect,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { VirtualList } from "../../primitives/virtual-list";
import { useControllableState } from "../../hooks/use-controllable-state";
import { getNextRovingIndex, isRovingKey } from "../../hooks/use-roving-tabindex";
import { createStrictContext } from "../../utils/create-strict-context";

export type ListSelectionMode = "none" | "single" | "multiple";

export interface ListItemRenderState {
  /** Stable key for this item */
  itemKey: string;
  /** Index in the items array */
  index: number;
  /** Whether the item is selected */
  selected: boolean;
  /** Whether the item is the keyboard-focused option */
  focused: boolean;
}

interface ListContextValue {
  focusedIndex: number;
  selectionMode: ListSelectionMode;
  selectedKeys: string[];
  toggle: (itemKey: string) => void;
  setFocusedIndex: (index: number) => void;
}

const [ListProvider, useListContext] = createStrictContext<ListContextValue>("List");

interface ListItemScopeValue {
  itemKey: string;
  index: number;
  selected: boolean;
  focused: boolean;
}

const [ListItemScopeProvider, useListItemScope] =
  createStrictContext<ListItemScopeValue>("List.Item");

const rootVariants = defineRecipe({
  base: [
    "overflow-auto rounded-md border border-border bg-surface",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  ].join(" "),
});

interface ListRootProps<T> extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  /** Array of items to render */
  items: T[];
  /** Render function for each item */
  renderItem: (item: T, state: ListItemRenderState) => ReactNode;
  /** Key extractor */
  getItemKey?: (item: T, index: number) => string;
  /** Selection behavior */
  selectionMode?: ListSelectionMode;
  /** Controlled selected keys */
  selectedKeys?: string[];
  /** Uncontrolled initial selected keys */
  defaultSelectedKeys?: string[];
  /** Called when selection changes */
  onSelectedChange?: (keys: string[]) => void;
  /** Use VirtualList for large collections */
  virtualized?: boolean;
  /** Item height in pixels (required when virtualized) */
  itemHeight?: number;
  /** Max height of the list viewport */
  maxHeight?: number;
}

function defaultGetItemKey<T>(item: T, index: number): string {
  if (item !== null && typeof item === "object" && "id" in item) {
    const id = (item as { id: unknown }).id;
    if (typeof id === "string" || typeof id === "number") return String(id);
  }
  return String(index);
}

/**
 * List.Root is a selectable list. Pass `items` and `renderItem` to customize each row.
 * Set `virtualized` to render large collections.
 *
 * @example
 * ```tsx
 * <List.Root
 *   items={members}
 *   selectionMode="single"
 *   renderItem={(member, { selected }) => (
 *     <List.Item selected={selected}>
 *       <span>{member.name}</span>
 *       <span>{member.email}</span>
 *     </List.Item>
 *   )}
 * />
 * ```
 */
function ListRoot<T>({
  items,
  renderItem,
  getItemKey = defaultGetItemKey,
  selectionMode = "single",
  selectedKeys: controlledSelected,
  defaultSelectedKeys,
  onSelectedChange,
  virtualized = false,
  itemHeight = 40,
  maxHeight = 320,
  className,
  onKeyDown,
  ...props
}: ListRootProps<T>) {
  const listId = useId();
  const [selectedKeys, setSelectedKeys] = useControllableState<string[]>({
    value: controlledSelected,
    defaultValue: defaultSelectedKeys ?? [],
    onChange: onSelectedChange,
  });
  const [focusedIndex, setFocusedIndex] = useControllableState<number>({
    defaultValue: 0,
  });

  const toggle = useCallback(
    (itemKey: string) => {
      if (selectionMode === "none") return;
      if (selectionMode === "single") {
        setSelectedKeys(selectedKeys.includes(itemKey) ? [] : [itemKey]);
        return;
      }
      setSelectedKeys(
        selectedKeys.includes(itemKey)
          ? selectedKeys.filter((key) => key !== itemKey)
          : [...selectedKeys, itemKey]
      );
    },
    [selectionMode, selectedKeys, setSelectedKeys]
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);

    if (isRovingKey(event.key, "vertical")) {
      const next = getNextRovingIndex(focusedIndex, items.length, event.key, {
        orientation: "vertical",
        loop: true,
      });
      if (next !== null) {
        event.preventDefault();
        setFocusedIndex(next);
      }
      return;
    }

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      const item = items[focusedIndex];
      if (item !== undefined) {
        toggle(getItemKey(item, focusedIndex));
      }
    }
  };

  const renderAt = (item: T, index: number) => {
    const itemKey = getItemKey(item, index);
    const state: ListItemRenderState = {
      itemKey,
      index,
      selected: selectedKeys.includes(itemKey),
      focused: index === focusedIndex,
    };

    return (
      <ListItemScopeProvider key={itemKey} value={state}>
        {renderItem(item, state)}
      </ListItemScopeProvider>
    );
  };

  return (
    <ListProvider
      value={{
        focusedIndex,
        selectionMode,
        selectedKeys,
        toggle,
        setFocusedIndex,
      }}
    >
      <div
        role="listbox"
        id={listId}
        aria-multiselectable={selectionMode === "multiple" || undefined}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className={cn(rootVariants(), virtualized && "overflow-hidden", className)}
        style={!virtualized ? { maxHeight } : undefined}
        {...props}
      >
        {virtualized ? (
          <VirtualList
            items={items}
            itemHeight={itemHeight}
            maxHeight={maxHeight}
            scrollToIndex={focusedIndex}
            getItemKey={(item, index) => getItemKey(item, index)}
            renderItem={(item, index) => renderAt(item, index)}
            className="border-0 rounded-none"
            style={{ height: maxHeight }}
          />
        ) : (
          items.map((item, index) => renderAt(item, index))
        )}
      </div>
    </ListProvider>
  );
}

const itemVariants = defineRecipe({
  base: [
    "flex w-full items-center px-3 py-2 text-sm text-left",
    "cursor-pointer transition-colors duration-fast",
    "focus-visible:outline-none",
  ].join(" "),
  variants: {
    selected: {
      true: "border-l-2 border-primary bg-primary-subtle text-primary-text font-medium",
      false: "text-fg hover:bg-hover",
    },
    focused: {
      true: "ring-2 ring-inset ring-ring",
      false: "",
    },
    disabled: {
      true: "pointer-events-none text-fg-subtle",
      false: "",
    },
  },
  defaultVariants: {
    selected: false,
    focused: false,
    disabled: false,
  },
});

interface ListItemProps extends Omit<ComponentPropsWithoutRef<"div">, "onSelect"> {
  /** Override selected state from context */
  selected?: boolean;
  /** Disable this item */
  disabled?: boolean;
}

/**
 * List.Item is a selectable row. Use inside `renderItem`.
 */
function ListItem({
  className,
  selected: selectedProp,
  disabled = false,
  onClick,
  children,
  ...props
}: ListItemProps) {
  const { toggle, setFocusedIndex } = useListContext("Item");
  const { itemKey, index, selected: selectedFromScope, focused } = useListItemScope("Item");
  const selected = selectedProp ?? selectedFromScope;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focused) {
      ref.current?.focus({ preventScroll: true });
    }
  }, [focused]);

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      data-list-index={index}
      className={cn(itemVariants({ selected, focused, disabled }), className)}
      onClick={(event) => {
        onClick?.(event);
        if (disabled) return;
        setFocusedIndex(index);
        toggle(itemKey);
      }}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * List is a customizable selectable list with optional virtualization.
 * Custom row content goes through `List.Root`'s `renderItem` prop.
 *
 * @example
 * ```tsx
 * <List.Root
 *   items={members}
 *   selectionMode="single"
 *   renderItem={(member, { selected }) => (
 *     <List.Item selected={selected}>
 *       <strong>{member.name}</strong>
 *       <span>{member.email}</span>
 *     </List.Item>
 *   )}
 * />
 * ```
 */
export const List = {
  Root: ListRoot,
  Item: ListItem,
};
