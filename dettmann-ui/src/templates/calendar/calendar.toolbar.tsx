"use client";

import { type ReactNode } from "react";
import { cn } from "../../utils/cn";
import { Tabs } from "../../components/tabs";
import { useCalendar } from "./use-calendar";
import { useCalendarConfig } from "./calendar.config-context";
import type { CalendarView } from "./types";

const VIEW_ORDER: CalendarView[] = ["month", "week", "day", "year", "agenda"];

interface CalendarToolbarProps {
  className?: string;
  children?: ReactNode;
}

export function CalendarToolbar({ className, children }: CalendarToolbarProps) {
  const { view, navigation } = useCalendar();
  const { labels } = useCalendarConfig("Toolbar");

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2 sm:px-6",
        className
      )}
    >
      <Tabs.Root
        value={view}
        onValueChange={(v) => navigation.setView(v as CalendarView)}
        variant="segmented"
      >
        <Tabs.List aria-label={labels.viewSwitcherAriaLabel}>
          {VIEW_ORDER.map((value) => (
            <Tabs.Trigger key={value} value={value}>
              {labels.viewLabels[value]}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>
      {children}
    </div>
  );
}
