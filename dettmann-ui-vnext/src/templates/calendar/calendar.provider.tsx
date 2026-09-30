"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Locale } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useControllableState } from "../../hooks/use-controllable-state";
import {
  CalendarActionsProvider,
  CalendarDataProvider,
  CalendarStateProvider,
  type CalendarStateContextValue,
} from "./calendar.context";
import { CalendarConfigProvider } from "./calendar.config-context";
import { buildCalendarDays, getDaysInRange, getVisibleRange, navigateCursor } from "./internal/dates";
import { applyFilter, createDayHighlightChecker, mergeMetadata } from "./internal/filter-highlight";
import {
  isRangeLoaded,
  isRangeRequested,
  mergeLoadedRanges,
  rangeKey,
  rangesEqual,
  rangesIntersect,
  removeRangeFromLoaded,
  unionRanges,
} from "./internal/ranges";
import type {
  CalendarActions,
  CalendarFilter,
  CalendarHandle,
  CalendarHighlight,
  CalendarInteractionContext,
  CalendarItem,
  CalendarItemRenderer,
  CalendarLoadReason,
  CalendarRange,
  CalendarSelection,
  CalendarView,
} from "./types";
import { calendarLabelsPtBR, type CalendarLabels } from "./internal/labels";

type InFlightRequest = {
  range: CalendarRange;
  reason: CalendarLoadReason;
  promise: Promise<CalendarItem[]>;
};

export type CalendarProviderProps = {
  children?: ReactNode;
  locale?: Locale;
  labels?: CalendarLabels;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  view?: CalendarView;
  defaultView?: CalendarView;
  onViewChange?: (view: CalendarView) => void;
  cursorDate?: Date;
  defaultCursorDate?: Date;
  onCursorDateChange?: (date: Date) => void;
  items?: CalendarItem[];
  defaultItems?: CalendarItem[];
  selectedDate?: Date | null;
  defaultSelectedDate?: Date | null;
  selectedRange?: CalendarRange | null;
  defaultSelectedRange?: CalendarRange | null;
  selectedItemId?: string | null;
  defaultSelectedItemId?: string | null;
  onSelectionChange?: (selection: CalendarSelection & CalendarInteractionContext) => void;
  filter?: CalendarFilter | null;
  defaultFilter?: CalendarFilter | null;
  onFilterChange?: (filter: CalendarFilter | null) => void;
  highlight?: CalendarHighlight | null;
  defaultHighlight?: CalendarHighlight | null;
  onHighlightChange?: (highlight: CalendarHighlight | null) => void;
  metadata?: Record<string, unknown>;
  itemRenderers?: Record<string, CalendarItemRenderer>;
  isDateDisabled?: (date: Date) => boolean;
  preloadRange?: CalendarRange;
  onLoad?: (request: { range: CalendarRange; reason: CalendarLoadReason }) => Promise<CalendarItem[]>;
  onRangeChange?: (range: CalendarRange) => void;
  onDateClick?: (ctx: CalendarInteractionContext) => void;
  onDateDoubleClick?: (ctx: CalendarInteractionContext) => void;
  onItemClick?: (ctx: CalendarInteractionContext) => void;
  onItemDoubleClick?: (ctx: CalendarInteractionContext) => void;
  onOverflowClick?: (ctx: CalendarInteractionContext & { visibleItems: CalendarItem[]; hiddenItems: CalendarItem[] }) => void;
  onSearchClick?: () => void;
  onAddEvent?: () => void;
  headerStart?: ReactNode;
  headerEnd?: ReactNode;
  onAction?: (ctx: { name: string } & CalendarInteractionContext) => void;
  onLoadStart?: (ctx: { range: CalendarRange; reason: CalendarLoadReason }) => void;
  onLoadSuccess?: (ctx: { range: CalendarRange; reason: CalendarLoadReason }) => void;
  onLoadError?: (ctx: { range: CalendarRange; reason: CalendarLoadReason; error: Error }) => void;
};

