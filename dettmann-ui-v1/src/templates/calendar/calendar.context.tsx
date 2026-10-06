"use client";

import { createStrictContext } from "../../utils/create-strict-context";
import type {
  CalendarActions,
  CalendarDayData,
  CalendarFilter,
  CalendarHighlight,
  CalendarItem,
  CalendarItemLayout,
  CalendarLoadStatus,
  CalendarRange,
  CalendarSelection,
  CalendarView,
} from "./types";

export type CalendarStateContextValue = {
  view: CalendarView;
  cursorDate: Date;
  selection: CalendarSelection;
  filter: CalendarFilter | null;
  highlight: CalendarHighlight | null;
  loadStatus: CalendarLoadStatus;
  loadError: Error | null;
  itemIndex: Map<string, CalendarItem>;
  loadedRanges: CalendarRange[];
  requestedRanges: CalendarRange[];
  providerMetadata: Record<string, unknown> | undefined;
  isItemsControlled: boolean;
};

export type CalendarDataContextValue = {
  visibleRange: CalendarRange;
  loadedRange: CalendarRange | null;
  requestedRange: CalendarRange | null;
  items: CalendarItem[];
  days: CalendarDayData[];
  selection: CalendarSelection;
  view: CalendarView;
  cursorDate: Date;
  loadStatus: CalendarLoadStatus;
  providerMetadata: Record<string, unknown> | undefined;
};

export type CalendarDayContextValue = {
  day: CalendarDayData;
};

export type CalendarItemContextValue = {
  item: CalendarItem;
  day: CalendarDayData;
  layout?: CalendarItemLayout;
  isSelected: boolean;
  isHighlighted: boolean;
};

export const [CalendarStateProvider, useCalendarStateContext] =
  createStrictContext<CalendarStateContextValue>("Calendar", "Calendar.Provider");

export const [CalendarActionsProvider, useCalendarActionsContext] =
  createStrictContext<CalendarActions>("Calendar", "Calendar.Provider");

export const [CalendarDataProvider, useCalendarDataContext] =
  createStrictContext<CalendarDataContextValue>("Calendar", "Calendar.Provider");

export const [CalendarDayProvider, useCalendarDayContext] =
  createStrictContext<CalendarDayContextValue>("Calendar", "Calendar.Grid");

export const [CalendarItemProvider, useCalendarDayItemContext] =
  createStrictContext<CalendarItemContextValue>("Calendar", "Calendar.Items");
