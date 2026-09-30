"use client";

import { format, isSameDay } from "date-fns";
import { cn } from "../../utils/cn";
import { Badge } from "../../components/badge";
import { EmptyState } from "../../components/empty-state";
import { Typography } from "../../primitives/typography";
import { CalendarDayProvider, CalendarItemProvider } from "./calendar.context";
import { CalendarItemStandard } from "./calendar.items";
import { useCalendarConfig } from "./calendar.config-context";
import { useCalendar, useCalendarData } from "./use-calendar";
import { isItemHighlighted } from "./internal/filter-highlight";
import { getWeekNumber } from "./internal/period-meta";

interface CalendarAgendaProps {
  className?: string;
}

export function CalendarAgenda({ className }: CalendarAgendaProps) {
  const { days, items } = useCalendarData();
  const { itemRenderers, locale, labels, weekStartsOn } = useCalendarConfig("Agenda");
  const { selection, highlight } = useCalendar();
  const fmtOpts = { locale };

  const daysWithItems = days.filter((d) => d.items.length > 0);

  if (daysWithItems.length === 0 && items.length === 0) {
    return (
      <EmptyState.Root className={cn("py-16", className)}>
        <EmptyState.Title>{labels.agendaEmptyTitle}</EmptyState.Title>
        <EmptyState.Description>{labels.agendaEmptyDescription}</EmptyState.Description>
      </EmptyState.Root>
    );
  }

  return (
    <div className={cn("divide-y divide-border", className)}>
      {daysWithItems.map((day) => {
        const isToday = isSameDay(day.date, new Date());
        const week = getWeekNumber(day.date, weekStartsOn);

        return (
          <div key={day.date.toISOString()} className="px-4 py-4 sm:px-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Typography variant="heading-5" className="capitalize">
                {format(day.date, "EEEE, d 'de' MMMM", fmtOpts)}
              </Typography>
              {isToday ? (
                <Badge variant="outline" size="sm">
                  {labels.agendaToday}
                </Badge>
              ) : (
                <Badge variant="outline" size="sm">
                  {labels.weekNumber(week)}
                </Badge>
              )}
            </div>
            <Typography variant="body-sm" color="muted-fg" className="mb-3 capitalize">
              {format(day.date, "EEEE, d 'de' MMMM 'de' yyyy", fmtOpts)}
            </Typography>
            <CalendarDayProvider value={{ day }}>
              <ul className="space-y-1.5">
                {day.items.map((item) => {
                  const Renderer = itemRenderers?.[item.type] ?? CalendarItemStandard;
                  const isSelected = selection.selectedItemId === item.id;
                  const isHighlighted = isItemHighlighted(item, highlight);
                  return (
                    <li key={item.id}>
                      <CalendarItemProvider
                        value={{ item, day, isSelected, isHighlighted }}
                      >
                        <Renderer item={item} day={day} />
                      </CalendarItemProvider>
                    </li>
                  );
                })}
              </ul>
            </CalendarDayProvider>
          </div>
        );
      })}
    </div>
  );
}
