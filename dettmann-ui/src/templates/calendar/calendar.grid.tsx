"use client";

import { type ComponentType, type ReactNode } from "react";
import { cn } from "../../utils/cn";
import { CalendarDayProvider } from "./calendar.context";
import { CalendarDay } from "./calendar.day";
import { CalendarWeek } from "./calendar.day";
import { CalendarWeekdays } from "./calendar.weekdays";
import { useCalendarData } from "./use-calendar";
import { useCalendarConfig } from "./calendar.config-context";
import type { CalendarDayData } from "./types";

interface CalendarGridProps {
  className?: string;
  dayRenderer?: ComponentType;
  maxVisibleItems?: number;
  children?: (day: CalendarDayData) => ReactNode;
}

export function CalendarGrid({
  className,
  dayRenderer: DayRenderer,
  maxVisibleItems = 3,
  children,
}: CalendarGridProps) {
  const { days } = useCalendarData();
  const { labels } = useCalendarConfig("Grid");

  const weeks: CalendarDayData[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const renderDayCell = (day: CalendarDayData) => {
    const content =
      children !== undefined ? (
        children(day)
      ) : DayRenderer ? (
        <DayRenderer />
      ) : (
        <CalendarDay maxVisibleItems={maxVisibleItems} />
      );

    return (
      <CalendarDayProvider key={day.date.toISOString()} value={{ day }}>
        {content}
      </CalendarDayProvider>
    );
  };

  return (
    <div className={cn("flex flex-col", className)} role="grid" aria-label={labels.calendarAriaLabel}>
      <CalendarWeekdays />
      <div className="flex flex-col">
        {weeks.map((week, wi) => (
          <CalendarWeek key={wi}>{week.map(renderDayCell)}</CalendarWeek>
        ))}
      </div>
    </div>
  );
}
