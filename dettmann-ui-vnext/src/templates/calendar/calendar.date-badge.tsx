"use client";

import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Typography } from "../../primitives/typography";
import { useCalendar } from "./use-calendar";
import { useCalendarConfig } from "./calendar.config-context";
import { getDateBadgeParts } from "./internal/period-meta";

const badgeVariants = defineRecipe({
  base: [
    "flex size-14 shrink-0 flex-col items-center justify-center rounded-lg border border-border",
    "bg-surface shadow-xs",
  ].join(" "),
  variants: {
    isToday: {
      true: "border-secondary-border",
      false: "",
    },
  },
});

const dayVariants = defineRecipe({
  base: "text-xl font-semibold leading-none tabular-nums",
  variants: {
    isToday: {
      true: "text-secondary-text",
      false: "text-fg",
    },
  },
});

interface CalendarDateBadgeProps {
  className?: string;
  date?: Date;
}

export function CalendarDateBadge({ className, date }: CalendarDateBadgeProps) {
  const { cursorDate } = useCalendar();
  const { locale } = useCalendarConfig("DateBadge");
  const target = date ?? cursorDate;
  const isToday = target.toDateString() === new Date().toDateString();
  const { monthAbbr, day } = getDateBadgeParts(target, locale);

  return (
    <div className={cn(badgeVariants({ isToday }), className)} aria-hidden>
      <Typography variant="body-sm" color="muted-fg" className="text-[10px] font-semibold uppercase leading-none">
        {monthAbbr}
      </Typography>
      <span className={dayVariants({ isToday })}>{day}</span>
    </div>
  );
}
