"use client";

import { cn } from "../../utils/cn";
import { Skeleton } from "../../primitives/skeleton";
import { EmptyState } from "../../components/empty-state";
import { useCalendar } from "./use-calendar";
import { useCalendarConfig } from "./calendar.config-context";
import { CalendarGrid } from "./calendar.grid";
import { CalendarTimeGrid } from "./calendar.time-grid";
import { CalendarYear } from "./calendar.year";
import { CalendarAgenda } from "./calendar.agenda";

interface CalendarViewProps {
  className?: string;
}

export function CalendarViewSwitch({ className }: CalendarViewProps) {
  const { view, loadStatus, items } = useCalendar();

  if (loadStatus === "loading" && items.length === 0) {
    return (
      <div className={cn("space-y-2 p-4", className)}>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  switch (view) {
    case "month":
      return <CalendarGrid className={className} />;
    case "week":
      return <CalendarTimeGrid className={className} mode="week" />;
    case "day":
      return <CalendarTimeGrid className={className} mode="day" />;
    case "year":
      return <CalendarYear className={className} />;
    case "agenda":
      return <CalendarAgenda className={className} />;
    default:
      return <CalendarGrid className={className} />;
  }
}

export function CalendarStatus({ className }: { className?: string }) {
  const { loadStatus, loadError } = useCalendar();
  const { labels } = useCalendarConfig("Status");

  if (loadStatus === "error" && loadError) {
    return (
      <div className={cn("px-4 py-2", className)} role="alert">
        <EmptyState.Root className="py-6">
          <EmptyState.Title>{labels.loadErrorTitle}</EmptyState.Title>
          <EmptyState.Description>{loadError.message}</EmptyState.Description>
        </EmptyState.Root>
      </div>
    );
  }

  return null;
}

export { CalendarViewSwitch as CalendarView };
