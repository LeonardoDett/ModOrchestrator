"use client";

import { type ComponentPropsWithoutRef } from "react";
import {
  format as formatDate,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  isAfter,
  isBefore,
  setYear,
  setMonth,
  getYear,
  getMonth,
} from "date-fns";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useDatePickerContext } from "./date-picker.context";

const panelVariants = defineRecipe({
  base: [
    "z-50 w-72 p-3 rounded-xl",
    "bg-raised border border-border shadow-xl",
    "outline-none",
  ].join(" "),
});

const headerVariants = defineRecipe({
  base: "flex items-center justify-between mb-2",
});

const navButtonVariants = defineRecipe({
  base: [
    "flex items-center justify-center",
    "h-8 w-8 rounded-md",
    "hover:bg-hover transition-colors duration-fast",
    "disabled:cursor-not-allowed disabled:text-fg-subtle disabled:bg-muted",
  ].join(" "),
});

const monthYearVariants = defineRecipe({
  base: "flex items-center gap-1 text-sm font-medium",
});

const selectVariants = defineRecipe({
  base: [
    "appearance-none bg-transparent border-none cursor-pointer",
    "text-fg text-sm font-medium",
    "hover:text-secondary-text transition-colors",
    "focus:outline-none focus:ring-0",
    "[&:focus]:outline-none [&:focus]:ring-0",
    "[&>option]:bg-raised [&>option]:text-fg",
  ].join(" "),
});

const weekdaysVariants = defineRecipe({
  base: "grid grid-cols-7 gap-1 mb-1",
});

const weekdayVariants = defineRecipe({
  base: "h-8 flex items-center justify-center text-xs font-medium text-fg-muted",
});

const daysGridVariants = defineRecipe({
  base: "grid grid-cols-7 gap-1",
});

const dayButtonVariants = defineRecipe({
  base: [
    "h-8 w-8 flex items-center justify-center rounded-md",
    "text-sm transition-colors duration-fast",
    "disabled:cursor-not-allowed disabled:text-fg-subtle",
  ].join(" "),
  variants: {
    isSelected: {
      true: "bg-secondary text-on-secondary font-medium",
      false: "hover:bg-hover",
    },
    isToday: {
      true: "ring-1 ring-secondary ring-inset",
      false: "",
    },
    isCurrentMonth: {
      true: "text-fg",
      false: "text-fg-muted",
    },
  },
  defaultVariants: {
    isSelected: false,
    isToday: false,
    isCurrentMonth: true,
  },
});

interface DatePickerPanelProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  /** Show week day headers */
  showWeekdays?: boolean;
  /** Show days from adjacent months */
  showOutsideDays?: boolean;
  /** Weekday format (e.g., "EEEEE" for single letter) */
  weekdayFormat?: string;
}

/**
 * DatePicker.Panel renders the calendar panel.
 *
 * @example
 * ```tsx
 * <DatePicker.Panel />
 * ```
 */
export function DatePickerPanel({
  showWeekdays = true,
  showOutsideDays = true,
  weekdayFormat = "EEEEE",
  className,
  ...props
}: DatePickerPanelProps) {
  const {
    value,
    onChange,
    viewDate,
    setViewDate,
    minDate,
    maxDate,
    locale,
  } = useDatePickerContext("Panel");

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const calendarStart = startOfWeek(monthStart, locale ? { locale } : undefined);
  const calendarEnd = endOfWeek(monthEnd, locale ? { locale } : undefined);

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const today = new Date();

  const handlePrevMonth = () => setViewDate(subMonths(viewDate, 1));
  const handleNextMonth = () => setViewDate(addMonths(viewDate, 1));

  const handleSelectDay = (day: Date) => {
    onChange(day);
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setViewDate(setMonth(viewDate, parseInt(e.target.value)));
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setViewDate(setYear(viewDate, parseInt(e.target.value)));
  };

  const isDateDisabled = (date: Date) => {
    if (minDate && isBefore(date, minDate)) return true;
    if (maxDate && isAfter(date, maxDate)) return true;
    return false;
  };

  const weekdays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(calendarStart);
    date.setDate(date.getDate() + i);
    return formatDate(date, weekdayFormat, locale ? { locale } : undefined);
  });

  const currentYear = getYear(viewDate);
  const years = Array.from({ length: 100 }, (_, i) => currentYear - 50 + i);
  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i,
    label: formatDate(new Date(2000, i, 1), "MMMM", locale ? { locale } : undefined),
  }));

  return (
    <div className={cn(panelVariants(), className)} {...props}>
      {/* Header with navigation */}
      <div className={headerVariants()}>
        <button
          type="button"
          className={navButtonVariants()}
          onClick={handlePrevMonth}
          aria-label="Previous month"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className={monthYearVariants()}>
          <select
            value={getMonth(viewDate)}
            onChange={handleMonthChange}
            className={selectVariants()}
            aria-label="Select month"
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <select
            value={currentYear}
            onChange={handleYearChange}
            className={selectVariants()}
            aria-label="Select year"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className={navButtonVariants()}
          onClick={handleNextMonth}
          aria-label="Next month"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Weekday headers */}
      {showWeekdays && (
        <div className={weekdaysVariants()}>
          {weekdays.map((day, i) => (
            <div key={i} className={weekdayVariants()}>
              {day}
            </div>
          ))}
        </div>
      )}

      {/* Days grid */}
      <div className={daysGridVariants()}>
        {days.map((day, i) => {
          const isCurrentMonth = isSameMonth(day, viewDate);
          const isSelected = value ? isSameDay(day, value) : false;
          const isToday = isSameDay(day, today);
          const disabled = isDateDisabled(day);

          if (!showOutsideDays && !isCurrentMonth) {
            return <div key={i} className="h-8 w-8" />;
          }

          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => handleSelectDay(day)}
              className={dayButtonVariants({
                isSelected,
                isToday: isToday && !isSelected,
                isCurrentMonth,
              })}
            >
              {formatDate(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
