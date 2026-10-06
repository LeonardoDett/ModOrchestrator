"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useControllableState } from "../../hooks/use-controllable-state";
import { Skeleton } from "../../primitives/skeleton";
import {
  applySelection,
  buildDisplayItems,
  clampWidth,
  nextSort,
  selectAll,
  selectionIntent,
  isDropTarget,
  keyboardMove,
  movingRows,
  type DataTableRowMove,
  type DataTableDisplayItem,
  type DataTableSelectionMode,
  type DataTableSort,
  type SelectionState,
} from "./data-table.model";

export interface DataTableColumn<T> {
  id: string;
  /** Plain-text name: accessible name, column picker and resize handle label. */
  label: string;
  /** Visual header content; defaults to `label`. */
  header?: ReactNode;
  cell: (row: T, rowIndex: number) => ReactNode;
  /** Initial width in px (default 160). */
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  /** Takes the remaining horizontal space (at least `width`). */
  grow?: boolean;
  align?: "start" | "center" | "end";
  /** Tabular numerals, end-aligned by default. */
  numeric?: boolean;
  sortable?: boolean;
  /** Defaults to true. */
  resizable?: boolean;
  /** Whether the column picker may hide it. Defaults to true. */
  hideable?: boolean;
  /** Filter control rendered in the filter row under the header. */
  filter?: ReactNode;
}

export interface DataTableGroupHeaderProps {
  group: string;
  count: number;
  collapsed: boolean;
}

export interface DataTableLabels {
  /** Prefix of the resize handle name: "<resizeColumn> <column label>". */
  resizeColumn?: string;
  /** Accessible name of the drag handle of a row. */
  dragHandle?: string;
  /** Accessible name of the busy state while a move is being applied. */
  moving?: string;
  /** Accessible name of the loading state. */
  loading?: string;
}

export interface DataTableProps<T>
  extends Omit<ComponentPropsWithoutRef<"div">, "children" | "onChange" | "role" | "aria-label"> {
  /** Accessible name of the grid (required: tables are landmarks of dense screens). */
  "aria-label": string;
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;

  /** Sorting is reported, not applied: the consumer orders `rows`. */
  sort?: DataTableSort | null;
  defaultSort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort | null) => void;

  columnWidths?: Readonly<Record<string, number>>;
  defaultColumnWidths?: Readonly<Record<string, number>>;
  onColumnWidthsChange?: (widths: Record<string, number>) => void;
  /** Ids of hidden columns (see `DataTableColumnPicker`). */
  hiddenColumns?: readonly string[];
  /** Renders the filter row when at least one column has a `filter`. */
  showFilters?: boolean;

  selectionMode?: DataTableSelectionMode;
  selectedIds?: ReadonlySet<string>;
  defaultSelectedIds?: ReadonlySet<string>;
  onSelectedIdsChange?: (ids: ReadonlySet<string>) => void;
  /** Called when the focused (keyboard cursor) row changes. */
  onFocusedIdChange?: (id: string | null) => void;
  /** Enter or double click. */
  onRowActivate?: (row: T) => void;
  /** Keys the grid does not handle (for example Space to toggle a row state). */
  onRowKeyDown?: (event: KeyboardEvent<HTMLDivElement>, row: T) => void;
  onRowContextMenu?: (event: MouseEvent<HTMLDivElement>, row: T) => void;
  /** Extra classes for a row (for example a muted look for disabled items). */
  rowClassName?: (row: T) => string | undefined;

  getGroup?: (row: T) => string;
  renderGroupHeader?: (group: DataTableGroupHeaderProps) => ReactNode;
  collapsedGroups?: readonly string[];
  defaultCollapsedGroups?: readonly string[];
  onCollapsedGroupsChange?: (groups: string[]) => void;

  density?: "comfortable" | "compact";
  /** Overrides the density row height (px). */
  rowHeight?: number;
  /** Virtualize above this many display items (default 100). */
  virtualizeThreshold?: number;
  loading?: boolean;
  /** Shown when there are no rows and the table is not loading. */
  empty?: ReactNode;
  labels?: DataTableLabels;

  /**
   * Rows can be reordered: a drag handle column appears, rows are dragged by
   * it (the whole selection when the dragged row is selected) and Alt+Up /
   * Alt+Down move the selection by one row. A function decides per row
   * (false hides that row's handle). Nothing is reordered by the table:
   * `onRowsMove` receives the request.
   */
  reorderable?: boolean | ((row: T) => boolean);
  /**
   * Called on drop or keyboard move. While the returned promise is pending
   * the table is busy and accepts no other move, so the consumer can
   * validate the request (asynchronously) and refuse it with its own UI.
   */
  onRowsMove?: (move: DataTableRowMove) => void | Promise<unknown>;
}

