import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isSameDay,
  isSameMonth,
  isToday as isTodayFn,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subWeeks,
} from "date-fns";
import type { Locale } from "date-fns";
import type { CalendarDayData, CalendarItem, CalendarRange, CalendarView } from "../types";

type WeekOptions = { locale?: Locale; weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6 };

export function getVisibleRange(
  view: CalendarView,
  cursorDate: Date,
  options: WeekOptions = {}
): CalendarRange {
  const { locale, weekStartsOn = 0 } = options;
  const weekOpts = { locale, weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 };

  switch (view) {
    case "month": {
      const monthStart = startOfMonth(cursorDate);
      const monthEnd = endOfMonth(cursorDate);
      return {
        start: startOfWeek(monthStart, weekOpts),
        end: endOfWeek(monthEnd, weekOpts),
      };
    }
    case "week":
      return {
        start: startOfWeek(cursorDate, weekOpts),
        end: endOfWeek(cursorDate, weekOpts),
      };
    case "day":
      return { start: startOfDay(cursorDate), end: endOfDay(cursorDate) };
    case "year":
      return { start: startOfYear(cursorDate), end: endOfYear(cursorDate) };
    case "agenda":
      return { start: startOfMonth(cursorDate), end: endOfMonth(cursorDate) };
    default:
      return { start: startOfMonth(cursorDate), end: endOfMonth(cursorDate) };
  }
}

export function getDaysInRange(range: CalendarRange): Date[] {
  return eachDayOfInterval({ start: range.start, end: range.end });
}

export function navigateCursor(
  view: CalendarView,
  cursorDate: Date,
  direction: "previous" | "next"
): Date {
  const delta = direction === "next" ? 1 : -1;
  switch (view) {
    case "month":
    case "agenda":
      return addMonths(cursorDate, delta);
    case "week":
      return addWeeks(cursorDate, delta);
    case "day":
      return addDays(cursorDate, delta);
    case "year":
      return new Date(cursorDate.getFullYear() + delta, cursorDate.getMonth(), cursorDate.getDate());
    default:
      return addMonths(cursorDate, delta);
  }
}

export function getPeriodTitle(
  view: CalendarView,
  cursorDate: Date,
  locale?: Locale,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0
): string {
  const fmtOpts = locale ? { locale } : undefined;
  const weekOpts = { locale, weekStartsOn };
  switch (view) {
    case "month":
    case "agenda":
      return format(cursorDate, "MMMM yyyy", fmtOpts);
    case "week": {
      const start = startOfWeek(cursorDate, weekOpts);
      const end = endOfWeek(cursorDate, weekOpts);
      if (isSameMonth(start, end)) {
        return `${format(start, "MMM d", fmtOpts)} – ${format(end, "d, yyyy", fmtOpts)}`;
      }
      return `${format(start, "MMM d", fmtOpts)} – ${format(end, "MMM d, yyyy", fmtOpts)}`;
    }
    case "day":
      return format(cursorDate, "EEEE, MMMM d, yyyy", fmtOpts);
    case "year":
      return format(cursorDate, "yyyy", fmtOpts);
    default:
      return format(cursorDate, "MMMM yyyy", fmtOpts);
  }
}

export function itemOverlapsDay(item: CalendarItem, day: Date): boolean {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  const itemStart = item.start;
  const itemEnd = item.end ?? item.start;
  return itemStart.getTime() <= dayEnd.getTime() && itemEnd.getTime() >= dayStart.getTime();
}

export function buildCalendarDays(
  dates: Date[],
  cursorDate: Date,
  view: CalendarView,
  items: CalendarItem[],
  options: {
    selectedDate: Date | null;
    selectedRange: CalendarRange | null;
    isDateDisabled?: (date: Date) => boolean;
    isDayHighlighted: (day: CalendarDayData) => boolean;
  }
): CalendarDayData[] {
  const { selectedDate, selectedRange, isDateDisabled, isDayHighlighted } = options;

  return dates.map((date) => {
    const dayItems = items.filter((item) => itemOverlapsDay(item, date));
    const isCurrentPeriod =
      view === "month" || view === "agenda"
        ? isSameMonth(date, cursorDate)
        : view === "year"
          ? date.getFullYear() === cursorDate.getFullYear()
          : true;

    const isSelected =
      (selectedDate !== null && isSameDay(date, selectedDate)) ||
      (selectedRange !== null &&
        date.getTime() >= selectedRange.start.getTime() &&
        date.getTime() <= selectedRange.end.getTime());

    const dayData: CalendarDayData = {
      date,
      isCurrentPeriod,
      isToday: isTodayFn(date),
      isSelected,
      isDisabled: isDateDisabled?.(date) ?? false,
      isHighlighted: false,
      items: dayItems,
    };
    dayData.isHighlighted = isDayHighlighted(dayData);
    return dayData;
  });
}

export function getWeekdayLabels(
  rangeStart: Date,
  locale?: Locale,
  weekdayFormat = "EEEEE"
): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(rangeStart, i);
    return format(date, weekdayFormat, locale ? { locale } : undefined);
  });
}

export { subMonths, subWeeks, addMonths, addWeeks, isSameDay, startOfMonth };
