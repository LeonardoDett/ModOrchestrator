"use client";

import { ChevronLeftIcon } from "../../icons/glyphs/chevron-left";
import { ChevronRightIcon } from "../../icons/glyphs/chevron-right";
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
        <Button type="button" emphasis="medium" size="sm" onClick={navigation.today}>
          {labels.today}
        </Button>
        <div className="flex items-center">
          <Button
            type="button"
            emphasis="low"
            size="sm"
            onClick={navigation.previous}
            aria-label={labels.previousPeriod}
          >
            <ChevronLeftIcon size="sm" />
          </Button>
          <Button
            type="button"
            emphasis="low"
            size="sm"
            onClick={navigation.next}
            aria-label={labels.nextPeriod}
          >
            <ChevronRightIcon size="sm" />
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
