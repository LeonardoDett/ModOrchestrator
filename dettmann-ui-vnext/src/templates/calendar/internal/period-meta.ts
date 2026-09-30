import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  getWeek,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import type { Locale } from "date-fns";
import type { CalendarRange, CalendarView } from "../types";
import { getPeriodTitle } from "./dates";

type WeekOptions = {
  locale?: Locale;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
};

export function getWeekNumber(
  date: Date,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0
): number {
  return getWeek(date, { weekStartsOn, firstWeekContainsDate: 4 });
}

export function getDateBadgeParts(
  date: Date,
  locale?: Locale
): { monthAbbr: string; day: string } {
  const fmtOpts = locale ? { locale } : undefined;
  return {
    monthAbbr: format(date, "MMM", fmtOpts).replace(/\.$/, "").toUpperCase() + ".",
    day: format(date, "d", fmtOpts),
  };
}

export function getPeriodSubtitle(
  view: CalendarView,
  cursorDate: Date,
  visibleRange: CalendarRange,
  locale?: Locale,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0
): string {
  const fmtOpts = locale ? { locale } : undefined;
  const weekOpts = { locale, weekStartsOn };

  switch (view) {
    case "month":
    case "agenda": {
      const start = startOfMonth(cursorDate);
      const end = endOfMonth(cursorDate);
      return `${format(start, "d 'de' MMM 'de' yyyy", fmtOpts)} – ${format(end, "d 'de' MMM 'de' yyyy", fmtOpts)}`;
    }
    case "week": {
      const start = startOfWeek(cursorDate, weekOpts);
      const end = endOfWeek(cursorDate, weekOpts);
      return `${format(start, "d 'de' MMM 'de' yyyy", fmtOpts)} – ${format(end, "d 'de' MMM 'de' yyyy", fmtOpts)}`;
    }
    case "day":
      return format(cursorDate, "EEEE, d 'de' MMMM 'de' yyyy", fmtOpts);
    case "year": {
      const start = startOfYear(cursorDate);
      const end = endOfYear(cursorDate);
      return `${format(start, "d 'de' MMM 'de' yyyy", fmtOpts)} – ${format(end, "d 'de' MMM 'de' yyyy", fmtOpts)}`;
    }
    default:
      return `${format(visibleRange.start, "d MMM yyyy", fmtOpts)} – ${format(visibleRange.end, "d MMM yyyy", fmtOpts)}`;
  }
}

export function getPeriodHeadingTitle(
  view: CalendarView,
  cursorDate: Date,
  locale?: Locale,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0
): string {
  return getPeriodTitle(view, cursorDate, locale, weekStartsOn);
}
