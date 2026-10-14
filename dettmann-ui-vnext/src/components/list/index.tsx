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
import { rowRecipe } from "../../core/styles/row";
import { VirtualList } from "../../primitives/virtual-list";
import { useControllableState } from "../../hooks/use-controllable-state";
import { getNextRovingIndex, isRovingKey } from "../../hooks/use-roving-tabindex";
import { createStrictContext } from "../../utils/create-strict-context";
import { ChevronDownIcon } from "../../icons/glyphs/chevron-down";

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
  base: "overflow-auto rounded-control border border-border bg-surface",
  variants: {
    /** Selecionável: foco no contêiner (anel interno); estática: sem parada de tabulação. */
    interactive: {
      true: "focus-ring-inset",
      false: "",
    },
  },
  defaultVariants: { interactive: true },
});

interface ListRootProps<T> extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  /** Array of items to render */
  items: T[];
  /** Render function for each item */
  renderItem: (item: T, state: ListItemRenderState) => ReactNode;
  /** Key extractor */
  getItemKey?: (item: T, index: number) => string;
  /**
   * Selection behavior. `none` renders a static list (`list`/`listitem`, no tab stop):
   * use it for feeds and summaries whose rows carry their own actions.
   */
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
 * List.Root is a list: selectable (`listbox`) or static (`selectionMode="none"`).
 * Pass `items` and `renderItem`; set `virtualized` for large collections.
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
  const interactive = selectionMode !== "none";
  const [selectedKeys, setSelectedKeys] = useControllableState<string[]>({
    value: controlledSelected,
    defaultValue: defaultSelectedKeys ?? [],
    onChange: onSelectedChange,
  });
  const [focusedIndex, setFocusedIndex] = useControllableState<number>({
    defaultValue: interactive ? 0 : -1,
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
    if (!interactive) return;

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
      focused: interactive && index === focusedIndex,
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
        role={interactive ? "listbox" : "list"}
        id={listId}
        aria-multiselectable={selectionMode === "multiple" || undefined}
        tabIndex={interactive ? 0 : undefined}
        onKeyDown={handleKeyDown}
        className={cn(rootVariants({ interactive }), virtualized && "overflow-hidden", className)}
        style={!virtualized ? { maxHeight } : undefined}
        {...props}
      >
        {virtualized ? (
          <VirtualList
            items={items}
            itemHeight={itemHeight}
            maxHeight={maxHeight}
            scrollToIndex={interactive ? focusedIndex : undefined}
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

const slotVariants = defineRecipe({
  slots: {
    start: "flex shrink-0 items-center self-center",
    text: "flex min-w-0 flex-1 flex-col gap-0.5",
    title: "truncate text-sm text-fg",
    description: "truncate text-xs text-fg-muted",
    meta: "shrink-0 self-center text-xs text-fg-muted tabular-nums",
    actions: "flex shrink-0 items-center gap-1 self-center",
    unread: "size-2 shrink-0 self-center rounded-pill bg-brand-fill",
  },
  variants: {
    unread: {
      true: { title: "font-semibold" },
      false: { title: "font-medium" },
    },
  },
  defaultVariants: { unread: false },
});

interface ListItemProps extends Omit<ComponentPropsWithoutRef<"div">, "onSelect" | "title"> {
  /** Override selected state from context */
  selected?: boolean;
  /** Disable this item */
  disabled?: boolean;
  /** Antes do texto: ícone em quadro (`FeaturedIcon`), avatar. */
  start?: ReactNode;
  /** Linha principal. Com ela, o item usa o layout de slots; sem ela, `children` como estão. */
  title?: ReactNode;
  /** Linha de apoio abaixo do título. */
  description?: ReactNode;
  /** À direita do texto: hora, contagem, estado. */
  meta?: ReactNode;
  /** Botões da linha. Só em lista estática (`selectionMode="none"`): uma opção não contém controles. */
  actions?: ReactNode;
  /** Não lido: ponto da marca e título em negrito (o nome acessível deve dizer isso). */
  unread?: boolean;
}

/**
 * List.Item is a row. Use inside `renderItem`. With `title` it lays out the slots
 * (start, title, description, meta, actions); otherwise it renders `children`.
 */
function ListItem({
  className,
  selected: selectedProp,
  disabled = false,
  onClick,
  start,
  title,
  description,
  meta,
  actions,
  unread = false,
  children,
  ...props
}: ListItemProps) {
  const { toggle, setFocusedIndex, selectionMode } = useListContext("Item");
  const { itemKey, index, selected: selectedFromScope, focused } = useListItemScope("Item");
  const selected = selectedProp ?? selectedFromScope;
  const interactive = selectionMode !== "none";
  const ref = useRef<HTMLDivElement>(null);
  const s = slotVariants({ unread });

  useEffect(() => {
    if (focused) {
      ref.current?.focus({ preventScroll: true });
    }
  }, [focused]);

  const structured = title !== undefined;
  const body = structured ? (
    <>
      {unread ? <span aria-hidden="true" data-slot="unread" className={s.unread()} /> : null}
      {start ? <span className={s.start()}>{start}</span> : null}
      <span className={s.text()}>
        <span className={s.title()}>{title}</span>
        {description ? <span className={s.description()}>{description}</span> : null}
      </span>
      {meta ? <span className={s.meta()}>{meta}</span> : null}
      {actions && !interactive ? <span className={s.actions()}>{actions}</span> : null}
    </>
  ) : (
    children
  );

  const rowClass = rowRecipe({
    selected: interactive && selected,
    active: focused,
    disabled,
    multiline: structured && Boolean(description),
  });

  if (!interactive) {
    return (
      <div
        ref={ref}
        role="listitem"
        data-list-index={index}
        className={cn(
          "flex w-full items-center gap-3 border-b border-border-subtle px-3 py-2 text-sm text-fg last:border-b-0",
          disabled && "text-fg-subtle",
          className
        )}
        onClick={onClick}
        {...props}
      >
        {body}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      data-list-index={index}
      className={cn(rowClass, "w-full gap-3 text-left", className)}
      onClick={(event) => {
        onClick?.(event);
        if (disabled) return;
        setFocusedIndex(index);
        toggle(itemKey);
      }}
      {...props}
    >
      {body}
    </div>
  );
}

interface ListGroupProps extends Omit<ComponentPropsWithoutRef<"section">, "title"> {
  title: ReactNode;
  /** Contagem ao lado do título. */
  count?: number;
  /** Recolhível pelo cabeçalho. */
  collapsible?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Ícone ou marcador antes do título (por exemplo o glifo da gravidade). */
  icon?: ReactNode;
}

/**
 * List.Group titles a run of rows (a `List.Root` or anything else) and can collapse it.
 *
 * @example
 * ```tsx
 * <List.Group title="Avisos" count={4} icon={<TriangleAlertIcon size="sm" />} collapsible>
 *   <List.Root selectionMode="none" items={warnings} renderItem={…} />
 * </List.Group>
 * ```
 */
function ListGroup({
  title,
  count,
  collapsible = false,
  open: openProp,
  defaultOpen = true,
  onOpenChange,
  icon,
  className,
  children,
  ...props
}: ListGroupProps) {
  const [open, setOpen] = useControllableState({ value: openProp, defaultValue: defaultOpen, onChange: onOpenChange });
  const contentId = useId();
  const heading = (
    <>
      {icon ? <span className="inline-flex shrink-0">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate text-left">{title}</span>
      {count !== undefined ? <span className="tabular-nums text-fg-muted">{count}</span> : null}
    </>
  );
  return (
    <section className={cn("flex flex-col gap-1", className)} {...props}>
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          className="flex h-control-sm items-center gap-2 rounded-control px-2 text-xs font-semibold uppercase tracking-wide text-fg-muted motion-transition hover:bg-state-hover focus-ring-inset"
          onClick={() => setOpen(!open)}
        >
          <ChevronDownIcon size="xs" className={cn("motion-transition", !open && "-rotate-90")} />
          {heading}
        </button>
      ) : (
        <h3 className="m-0 flex h-control-sm items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {heading}
        </h3>
      )}
      <div id={contentId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

/**
 * List is a selectable or static list with optional virtualization, slot rows and groups.
 *
 * @example
 * ```tsx
 * <List.Root
 *   items={members}
 *   selectionMode="single"
 *   renderItem={(member) => <List.Item title={member.name} description={member.email} />}
 * />
 * <List.Root
 *   items={activity}
 *   selectionMode="none"
 *   renderItem={(a) => <List.Item start={<FeaturedIcon … />} title={a.text} meta={a.when} actions={<Button size="sm">Abrir</Button>} />}
 * />
 * ```
 */
export const List = {
  Root: ListRoot,
  Item: ListItem,
  Group: ListGroup,
};
