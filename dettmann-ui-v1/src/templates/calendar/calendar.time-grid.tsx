"use client";

import { format } from "date-fns";
import { useEffect, useState } from "react";
import { cn } from "../../utils/cn";
import { Typography } from "../../primitives/typography";
import { CalendarDayProvider, CalendarItemProvider } from "./calendar.context";
import { CalendarItemStandard } from "./calendar.items";
import { useCalendarConfig } from "./calendar.config-context";
import { useCalendar, useCalendarData } from "./use-calendar";
import { computeTimedLayouts, getAllDayItems, getCurrentTimeOffset } from "./internal/layout";
import { isItemHighlighted } from "./internal/filter-highlight";
import type { CalendarDayData, CalendarItemRenderer } from "./types";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const TIME_COLUMN_CLASS = "bg-muted";

function useCurrentTime(refreshMs = 60_000) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), refreshMs);
    return () => window.clearInterval(id);
  }, [refreshMs]);

  return {
    now,
    offset: now ? getCurrentTimeOffset(now) : 0,
    isReady: now !== null,
  };
}

interface CalendarTimeGridProps {
  className?: string;
  mode?: "week" | "day";
}

export function CalendarTimeGrid({ className, mode = "week" }: CalendarTimeGridProps) {
  const { days } = useCalendarData();
  const { itemRenderers, locale, labels } = useCalendarConfig("TimeGrid");
  const { selection, highlight } = useCalendar();

  const columns = mode === "day" ? days.slice(0, 1) : days;
  const fmtOpts = { locale };

  return (
    <div className={cn("flex flex-col overflow-auto", className)}>
      <div
        className="grid border-b border-border"
        style={{
          gridTemplateColumns: `3.5rem repeat(${columns.length}, minmax(0, 1fr))`,
        }}
      >
        <div className={cn("border-r border-border", TIME_COLUMN_CLASS)} />
        {columns.map((day) => (
          <div
            key={day.date.toISOString()}
            className="flex items-center justify-center gap-1 border-r border-border px-2 py-2 last:border-r-0"
          >
            <Typography variant="body-sm" color="muted-fg" className="lowercase">
              {format(day.date, "EEE", fmtOpts).replace(/\.$/, "")}.
            </Typography>
            <span
              className={cn(
                "inline-flex size-7 items-center justify-center text-sm font-semibold tabular-nums",
                day.isToday && "rounded-full bg-secondary text-on-secondary shadow-xs"
              )}
            >
              {format(day.date, "d", fmtOpts)}
            </span>
          </div>
        ))}
      </div>

      {columns.some((d) => getAllDayItems(d.items).length > 0) ? (
        <div
          className="grid border-b border-border bg-muted"
          style={{
            gridTemplateColumns: `3.5rem repeat(${columns.length}, minmax(0, 1fr))`,
          }}
        >
          <div
            className={cn(
              "flex items-center justify-end border-r border-border px-2 py-1 text-xs text-fg-muted",
              TIME_COLUMN_CLASS
            )}
          >
            {labels.allDay}
          </div>
          {columns.map((day) => (
            <CalendarDayColumnAllDay key={day.date.toISOString()} day={day} />
          ))}
        </div>
      ) : null}

      <div className="relative flex flex-1">
        <div className={cn("w-14 shrink-0 border-r border-border", TIME_COLUMN_CLASS)}>
          {HOURS.map((h) => (
            <div key={h} className="relative h-12 pr-2 text-right text-xs text-fg-muted">
              <span className="absolute -top-2 right-2 tabular-nums">
                {labels.formatHour(h)}
              </span>
            </div>
          ))}
        </div>
        <div
          className="relative grid flex-1"
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
        >
          {columns.map((day) => (
            <CalendarDayColumnTimed
              key={day.date.toISOString()}
              day={day}
              itemRenderers={itemRenderers}
              selection={selection}
              highlight={highlight}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CalendarDayColumnAllDay({ day }: { day: CalendarDayData }) {
  const allDay = getAllDayItems(day.items);
  return (
    <CalendarDayProvider value={{ day }}>
      <div className="space-y-0.5 border-r border-border p-1 last:border-r-0">
        {allDay.map((item) => (
          <CalendarItemProvider
            key={item.id}
            value={{
              item,
              day,
              isSelected: false,
              isHighlighted: false,
            }}
          >
            <CalendarItemStandard item={item} day={day} />
          </CalendarItemProvider>
        ))}
      </div>
    </CalendarDayProvider>
  );
}

function CalendarCurrentTimeIndicator() {
  const { locale } = useCalendarConfig("CurrentTime");
  const { now, offset, isReady } = useCurrentTime();

  if (!isReady || !now) return null;

  const timeLabel = format(now, "HH:mm", { locale });

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-30"
      style={{ top: `${offset * 100}%` }}
      aria-hidden
    >
      <div className="relative flex -translate-y-1/2 items-center">
        <span className="shrink-0 rounded bg-danger px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums text-on-danger shadow-sm">
          {timeLabel}
        </span>
        <div className="size-2 shrink-0 rounded-full bg-danger ring-2 ring-page" />
        <div className="h-0.5 min-w-0 flex-1 bg-danger shadow-sm" />
      </div>
    </div>
  );
}

function CalendarDayColumnTimed({
  day,
  itemRenderers,
  selection,
  highlight,
}: {
  day: CalendarDayData;
  itemRenderers?: Record<string, CalendarItemRenderer>;
  selection: { selectedItemId: string | null };
  highlight: import("./types").CalendarHighlight | null;
}) {
  const timed = day.items.filter((i) => !i.allDay);
  const layouts = computeTimedLayouts(timed, day.date);

  return (
    <CalendarDayProvider value={{ day }}>
      <div className="relative border-r border-border last:border-r-0">
        {HOURS.map((h) => (
          <div key={h} className="h-12 border-b border-border" />
        ))}
        {day.isToday ? <CalendarCurrentTimeIndicator /> : null}
        <div className="absolute inset-0">
          {timed.map((item) => {
            const layout = layouts.get(item.id);
            if (!layout) return null;
            const Renderer = itemRenderers?.[item.type] ?? CalendarItemStandard;
            const top = `${layout.startOffset * 100}%`;
            const height = `${Math.max((layout.endOffset - layout.startOffset) * 100, 2.5)}%`;
            const width = `${100 / layout.columnCount}%`;
            const left = `${(layout.columnIndex / layout.columnCount) * 100}%`;
            const isSelected = selection.selectedItemId === item.id;
            const isHighlighted = isItemHighlighted(item, highlight);

            return (
              <CalendarItemProvider
                key={item.id}
                value={{ item, day, layout, isSelected, isHighlighted }}
              >
                <div
                  className="absolute z-10 overflow-hidden px-0.5 py-px"
                  style={{ top, height, width, left }}
                >
                  <Renderer item={item} day={day} layout={layout} />
                </div>
              </CalendarItemProvider>
            );
          })}
        </div>
      </div>
    </CalendarDayProvider>
  );
}
