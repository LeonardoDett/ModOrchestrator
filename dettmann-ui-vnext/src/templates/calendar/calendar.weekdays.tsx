"use client";

import { cn } from "../../utils/cn";
import { useCalendarData } from "./use-calendar";
import { getWeekdayLabels } from "./internal/dates";
import { useCalendarConfig } from "./calendar.config-context";

interface CalendarWeekdaysProps {
  className?: string;
  weekdayFormat?: string;
}

export function CalendarWeekdays({ className, weekdayFormat = "EEE" }: CalendarWeekdaysProps) {
  const { visibleRange } = useCalendarData();
  const { locale } = useCalendarConfig("Weekdays");
  const labels = getWeekdayLabels(visibleRange.start, locale, weekdayFormat);

  return (
    <div
      className={cn("grid grid-cols-7 border-b border-border", className)}
      role="row"
    >
      {labels.map((label, i) => (
        <div
          key={i}
          className="flex h-10 items-center justify-center text-xs font-medium lowercase text-fg-muted"
          role="columnheader"
        >
          {label.replace(/\.$/, "")}.
        </div>
      ))}
    </div>
  );
}
