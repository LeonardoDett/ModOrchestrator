"use client";

import { format } from "date-fns";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useCalendarDay, useCalendar } from "./use-calendar";
import { useCalendarConfig } from "./calendar.config-context";
import { mergeMetadata } from "./internal/filter-highlight";
import { CalendarItems } from "./calendar.items";

const dayVariants = defineRecipe({
  base: [
    "relative flex min-h-[132px] flex-col border-b border-r border-border p-1.5",
    "transition-colors duration-fast",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
  ].join(" "),
  variants: {
    isCurrentPeriod: { false: "bg-muted", true: "bg-surface" },
    isSelected: {
      true: "bg-secondary-subtle ring-1 ring-inset ring-secondary-border",
      false: "",
    },
    isHighlighted: { true: "bg-warning-subtle", false: "" },
    isDisabled: { true: "pointer-events-none text-fg-subtle", false: "" },
  },
  defaultVariants: {
    isCurrentPeriod: true,
    isSelected: false,
    isHighlighted: false,
    isDisabled: false,
  },
});

const dayNumberVariants = defineRecipe({
  base: "flex size-7 shrink-0 items-center justify-center text-sm tabular-nums",
  variants: {
    isToday: {
      true: "rounded-full bg-secondary font-semibold text-on-secondary shadow-xs",
      false: "rounded-md",
    },
    isSelected: {
      true: "rounded-full bg-secondary font-semibold text-on-secondary shadow-xs",
      false: "",
    },
    isCurrentPeriod: { false: "text-fg-muted", true: "text-fg" },
  },
  compoundVariants: [
    {
      isToday: true,
      class: "text-on-secondary",
    },
    {
      isSelected: true,
      class: "text-on-secondary",
    },
  ],
});

interface CalendarDayProps {
  className?: string;
  maxVisibleItems?: number;
  children?: React.ReactNode;
}

export function CalendarDayHeader({ className }: { className?: string }) {
  const { day } = useCalendarDay("DayHeader");

  return (
    <div className={cn("mb-1 flex shrink-0 items-start justify-end", className)}>
      <span
        className={dayNumberVariants({
          isToday: day.isToday,
          isSelected: day.isSelected,
          isCurrentPeriod: day.isCurrentPeriod,
        })}
      >
        {format(day.date, "d")}
      </span>
    </div>
  );
}

export function CalendarDay({ className, maxVisibleItems = 3, children }: CalendarDayProps) {
  const { day } = useCalendarDay("Day");
  const { view, metadata: providerMeta, actions } = useCalendar();
  const { onDateClick, onDateDoubleClick } = useCalendarConfig("Day");

  const handleClick = () => {
    if (day.isDisabled) return;
    actions.selectDate(day.date);
    onDateClick?.({
      date: day.date,
      day,
      view,
      metadata: mergeMetadata(providerMeta, day.metadata, undefined),
    });
  };

  const handleDoubleClick = () => {
    onDateDoubleClick?.({
      date: day.date,
      day,
      view,
      metadata: mergeMetadata(providerMeta, day.metadata, undefined),
    });
  };

  return (
    <div
      className={cn(
        dayVariants({
          isCurrentPeriod: day.isCurrentPeriod,
          isSelected: day.isSelected,
          isHighlighted: day.isHighlighted,
          isDisabled: day.isDisabled,
        }),
        !day.isDisabled && "cursor-pointer",
        className
      )}
      role="gridcell"
      aria-selected={day.isSelected}
      aria-current={day.isToday ? "date" : undefined}
      aria-disabled={day.isDisabled}
      data-date={day.date.toISOString()}
      tabIndex={day.isDisabled ? -1 : 0}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <CalendarDayHeader />
      {children ?? <CalendarItems maxVisibleItems={maxVisibleItems} />}
    </div>
  );
}

export function CalendarDayFooter({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn("mt-auto pt-1", className)}>{children}</div>;
}

export function CalendarWeek({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("grid grid-cols-7", className)} role="row">
      {children}
    </div>
  );
}
