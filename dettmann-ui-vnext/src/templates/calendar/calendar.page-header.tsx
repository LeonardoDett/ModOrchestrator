"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { type ReactNode } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Button } from "../../components/button";
import { ButtonGroup } from "../../components/button-group";
import { Input } from "../../components/input";
import { useCalendar } from "./use-calendar";
import { useCalendarConfig } from "./calendar.config-context";
import { CalendarDateBadge } from "./calendar.date-badge";
import { CalendarPeriodMeta } from "./calendar.period-meta";
import type { CalendarView } from "./types";

const VIEW_ORDER: CalendarView[] = ["month", "week", "day", "year", "agenda"];

const headerVariants = defineRecipe({
  base: [
    "flex flex-col gap-4 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6",
  ].join(" "),
});

interface CalendarPageHeaderProps {
  className?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  showSearch?: boolean;
  showAddEvent?: boolean;
  showViewSelect?: boolean;
  showNavigation?: boolean;
}

export function CalendarPageHeader({
  className,
  leading,
  trailing,
  showSearch = true,
  showAddEvent = true,
  showViewSelect = true,
  showNavigation = true,
}: CalendarPageHeaderProps) {
  const { view, navigation, loadStatus } = useCalendar();
  const { labels, onSearchClick, onAddEvent, headerStart, headerEnd } =
    useCalendarConfig("PageHeader");

  const viewOptions = VIEW_ORDER.map((value) => ({
    value,
    label: labels.viewSelectLabels[value],
  }));

  return (
    <header className={cn(headerVariants(), className)}>
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        {headerStart}
        {leading ?? (
          <>
            <CalendarDateBadge />
            <CalendarPeriodMeta />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {showSearch && onSearchClick ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={labels.search}
            onClick={onSearchClick}
          >
            <Search className="h-4 w-4" />
          </Button>
        ) : null}

        {showNavigation ? (
          <ButtonGroup>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={labels.previousPeriod}
              onClick={navigation.previous}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={navigation.today}>
              {labels.today}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={labels.nextPeriod}
              onClick={navigation.next}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </ButtonGroup>
        ) : null}

        {showViewSelect ? (
          <Input.Root
            name="calendar-view"
            value={view}
            onChange={(v: string) => navigation.setView(v as CalendarView)}
            className="w-auto min-w-[9.5rem]"
          >
            <Input.Box padding="sm" className="gap-1 pr-2">
              <Input.Select
                options={viewOptions}
                aria-label={labels.viewSwitcherAriaLabel}
                className="pr-5"
              />
              <ChevronDown
                className="pointer-events-none size-4 shrink-0 text-fg-muted"
                aria-hidden
              />
            </Input.Box>
          </Input.Root>
        ) : null}

        {showAddEvent && onAddEvent ? (
          <Button type="button" variant="primary" size="sm" onClick={onAddEvent}>
            <Plus className="h-4 w-4" />
            {labels.addEvent}
          </Button>
        ) : null}

        {loadStatus === "loading" ? (
          <span className="text-xs text-fg-muted" aria-live="polite">
            {labels.loading}
          </span>
        ) : null}

        {headerEnd}
        {trailing}
      </div>
    </header>
  );
}
