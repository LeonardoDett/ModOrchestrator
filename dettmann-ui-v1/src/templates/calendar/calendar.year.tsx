"use client";

import { format } from "date-fns";
import { useMemo } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Typography } from "../../primitives/typography";
import { useCalendar, useCalendarData } from "./use-calendar";
import { useCalendarConfig } from "./calendar.config-context";
import { eventToneProps, resolveEventColor, yearEventDotVariants } from "./internal/event-colors";
import type { CalendarDayData } from "./types";

interface CalendarYearProps {
  className?: string;
}

const yearDayNumberVariants = defineRecipe({
  base: "flex size-5 items-center justify-center rounded-sm text-[10px] leading-none tabular-nums",
  variants: {
    isToday: {
      true: "rounded-full bg-secondary font-semibold text-on-secondary",
      false: "",
    },
    isSelected: {
      true: "rounded-full bg-secondary-subtle font-medium ring-1 ring-inset ring-secondary-border",
      false: "",
    },
    isCurrentPeriod: {
      false: "text-fg-muted",
      true: "text-fg",
    },
  },
});

const yearDayVariants = defineRecipe({
  base: [
    "relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-sm",
    "transition-colors duration-fast hover:bg-hover",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  ].join(" "),
  variants: {
    isHighlighted: {
      true: "bg-warning-subtle",
      false: "",
    },
    hasEvents: {
      true: "font-medium",
      false: "",
    },
  },
});

function CalendarYearDay({
  dayData,
  onSelect,
}: {
  dayData: CalendarDayData;
  onSelect: (date: Date) => void;
}) {
  const { date } = dayData;
  const eventCount = dayData.items.length;
  const dotItems = dayData.items.slice(0, 3);

  return (
    <button
      type="button"
      className={yearDayVariants({
        isHighlighted: dayData.isHighlighted,
        hasEvents: eventCount > 0,
      })}
      onClick={() => onSelect(date)}
      aria-label={
        eventCount > 0
          ? `${format(date, "d")}, ${eventCount} evento${eventCount > 1 ? "s" : ""}`
          : format(date, "d")
      }
    >
      <span
        className={yearDayNumberVariants({
          isToday: dayData.isToday && !dayData.isSelected,
          isSelected: dayData.isSelected,
          isCurrentPeriod: dayData.isCurrentPeriod,
        })}
      >
        {format(date, "d")}
      </span>
      {eventCount > 0 ? (
        <span className="flex h-1 items-center gap-px" aria-hidden>
          {dotItems.map((item) => (
            <span
              key={item.id}
              className={yearEventDotVariants({ color: resolveEventColor(item) })}
              {...eventToneProps(resolveEventColor(item))}
            />
          ))}
        </span>
      ) : (
        <span className="h-1" aria-hidden />
      )}
    </button>
  );
}

export function CalendarYear({ className }: CalendarYearProps) {
  const { cursorDate, navigation } = useCalendar();
  const { days } = useCalendarData();
  const { locale } = useCalendarConfig("Year");
  const year = cursorDate.getFullYear();
  const fmtOpts = locale ? { locale } : undefined;

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) => ({
      monthDate: new Date(year, m, 1),
      days: days.filter((d) => d.date.getMonth() === m && d.date.getFullYear() === year),
    }));
  }, [year, days]);

  const handleDaySelect = (date: Date) => {
    navigation.goTo(date);
    navigation.setView("month");
  };

  return (
    <div className={cn("grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-4", className)}>
      {months.map(({ monthDate, days: monthDays }) => (
        <div key={monthDate.getMonth()} className="rounded-lg border border-border p-3">
          <Typography variant="heading-5" className="mb-2 capitalize">
            {format(monthDate, "MMMM", fmtOpts)}
          </Typography>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {monthDays.map((dayData) => (
              <CalendarYearDay
                key={dayData.date.toISOString()}
                dayData={dayData}
                onSelect={handleDaySelect}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
