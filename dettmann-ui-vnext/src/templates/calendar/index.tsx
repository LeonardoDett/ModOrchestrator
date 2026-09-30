"use client";

import { type ReactNode } from "react";
import { CalendarProvider, type CalendarProviderProps } from "./calendar.provider";
import { CalendarRoot } from "./calendar.root";
import { CalendarHeader } from "./calendar.header";
import { CalendarToolbar } from "./calendar.toolbar";
import { CalendarPageHeader } from "./calendar.page-header";
import { CalendarDateBadge } from "./calendar.date-badge";
import { CalendarPeriodMeta } from "./calendar.period-meta";
import { CalendarView, CalendarStatus } from "./calendar.view";
import { CalendarWeekdays } from "./calendar.weekdays";
import { CalendarGrid } from "./calendar.grid";
import { CalendarWeek, CalendarDay, CalendarDayHeader, CalendarDayFooter } from "./calendar.day";
import { CalendarItems, CalendarItemStandard, CalendarOverflowButton } from "./calendar.items";
import { CalendarTimeGrid } from "./calendar.time-grid";
import { CalendarYear } from "./calendar.year";
import { CalendarAgenda } from "./calendar.agenda";

type CalendarShortcutProps = Omit<CalendarProviderProps, "children"> & {
  children?: ReactNode;
  className?: string;
};

function CalendarShortcut({ children, className, ...providerProps }: CalendarShortcutProps) {
  if (children !== undefined) {
    return (
      <CalendarProvider {...providerProps}>
        <CalendarRoot className={className}>{children}</CalendarRoot>
      </CalendarProvider>
    );
  }

  return (
    <CalendarProvider {...providerProps}>
      <CalendarRoot className={className}>
        <CalendarPageHeader />
        <CalendarStatus />
        <CalendarView />
      </CalendarRoot>
    </CalendarProvider>
  );
}

export { CalendarProvider } from "./calendar.provider";
export { CalendarRoot } from "./calendar.root";
export { CalendarHeader } from "./calendar.header";
export { CalendarToolbar } from "./calendar.toolbar";
export { CalendarPageHeader } from "./calendar.page-header";
export { CalendarDateBadge } from "./calendar.date-badge";
export { CalendarPeriodMeta } from "./calendar.period-meta";
export { CalendarWeekdays } from "./calendar.weekdays";
export { CalendarGrid } from "./calendar.grid";
export { CalendarWeek, CalendarDay, CalendarDayHeader, CalendarDayFooter } from "./calendar.day";
export { CalendarItems, CalendarItemStandard, CalendarItemDefault, CalendarOverflowButton } from "./calendar.items";
export { CalendarTimeGrid } from "./calendar.time-grid";
export { CalendarYear } from "./calendar.year";
export { CalendarAgenda } from "./calendar.agenda";
export { CalendarView, CalendarStatus } from "./calendar.view";
export {
  useCalendar,
  useCalendarActions,
  useCalendarData,
  useCalendarState,
  useCalendarDay,
  useCalendarDayItem,
} from "./use-calendar";

export const Calendar = Object.assign(CalendarShortcut, {
  Provider: CalendarProvider,
  Root: CalendarRoot,
  Header: CalendarHeader,
  Toolbar: CalendarToolbar,
  PageHeader: CalendarPageHeader,
  DateBadge: CalendarDateBadge,
  PeriodMeta: CalendarPeriodMeta,
  Weekdays: CalendarWeekdays,
  Grid: CalendarGrid,
  Week: CalendarWeek,
  Day: CalendarDay,
  DayHeader: CalendarDayHeader,
  DayFooter: CalendarDayFooter,
  Items: CalendarItems,
  Item: CalendarItemStandard,
  OverflowButton: CalendarOverflowButton,
  TimeGrid: CalendarTimeGrid,
  Year: CalendarYear,
  Agenda: CalendarAgenda,
  View: CalendarView,
  Status: CalendarStatus,
});

export type {
  CalendarView as CalendarViewType,
  CalendarRange,
  CalendarItem,
  CalendarDayData,
  CalendarItemLayout,
  CalendarItemRenderer,
  CalendarItemRendererProps,
  CalendarFilter,
  CalendarHighlight,
  CalendarInteractionContext,
  CalendarOverflowContext,
  CalendarSelection,
  CalendarActions,
  CalendarHandle,
  CalendarLoadReason,
  CalendarLoadRequest,
} from "./types";

export type { CalendarProviderProps } from "./calendar.provider";
export { calendarLabelsPtBR, calendarLabelsEn, type CalendarLabels } from "./internal/labels";