const ROW_HEIGHT = { comfortable: 40, compact: 30 } as const;
const DEFAULT_WIDTH = 160;
const RESIZE_STEP = 16;
const HANDLE_WIDTH = 28;
/** Distance from the viewport edge (px) where a drag scrolls the grid. */
const AUTOSCROLL_EDGE = 32;
const AUTOSCROLL_STEP = 12;
const EMPTY_SET: ReadonlySet<string> = new Set();

const rootVariants = defineRecipe({
  base: "relative flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface text-sm",
});

const rowVariants = defineRecipe({
  base: "relative grid items-center border-b border-border-subtle text-fg",
  variants: {
    selected: {
      true: "bg-brand-subtle before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-brand",
      false: "hover:bg-hover",
    },
    focused: {
      true: "outline-2 -outline-offset-2 outline-ring",
      false: "",
    },
  },
  defaultVariants: { selected: false, focused: false },
});

const alignClass = { start: "justify-start text-left", center: "justify-center text-center", end: "justify-end text-right" } as const;

function columnAlign<T>(column: DataTableColumn<T>) {
  return column.align ?? (column.numeric ? "end" : "start");
}

/**
 * DataTable is a dense, keyboard-driven, virtualized data grid built on
 * semantic tokens. It owns interaction (selection, focus, resizing, grouping
 * and sort requests); the consumer owns the data (filtering and ordering).
 *
 * Keyboard: arrows move the cursor (Shift extends, Ctrl/Cmd moves without
 * selecting), Home/End, PageUp/PageDown, Ctrl+Space toggles, Ctrl+A selects
 * all, Enter activates, Left/Right collapse or expand a group header.
 *
 * @example
 * ```tsx
 * <DataTable
 *   aria-label="Files"
 *   columns={[{ id: "name", label: "Name", cell: (f) => f.name, grow: true, sortable: true }]}
 *   rows={files}
 *   getRowId={(f) => f.id}
 *   sort={sort}
 *   onSortChange={setSort}
 * />
 * ```
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  sort: sortProp,
  defaultSort = null,
  onSortChange,
  columnWidths: widthsProp,
  defaultColumnWidths,
  onColumnWidthsChange,
  hiddenColumns,
  showFilters = true,
  selectionMode = "multiple",
  selectedIds: selectedProp,
  defaultSelectedIds,
  onSelectedIdsChange,
  onFocusedIdChange,
  onRowActivate,
  onRowKeyDown,
  onRowContextMenu,
  rowClassName,
  getGroup,
  renderGroupHeader,
  collapsedGroups: collapsedProp,
  defaultCollapsedGroups,
  onCollapsedGroupsChange,
  density = "comfortable",
  rowHeight: rowHeightProp,
  virtualizeThreshold = 100,
  loading = false,
  empty,
  labels,
  reorderable = false,
  onRowsMove,
  className,
  onKeyDown,
  onFocus,
  onBlur,
  ...props
}: DataTableProps<T>) {
  const rowHeight = rowHeightProp ?? ROW_HEIGHT[density];
  const scrollRef = useRef<HTMLDivElement>(null);
  const idPrefix = `dt${useId().replace(/:/g, "")}`;

  const [sort, setSort] = useControllableState<DataTableSort | null>({
    value: sortProp,
    defaultValue: defaultSort,
    onChange: onSortChange,
  });
  const [widths, setWidths] = useControllableState<Record<string, number>>({
    value: widthsProp as Record<string, number> | undefined,
    defaultValue: { ...(defaultColumnWidths ?? {}) },
    onChange: onColumnWidthsChange,
  });
  const [selected, setSelected] = useControllableState<ReadonlySet<string>>({
    value: selectedProp,
    defaultValue: defaultSelectedIds ?? EMPTY_SET,
    onChange: onSelectedIdsChange,
  });
  const [collapsedList, setCollapsedList] = useControllableState<readonly string[]>({
    value: collapsedProp,
    defaultValue: defaultCollapsedGroups ?? [],
    onChange: onCollapsedGroupsChange as ((groups: readonly string[]) => void) | undefined,
  });
  const anchorRef = useRef<string | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [hasFocus, setHasFocus] = useState(false);

  const visibleColumns = useMemo(() => {
    const hidden = new Set(hiddenColumns ?? []);
    return columns.filter((column) => !hidden.has(column.id));
  }, [columns, hiddenColumns]);

  const widthOf = useCallback(
    (column: DataTableColumn<T>) =>
      clampWidth(widths[column.id] ?? column.width ?? DEFAULT_WIDTH, column.minWidth, column.maxWidth),
    [widths],
  );

  const hasHandle = reorderable !== false && onRowsMove != null;
  const canDrag = (row: T) => hasHandle && (typeof reorderable === "function" ? reorderable(row) : true);
  const template = [
    ...(hasHandle ? [`${HANDLE_WIDTH}px`] : []),
    ...visibleColumns.map((column) => (column.grow ? `minmax(${widthOf(column)}px, 1fr)` : `${widthOf(column)}px`)),
  ].join(" ");
  const minWidth = visibleColumns.reduce((sum, column) => sum + widthOf(column), hasHandle ? HANDLE_WIDTH : 0);
  const gridStyle: CSSProperties = { gridTemplateColumns: template, minWidth };

  const collapsed = useMemo(() => new Set(collapsedList), [collapsedList]);
  const items = useMemo(
    () => buildDisplayItems(rows, getRowId, getGroup, collapsed),
    [rows, getRowId, getGroup, collapsed],
  );
  const rowOrder = useMemo(() => items.flatMap((item) => (item.kind === "row" ? [item.key] : [])), [items]);

  // --- Reordering (pointer drag by the handle, Alt+Arrow). The table only
  // reports the request; the consumer applies or refuses it. ---
  const headerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ ids: string[]; target: string | null; position: "before" | "after" } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const [movePending, setMovePending] = useState(false);

  const commitMove = (move: DataTableRowMove) => {
    if (!onRowsMove || movePending) return;
    setMovePending(true);
    Promise.resolve()
      .then(() => onRowsMove(move))
      .catch(() => undefined)
      .finally(() => setMovePending(false));
  };

  const dropTargetAt = (clientY: number): { target: string | null; position: "before" | "after" } => {
    const scroller = scrollRef.current;
    if (!scroller || items.length === 0) return { target: null, position: "before" };
    const rect = scroller.getBoundingClientRect();
    const header = headerRef.current?.offsetHeight ?? 0;
    const y = clientY - rect.top + scroller.scrollTop - header;
    const index = Math.floor(y / rowHeight);
    if (index >= items.length) {
      const last = rowOrder[rowOrder.length - 1] ?? null;
      return { target: last, position: "after" };
    }
    const item = items[Math.max(0, index)];
    if (!item || item.kind !== "row") return { target: null, position: "before" };
    const position = y - Math.max(0, index) * rowHeight < rowHeight / 2 ? "before" : "after";
    return { target: item.key, position };
  };

  const startDrag = (event: PointerEvent<HTMLElement>, key: string) => {
    if (event.button !== 0 || movePending) return;
    event.preventDefault();
    event.stopPropagation();
    const ids = movingRows(rowOrder, selected, key);
    setDrag({ ids, target: null, position: "before" });
    const handle = event.currentTarget;
    handle.setPointerCapture?.(event.pointerId);
    let lastY = event.clientY;
    let frame = 0;
    const scroll = () => {
      const scroller = scrollRef.current;
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        const top = rect.top + (headerRef.current?.offsetHeight ?? 0);
        if (lastY < top + AUTOSCROLL_EDGE) scroller.scrollTop -= AUTOSCROLL_STEP;
        else if (lastY > rect.bottom - AUTOSCROLL_EDGE) scroller.scrollTop += AUTOSCROLL_STEP;
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    const onMove = (move: globalThis.PointerEvent) => {
      lastY = move.clientY;
      const next = dropTargetAt(move.clientY);
      setDrag((prev) => (prev ? { ...prev, ...next } : prev));
    };
    const finish = (apply: boolean) => {
      cancelAnimationFrame(frame);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      const current = dragRef.current;
      setDrag(null);
      if (apply && current?.target && isDropTarget(current.ids, current.target)) {
        commitMove({ ids: current.ids, targetId: current.target, position: current.position });
      }
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (key: globalThis.KeyboardEvent) => {
      if (key.key === "Escape") {
        key.preventDefault();
        finish(false);
      }
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
  };

  const rowById = useMemo(() => {
    const map = new Map<string, T>();
    for (const item of items) if (item.kind === "row") map.set(item.key, item.row);
    return map;
  }, [items]);

  const focusedIndex = focusedKey == null ? -1 : items.findIndex((item) => item.key === focusedKey);
  const virtualize = items.length > virtualizeThreshold;

  const virtualizer = useVirtualizer({
    count: virtualize ? items.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
    getItemKey: (index) => items[index]?.key ?? index,
  });

  // Keep the cursor visible while navigating a virtualized list.
  useEffect(() => {
    if (!virtualize || focusedIndex < 0) return;
    virtualizer.scrollToIndex(focusedIndex, { align: "auto" });
  }, [focusedIndex, virtualize, virtualizer]);

  const moveFocus = (key: string | null) => {
    setFocusedKey(key);
    const item = key == null ? undefined : items.find((candidate) => candidate.key === key);
    onFocusedIdChange?.(item?.kind === "row" ? item.key : null);
  };

  const select = (target: string, intent: ReturnType<typeof selectionIntent>) => {
    if (selectionMode === "none") return;
    const state: SelectionState = { selected, anchor: anchorRef.current };
    const next = applySelection(state, rowOrder, target, intent);
    anchorRef.current = next.anchor;
    setSelected(next.selected);
  };

  const toggleGroup = (group: string, force?: boolean) => {
    const isCollapsed = collapsed.has(group);
    const nextCollapsed = force ?? !isCollapsed;
    if (nextCollapsed === isCollapsed) return;
    setCollapsedList(nextCollapsed ? [...collapsedList, group] : collapsedList.filter((g) => g !== group));
  };

  const handleRowClick = (event: MouseEvent<HTMLDivElement>, key: string) => {
    moveFocus(key);
    select(key, selectionIntent(event, selectionMode));
    scrollRef.current?.focus({ preventScroll: true });
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>, item: DataTableDisplayItem<T>) => {
    if (item.kind !== "row") return;
    moveFocus(item.key);
    if (!selected.has(item.key)) select(item.key, "replace");
    onRowContextMenu?.(event, item.row);
  };

  const pageSize = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? rowHeight * 10) / rowHeight) - 1);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.target !== event.currentTarget || items.length === 0) return;
    const current = focusedIndex;
    const item = current >= 0 ? items[current] : undefined;
    const mod = event.ctrlKey || event.metaKey;

    if (hasHandle && event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      if (item?.kind !== "row") return;
      const ids = movingRows(rowOrder, selected, item.key).filter((id) => {
        const row = rowById.get(id);
        return row !== undefined && canDrag(row);
      });
      const move = keyboardMove(rowOrder, ids, event.key === "ArrowUp" ? -1 : 1);
      if (move) commitMove(move);
      return;
    }

    let target: number | null = null;
    switch (event.key) {
      case "ArrowDown":
        target = Math.min(items.length - 1, current + 1);
        break;
      case "ArrowUp":
        target = Math.max(0, current < 0 ? 0 : current - 1);
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = items.length - 1;
        break;
      case "PageDown":
        target = Math.min(items.length - 1, Math.max(0, current) + pageSize);
        break;
      case "PageUp":
        target = Math.max(0, current - pageSize);
        break;
      case "ArrowLeft":
      case "ArrowRight":
        if (item?.kind === "group") {
          event.preventDefault();
          toggleGroup(item.group, event.key === "ArrowLeft");
        }
        return;
      case "Enter":
        if (!item) return;
        event.preventDefault();
        if (item.kind === "group") toggleGroup(item.group);
        else onRowActivate?.(item.row);
        return;
      case " ":
        if (item?.kind === "group") {
          event.preventDefault();
          toggleGroup(item.group);
          return;
        }
        if (item?.kind === "row" && mod) {
          event.preventDefault();
          select(item.key, selectionMode === "multiple" ? "toggle" : "replace");
          return;
        }
        break;
      case "a":
      case "A":
        if (mod && selectionMode === "multiple") {
          event.preventDefault();
          const next = selectAll({ selected, anchor: anchorRef.current }, rowOrder);
          setSelected(next.selected);
          return;
        }
        break;
    }

    if (target != null) {
      event.preventDefault();
      const next = items[target]!;
      moveFocus(next.key);
      if (next.kind === "row" && !mod) {
        select(next.key, event.shiftKey ? selectionIntent({ shiftKey: true }, selectionMode) : "replace");
      }
      return;
    }

    if (item?.kind === "row") onRowKeyDown?.(event, item.row);
  };

  const startResize = (event: PointerEvent<HTMLDivElement>, column: DataTableColumn<T>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widthOf(column);
    const handle = event.currentTarget;
    handle.setPointerCapture?.(event.pointerId);
    const onMove = (move: globalThis.PointerEvent) => {
      setWidths((prev) => ({
        ...prev,
        [column.id]: clampWidth(startWidth + move.clientX - startX, column.minWidth, column.maxWidth),
      }));
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const resizeByKey = (event: KeyboardEvent<HTMLDivElement>, column: DataTableColumn<T>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const delta = event.key === "ArrowLeft" ? -RESIZE_STEP : RESIZE_STEP;
    setWidths((prev) => ({
      ...prev,
      [column.id]: clampWidth(widthOf(column) + delta, column.minWidth, column.maxWidth),
    }));
  };

  const hasFilters = showFilters && visibleColumns.some((column) => column.filter != null);
  const headerRowCount = hasFilters ? 2 : 1;
  const activeDescendant = focusedIndex >= 0 ? `${idPrefix}-${focusedIndex}` : undefined;

  const renderItem = (item: DataTableDisplayItem<T>, index: number, style?: CSSProperties) => {
    const common = {
      id: `${idPrefix}-${index}`,
      role: "row",
      "aria-rowindex": index + headerRowCount + 1,
      onContextMenu: (event: MouseEvent<HTMLDivElement>) => handleContextMenu(event, item),
    } as const;
    const focused = hasFocus && index === focusedIndex;

    if (item.kind === "group") {
      return (
        <div
          key={item.key}
          {...common}
          aria-expanded={!item.collapsed}
          className={cn(rowVariants({ focused }), "cursor-pointer bg-structure hover:bg-structure-raised")}
          style={{ ...gridStyle, height: rowHeight, ...style }}
          onClick={() => {
            moveFocus(item.key);
            toggleGroup(item.group);
            scrollRef.current?.focus({ preventScroll: true });
          }}
        >
          <div role="gridcell" className="col-span-full flex min-w-0 items-center gap-2 px-3 font-medium">
            {item.collapsed ? (
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-fg-muted" />
            ) : (
              <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-fg-muted" />
            )}
            <span className="min-w-0 flex-1 truncate">
              {renderGroupHeader
                ? renderGroupHeader({ group: item.group, count: item.count, collapsed: item.collapsed })
                : `${item.group} (${item.count})`}
            </span>
          </div>
        </div>
      );
    }

    const isSelected = selected.has(item.key);
    const dropAt = drag && drag.target === item.key && isDropTarget(drag.ids, item.key) ? drag.position : undefined;
    const dragged = drag?.ids.includes(item.key) ?? false;
    return (
      <div
        key={item.key}
        {...common}
        aria-selected={selectionMode === "none" ? undefined : isSelected}
        data-selected={isSelected || undefined}
        data-drop={dropAt}
        className={cn(
          rowVariants({ selected: isSelected, focused }),
          "cursor-default",
          dragged && "opacity-60",
          dropAt && "after:pointer-events-none after:absolute after:inset-x-0 after:z-10 after:h-0.5 after:bg-brand",
          dropAt === "before" && "after:top-0",
          dropAt === "after" && "after:bottom-0",
          rowClassName?.(item.row),
        )}
        style={{ ...gridStyle, height: rowHeight, ...style }}
        onClick={(event) => handleRowClick(event, item.key)}
        onDoubleClick={() => onRowActivate?.(item.row)}
      >
        {hasHandle ? (
          <div role="gridcell" className="flex h-full items-center justify-center">
            {canDrag(item.row) ? (
              <span
                role="button"
                tabIndex={-1}
                aria-label={labels?.dragHandle ?? "Drag to reorder"}
                aria-disabled={movePending || undefined}
                className={cn(
                  "flex h-6 w-5 touch-none items-center justify-center rounded text-fg-subtle hover:bg-hover hover:text-fg",
                  movePending ? "cursor-progress" : "cursor-grab active:cursor-grabbing",
                )}
                onPointerDown={(event) => startDrag(event, item.key)}
                onClick={(event) => event.stopPropagation()}
              >
                <GripVertical aria-hidden="true" className="h-4 w-4" />
              </span>
            ) : null}
          </div>
        ) : null}
        {visibleColumns.map((column) => (
          <div
            key={column.id}
            role="gridcell"
            className={cn(
              "flex h-full min-w-0 items-center overflow-hidden px-3",
              alignClass[columnAlign(column)],
              column.numeric && "tabular-nums",
            )}
          >
            <span className="min-w-0 truncate">{column.cell(item.row, item.rowIndex)}</span>
          </div>
        ))}
      </div>
    );
  };

  const body = (() => {
    if (loading) {
      return (
        <div role="row" aria-busy="true" aria-label={labels?.loading ?? "Loading"} className="flex flex-col gap-2 p-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <div role="row">
          <div role="gridcell" className="p-6">
            {empty}
          </div>
        </div>
      );
    }
    if (!virtualize) return items.map((item, index) => renderItem(item, index));
    return (
      <div role="rowgroup" style={{ height: virtualizer.getTotalSize(), position: "relative", minWidth }}>
        {virtualizer.getVirtualItems().map((virtual) =>
          renderItem(items[virtual.index]!, virtual.index, {
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            transform: `translateY(${virtual.start}px)`,
          }),
        )}
      </div>
    );
  })();

  return (
    <div className={cn(rootVariants(), className)}>
      <div
        ref={scrollRef}
        role="grid"
        tabIndex={0}
        aria-rowcount={items.length + headerRowCount}
        aria-colcount={visibleColumns.length + (hasHandle ? 1 : 0)}
        aria-multiselectable={selectionMode === "multiple" || undefined}
        aria-activedescendant={hasFocus ? activeDescendant : undefined}
        aria-busy={loading || movePending || undefined}
        className="min-h-0 flex-1 overflow-auto focus-visible:outline-none"
        onKeyDown={handleKeyDown}
        onFocus={(event) => {
          onFocus?.(event);
          if (event.target !== event.currentTarget) return;
          setHasFocus(true);
          if (focusedIndex < 0 && items.length > 0) moveFocus(items[0]!.key);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHasFocus(false);
        }}
        {...props}
      >
        <div ref={headerRef} role="rowgroup" className="sticky top-0 z-10 border-b border-border bg-structure">
          <div role="row" aria-rowindex={1} className="grid" style={gridStyle}>
            {hasHandle ? <div role="columnheader" aria-label={labels?.dragHandle ?? "Drag to reorder"} /> : null}
            {visibleColumns.map((column) => {
              const sorted = sort?.columnId === column.id ? sort.direction : null;
              const ariaSort = column.sortable
                ? sorted === "asc"
                  ? "ascending"
                  : sorted === "desc"
                    ? "descending"
                    : "none"
                : undefined;
              const content = column.header ?? column.label;
              return (
                <div
                  key={column.id}
                  role="columnheader"
                  aria-sort={ariaSort}
                  className={cn(
                    "relative flex min-w-0 items-center font-medium text-fg-muted",
                    density === "compact" ? "h-8" : "h-10",
                  )}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => setSort(nextSort(sort, column.id))}
                      className={cn(
                        "flex h-full min-w-0 flex-1 items-center gap-1 px-3 hover:text-fg",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        alignClass[columnAlign(column)],
                      )}
                    >
                      <span className="min-w-0 truncate">{content}</span>
                      {sorted === "asc" ? (
                        <ArrowUp aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-fg" />
                      ) : sorted === "desc" ? (
                        <ArrowDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-fg" />
                      ) : (
                        <ArrowUpDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-40" />
                      )}
                    </button>
                  ) : (
                    <span className={cn("flex min-w-0 flex-1 px-3", alignClass[columnAlign(column)])}>
                      <span className="min-w-0 truncate">{content}</span>
                    </span>
                  )}
                  {column.resizable !== false ? (
                    <div
                      role="separator"
                      tabIndex={0}
                      aria-orientation="vertical"
                      aria-label={`${labels?.resizeColumn ?? "Resize column"} ${column.label}`}
                      aria-valuenow={widthOf(column)}
                      aria-valuemin={column.minWidth ?? 48}
                      aria-valuemax={column.maxWidth ?? 2000}
                      onPointerDown={(event) => startResize(event, column)}
                      onKeyDown={(event) => resizeByKey(event, column)}
                      onClick={(event) => event.stopPropagation()}
                      className={cn(
                        "absolute inset-y-1 right-0 w-1.5 cursor-col-resize touch-none rounded-full",
                        "hover:bg-border-strong focus-visible:bg-ring focus-visible:outline-none",
                      )}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
          {hasFilters ? (
            <div role="row" aria-rowindex={2} className="grid border-t border-border-subtle" style={gridStyle}>
              {hasHandle ? <div role="gridcell" /> : null}
              {visibleColumns.map((column) => (
                <div key={column.id} role="gridcell" className="min-w-0 px-1.5 py-1">
                  {column.filter}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {body}
      </div>
    </div>
  );
}