function itemsToMap(items: CalendarItem[]): Map<string, CalendarItem> {
  return new Map(items.map((item) => [item.id, item]));
}

function mapToItems(map: Map<string, CalendarItem>): CalendarItem[] {
  return Array.from(map.values());
}

export const CalendarProvider = forwardRef<CalendarHandle, CalendarProviderProps>(
  function CalendarProvider(props, ref) {
    const {
      children,
      locale = ptBR,
      labels = calendarLabelsPtBR,
      weekStartsOn = 0,
      view: viewProp,
      defaultView = "month",
      onViewChange,
      cursorDate: cursorDateProp,
      defaultCursorDate,
      onCursorDateChange,
      items: itemsProp,
      defaultItems = [],
      selectedDate: selectedDateProp,
      defaultSelectedDate = null,
      selectedRange: selectedRangeProp,
      defaultSelectedRange = null,
      selectedItemId: selectedItemIdProp,
      defaultSelectedItemId = null,
      onSelectionChange,
      filter: filterProp,
      defaultFilter = null,
      onFilterChange,
      highlight: highlightProp,
      defaultHighlight = null,
      onHighlightChange,
      metadata,
      itemRenderers,
      isDateDisabled,
      preloadRange,
      onLoad,
      onRangeChange,
      onDateClick,
      onDateDoubleClick,
      onItemClick,
      onItemDoubleClick,
      onOverflowClick,
      onSearchClick,
      onAddEvent,
      headerStart,
      headerEnd,
      onAction,
      onLoadStart,
      onLoadSuccess,
      onLoadError,
    } = props;

    const isItemsControlled = itemsProp !== undefined;

    const [view, setViewState] = useControllableState<CalendarView>({
      value: viewProp,
      defaultValue: defaultView,
      onChange: onViewChange,
      fallbackValue: "month",
    });

    const [cursorDate, setCursorDateState] = useControllableState<Date>({
      value: cursorDateProp,
      defaultValue: defaultCursorDate,
      onChange: onCursorDateChange,
      fallbackValue: new Date(),
    });

    const [selectedDate, setSelectedDate] = useControllableState<Date | null>({
      value: selectedDateProp,
      defaultValue: defaultSelectedDate,
      fallbackValue: null,
    });

    const [selectedRange, setSelectedRange] = useControllableState<CalendarRange | null>({
      value: selectedRangeProp,
      defaultValue: defaultSelectedRange,
      fallbackValue: null,
    });

    const [selectedItemId, setSelectedItemId] = useControllableState<string | null>({
      value: selectedItemIdProp,
      defaultValue: defaultSelectedItemId,
      fallbackValue: null,
    });

    const [filter, setFilterState] = useControllableState<CalendarFilter | null>({
      value: filterProp,
      defaultValue: defaultFilter,
      fallbackValue: null,
    });

    const [highlight, setHighlightState] = useControllableState<CalendarHighlight | null>({
      value: highlightProp,
      defaultValue: defaultHighlight,
      fallbackValue: null,
    });

    const [itemIndex, setItemIndex] = useState<Map<string, CalendarItem>>(() =>
      itemsToMap(isItemsControlled ? itemsProp! : defaultItems)
    );
    const [loadedRanges, setLoadedRanges] = useState<CalendarRange[]>([]);
    const [requestedRanges, setRequestedRanges] = useState<CalendarRange[]>([]);
    const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "error">("idle");
    const [loadError, setLoadError] = useState<Error | null>(null);

    const inFlightRef = useRef<Map<string, InFlightRequest>>(new Map());
    const callbacksRef = useRef({
      onLoad,
      onRangeChange,
      onDateClick,
      onDateDoubleClick,
      onItemClick,
      onItemDoubleClick,
      onOverflowClick,
      onAction,
      onLoadStart,
      onLoadSuccess,
      onLoadError,
      onSelectionChange,
      onFilterChange,
      onHighlightChange,
    });
    callbacksRef.current = {
      onLoad,
      onRangeChange,
      onDateClick,
      onDateDoubleClick,
      onItemClick,
      onItemDoubleClick,
      onOverflowClick,
      onAction,
      onLoadStart,
      onLoadSuccess,
      onLoadError,
      onSelectionChange,
      onFilterChange,
      onHighlightChange,
    };

    useEffect(() => {
      if (isItemsControlled) {
        setItemIndex(itemsToMap(itemsProp!));
      }
    }, [isItemsControlled, itemsProp]);

    const weekOpts = useMemo(() => ({ locale, weekStartsOn }), [locale, weekStartsOn]);

    const visibleRange = useMemo(
      () => getVisibleRange(view, cursorDate, weekOpts),
      [view, cursorDate, weekOpts]
    );

    const loadedRange = useMemo(() => unionRanges(loadedRanges), [loadedRanges]);
    const requestedRangeUnion = useMemo(() => unionRanges(requestedRanges), [requestedRanges]);

    const selection: CalendarSelection = useMemo(
      () => ({ selectedDate, selectedRange, selectedItemId }),
      [selectedDate, selectedRange, selectedItemId]
    );

    const notifySelectionChange = useCallback(
      (next: CalendarSelection) => {
        callbacksRef.current.onSelectionChange?.({
          ...next,
          view,
          metadata,
        });
      },
      [view, metadata]
    );

    const mergeItems = useCallback(
      (incoming: CalendarItem[]) => {
        if (isItemsControlled) return;
        setItemIndex((prev) => {
          const next = new Map(prev);
          for (const item of incoming) {
            next.set(item.id, item);
          }
          return next;
        });
      },
      [isItemsControlled]
    );

    const runLoad = useCallback(
      async (range: CalendarRange, reason: CalendarLoadReason): Promise<CalendarItem[]> => {
        const loadFn = callbacksRef.current.onLoad;
        if (!loadFn) return [];

        const key = rangeKey(range);
        const existing = inFlightRef.current.get(key);
        if (existing) return existing.promise;

        if (reason !== "refresh" && isRangeLoaded(range, loadedRanges)) {
          return [];
        }

        const promise = (async () => {
          callbacksRef.current.onLoadStart?.({ range, reason });
          setRequestedRanges((prev) => mergeLoadedRanges([...prev, range]));

          try {
            const result = await loadFn({ range, reason });
            mergeItems(result);
            setLoadedRanges((prev) => mergeLoadedRanges([...prev, range]));
            setLoadError(null);
            callbacksRef.current.onLoadSuccess?.({ range, reason });
            return result;
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setLoadError(error);
            callbacksRef.current.onLoadError?.({ range, reason, error });
            throw error;
          } finally {
            setRequestedRanges((prev) =>
              prev.filter((r) => !rangesEqual(r, range))
            );
            inFlightRef.current.delete(key);
          }
        })();

        inFlightRef.current.set(key, { range, reason, promise });
        return promise;
      },
      [loadedRanges, mergeItems]
    );

    const ensureVisibleLoaded = useCallback(async () => {
      if (!callbacksRef.current.onLoad) return;
      if (isRangeLoaded(visibleRange, loadedRanges)) return;
      if (isRangeRequested(visibleRange, requestedRanges)) return;

      setLoadStatus("loading");
      try {
        await runLoad(visibleRange, "visible");
        setLoadStatus("idle");
      } catch {
        setLoadStatus("error");
      }
    }, [visibleRange, loadedRanges, requestedRanges, runLoad]);

    useEffect(() => {
      callbacksRef.current.onRangeChange?.(visibleRange);
    }, [visibleRange]);

    useEffect(() => {
      const intersectsVisible =
        requestedRangeUnion !== null && rangesIntersect(requestedRangeUnion, visibleRange);
      if (intersectsVisible && inFlightRef.current.size > 0) {
        setLoadStatus("loading");
      } else if (inFlightRef.current.size === 0) {
        setLoadStatus(loadError ? "error" : "idle");
      }
    }, [requestedRangeUnion, visibleRange, loadError]);

    useEffect(() => {
      void ensureVisibleLoaded();
    }, [ensureVisibleLoaded]);

    useEffect(() => {
      if (preloadRange && callbacksRef.current.onLoad) {
        void runLoad(preloadRange, "preload");
      }
    }, [preloadRange, runLoad]);

    const allItems = useMemo(() => {
      const source = isItemsControlled ? itemsProp! : mapToItems(itemIndex);
      return applyFilter(source, filter);
    }, [isItemsControlled, itemsProp, itemIndex, filter]);

    const isDayHighlighted = useMemo(
      () => createDayHighlightChecker(highlight),
      [highlight]
    );

    const days = useMemo(() => {
      const dates =
        view === "month"
          ? getDaysInRange(visibleRange)
          : view === "year"
            ? getDaysInRange(visibleRange)
            : getDaysInRange(visibleRange);
      return buildCalendarDays(dates, cursorDate, view, allItems, {
        selectedDate,
        selectedRange,
        isDateDisabled,
        isDayHighlighted,
      });
    }, [
      view,
      visibleRange,
      cursorDate,
      allItems,
      selectedDate,
      selectedRange,
      isDateDisabled,
      isDayHighlighted,
    ]);

    const setView = useCallback(
      (nextView: CalendarView) => {
        setViewState(nextView);
      },
      [setViewState]
    );

    const goTo = useCallback(
      (date: Date) => {
        setCursorDateState(date);
      },
      [setCursorDateState]
    );

    const previous = useCallback(() => {
      setCursorDateState(navigateCursor(view, cursorDate, "previous"));
    }, [view, cursorDate, setCursorDateState]);

    const next = useCallback(() => {
      setCursorDateState(navigateCursor(view, cursorDate, "next"));
    }, [view, cursorDate, setCursorDateState]);

    const today = useCallback(() => {
      setCursorDateState(new Date());
    }, [setCursorDateState]);

    const selectDate = useCallback(
      (date: Date | null) => {
        setSelectedDate(date);
        const nextSel = { selectedDate: date, selectedRange, selectedItemId };
        notifySelectionChange(nextSel);
      },
      [setSelectedDate, selectedRange, selectedItemId, notifySelectionChange]
    );

    const selectRange = useCallback(
      (range: CalendarRange | null) => {
        setSelectedRange(range);
        const nextSel = { selectedDate, selectedRange: range, selectedItemId };
        notifySelectionChange(nextSel);
      },
      [setSelectedRange, selectedDate, selectedItemId, notifySelectionChange]
    );

    const selectItem = useCallback(
      (itemId: string | null) => {
        setSelectedItemId(itemId);
        const nextSel = { selectedDate, selectedRange, selectedItemId: itemId };
        notifySelectionChange(nextSel);
      },
      [setSelectedItemId, selectedDate, selectedRange, notifySelectionChange]
    );

    const clearSelection = useCallback(() => {
      setSelectedDate(null);
      setSelectedRange(null);
      setSelectedItemId(null);
      notifySelectionChange({
        selectedDate: null,
        selectedRange: null,
        selectedItemId: null,
      });
    }, [setSelectedDate, setSelectedRange, setSelectedItemId, notifySelectionChange]);

    const setFilter = useCallback(
      (next: CalendarFilter | null) => {
        setFilterState(next);
        callbacksRef.current.onFilterChange?.(next);
      },
      [setFilterState]
    );

    const setHighlight = useCallback(
      (next: CalendarHighlight | null) => {
        setHighlightState(next);
        callbacksRef.current.onHighlightChange?.(next);
      },
      [setHighlightState]
    );

    const refresh = useCallback(
      async (range?: CalendarRange) => {
        const target = range ?? visibleRange;
        setLoadedRanges((prev) => removeRangeFromLoaded(prev, target));
        setLoadStatus("loading");
        try {
          await runLoad(target, "refresh");
          setLoadStatus("idle");
        } catch {
          setLoadStatus("error");
        }
      },
      [visibleRange, runLoad]
    );

    const preload = useCallback(
      async (range: CalendarRange) => {
        if (isRangeLoaded(range, loadedRanges)) return;
        await runLoad(range, "preload");
      },
      [loadedRanges, runLoad]
    );

    const execute = useCallback(
      (name: string, payload?: Partial<CalendarInteractionContext>) => {
        callbacksRef.current.onAction?.({
          name,
          view,
          metadata: mergeMetadata(metadata, payload?.day?.metadata, payload?.item?.metadata),
          ...payload,
        });
      },
      [view, metadata]
    );

    const actions = useMemo<CalendarActions>(
      () => ({
        previous,
        next,
        today,
        goTo,
        setView,
        selectDate,
        selectRange,
        selectItem,
        clearSelection,
        setFilter,
        setHighlight,
        refresh,
        preload,
        execute,
      }),
      [
        previous,
        next,
        today,
        goTo,
        setView,
        selectDate,
        selectRange,
        selectItem,
        clearSelection,
        setFilter,
        setHighlight,
        refresh,
        preload,
        execute,
      ]
    );

    useImperativeHandle(
      ref,
      () => ({
        refresh,
        preload,
        next,
        previous,
        today,
        goTo,
        setView,
      }),
      [refresh, preload, next, previous, today, goTo, setView]
    );

    const stateValue = useMemo<CalendarStateContextValue>(
      () => ({
        view,
        cursorDate,
        selection,
        filter,
        highlight,
        loadStatus,
        loadError,
        itemIndex,
        loadedRanges,
        requestedRanges,
        providerMetadata: metadata,
        isItemsControlled,
      }),
      [
        view,
        cursorDate,
        selection,
        filter,
        highlight,
        loadStatus,
        loadError,
        itemIndex,
        loadedRanges,
        requestedRanges,
        metadata,
        isItemsControlled,
      ]
    );

    const dataValue = useMemo(
      () => ({
        visibleRange,
        loadedRange,
        requestedRange: requestedRangeUnion,
        items: allItems,
        days,
        selection,
        view,
        cursorDate,
        loadStatus,
        providerMetadata: metadata,
      }),
      [
        visibleRange,
        loadedRange,
        requestedRangeUnion,
        allItems,
        days,
        selection,
        view,
        cursorDate,
        loadStatus,
        metadata,
      ]
    );

    const configValue = useMemo(
      () => ({
        locale,
        labels,
        weekStartsOn,
        itemRenderers,
        isDateDisabled,
        onDateClick,
        onDateDoubleClick,
        onItemClick,
        onItemDoubleClick,
        onOverflowClick,
        onSearchClick,
        onAddEvent,
        headerStart,
        headerEnd,
      }),
      [
        locale,
        labels,
        weekStartsOn,
        itemRenderers,
        isDateDisabled,
        onDateClick,
        onDateDoubleClick,
        onItemClick,
        onItemDoubleClick,
        onOverflowClick,
        onSearchClick,
        onAddEvent,
        headerStart,
        headerEnd,
      ]
    );

    return (
      <CalendarConfigProvider value={configValue}>
        <CalendarStateProvider value={stateValue}>
          <CalendarActionsProvider value={actions}>
            <CalendarDataProvider value={dataValue}>{children ?? null}</CalendarDataProvider>
          </CalendarActionsProvider>
        </CalendarStateProvider>
      </CalendarConfigProvider>
    );
  }
);

CalendarProvider.displayName = "Calendar.Provider";
