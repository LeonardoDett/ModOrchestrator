"use client";

import {
  useCalendarActionsContext,
  useCalendarDataContext,
  useCalendarDayContext,
  useCalendarDayItemContext,
  useCalendarStateContext,
} from "./calendar.context";
import type {
  CalendarActions,
  CalendarDayData,
  CalendarItem,
  CalendarItemLayout,
  CalendarRange,
  CalendarSelection,
  CalendarView,
} from "./types";

export function useCalendarActions(): CalendarActions {
  return useCalendarActionsContext("useCalendarActions");
}

export function useCalendarState() {
  return useCalendarStateContext("useCalendarState");
}

export function useCalendarData() {
  return useCalendarDataContext("useCalendarData");
}

export function useCalendar() {
  const state = useCalendarStateContext("useCalendar");
  const data = useCalendarDataContext("useCalendar");
  const actions = useCalendarActionsContext("useCalendar");

  return {
    view: data.view,
    cursorDate: data.cursorDate,
    selection: data.selection,
    filter: state.filter,
    highlight: state.highlight,
    visibleRange: data.visibleRange,
    loadedRange: data.loadedRange,
    requestedRange: data.requestedRange,
    items: data.items,
    days: data.days,
    loadStatus: data.loadStatus,
    loadError: state.loadError,
    metadata: data.providerMetadata,
    navigation: {
      previous: actions.previous,
      next: actions.next,
      today: actions.today,
      goTo: actions.goTo,
      setView: actions.setView,
    },
    actions,
    filters: {
      set: actions.setFilter,
      current: state.filter,
    },
    highlights: {
      set: actions.setHighlight,
      current: state.highlight,
    },
  };
}

export function useCalendarDay(consumerName = "Day"): { day: CalendarDayData } {
  return useCalendarDayContext(consumerName);
}

export function useCalendarDayItem<TMeta extends Record<string, unknown> = Record<string, unknown>>(
  consumerName = "Item"
): {
  item: CalendarItem<TMeta>;
  day: CalendarDayData<TMeta>;
  layout?: CalendarItemLayout;
  isSelected: boolean;
  isHighlighted: boolean;
  calendar: ReturnType<typeof useCalendar>;
  actions: CalendarActions;
} {
  const ctx = useCalendarDayItemContext(consumerName);
  const calendar = useCalendar();
  const actions = useCalendarActions();

  return {
    item: ctx.item as CalendarItem<TMeta>,
    day: ctx.day as CalendarDayData<TMeta>,
    layout: ctx.layout,
    isSelected: ctx.isSelected,
    isHighlighted: ctx.isHighlighted,
    calendar,
    actions,
  };
}

export type {
  CalendarActions,
  CalendarDayData,
  CalendarItem,
  CalendarRange,
  CalendarSelection,
  CalendarView,
};
