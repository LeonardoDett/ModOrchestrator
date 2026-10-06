"use client";

import { cn } from "../../utils/cn";
import { Badge } from "../../components/badge";
import { Typography } from "../../primitives/typography";
import { useCalendar } from "./use-calendar";
import { useCalendarConfig } from "./calendar.config-context";
import {
  getPeriodHeadingTitle,
  getPeriodSubtitle,
  getWeekNumber,
} from "./internal/period-meta";

interface CalendarPeriodMetaProps {
  className?: string;
  showWeekBadge?: boolean;
}

export function CalendarPeriodMeta({ className, showWeekBadge = true }: CalendarPeriodMetaProps) {
  const { view, cursorDate, visibleRange } = useCalendar();
  const { locale, labels, weekStartsOn } = useCalendarConfig("PeriodMeta");

  const title = getPeriodHeadingTitle(view, cursorDate, locale, weekStartsOn);
  const subtitle = getPeriodSubtitle(view, cursorDate, visibleRange, locale, weekStartsOn);
  const week = getWeekNumber(cursorDate, weekStartsOn);

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Typography variant="heading-4" className="truncate capitalize">
          {title}
        </Typography>
        {showWeekBadge && (view === "month" || view === "week") ? (
          <Badge variant="outline" size="sm">
            {labels.weekNumber(week)}
          </Badge>
        ) : null}
      </div>
      <Typography variant="body-sm" color="muted-fg" className="mt-0.5 truncate capitalize">
        {subtitle}
      </Typography>
    </div>
  );
}
