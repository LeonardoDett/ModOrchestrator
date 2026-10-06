"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Button } from "../../components/button";
import { Typography } from "../../primitives/typography";
import { useCalendar } from "./use-calendar";
import { getPeriodTitle } from "./internal/dates";
import { useCalendarConfig } from "./calendar.config-context";

const headerVariants = defineRecipe({
  base: "flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6",
});

interface CalendarHeaderProps {
  className?: string;
}

export function CalendarHeader({ className }: CalendarHeaderProps) {
  const { view, cursorDate, navigation, loadStatus } = useCalendar();
  const { locale, labels, weekStartsOn } = useCalendarConfig("Header");
  const title = getPeriodTitle(view, cursorDate, locale, weekStartsOn);

  return (
    <header className={cn(headerVariants(), className)}>
      <Typography variant="heading-4" className="min-w-0 truncate capitalize">
        {title}
      </Typography>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={navigation.today}>
          {labels.today}
        </Button>
        <div className="flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={navigation.previous}
            aria-label={labels.previousPeriod}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={navigation.next}
            aria-label={labels.nextPeriod}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {loadStatus === "loading" ? (
          <span className="text-xs text-fg-muted" aria-live="polite">
            {labels.loading}
          </span>
        ) : null}
      </div>
    </header>
  );
}
