"use client";

import { type ComponentType } from "react";
import { cn } from "../../utils/cn";
import { Typography } from "../../primitives/typography";
import {
  CalendarDayProvider,
  CalendarItemProvider,
} from "./calendar.context";
import { useCalendarConfig } from "./calendar.config-context";
import { useCalendar, useCalendarActions, useCalendarDay } from "./use-calendar";
import { isItemHighlighted } from "./internal/filter-highlight";
import {
  eventToneProps,
  monthEventVariants,
  resolveEventColor,
  timedEventVariants,
} from "./internal/event-colors";
import { mergeMetadata } from "./internal/filter-highlight";
import type { CalendarDayData, CalendarItem, CalendarItemRendererProps } from "./types";

/**
 * Renderer padrão — pill colorida no mês (título + horário na mesma linha).
 * Na grade horária (week/day), bloco pastel com borda e horário único abaixo do título.
 */
export function CalendarItemStandard({ item, day, layout }: CalendarItemRendererProps) {
  const actions = useCalendarActions();
  const { view, metadata: providerMeta, selection, highlight } = useCalendar();
  const { onItemClick, onItemDoubleClick, labels } = useCalendarConfig("Item");

  const isSelected = selection.selectedItemId === item.id;
  const isHighlighted = isItemHighlighted(item, highlight);
  const isTimedGrid = layout !== undefined;
  const colorKey = resolveEventColor(item);
  const title = item.title ?? item.type;
  const timeLabel = item.allDay ? null : labels.formatEventTime(item.start);

  const ctx = {
    date: day.date,
    day,
    item,
    view,
    metadata: mergeMetadata(providerMeta, day.metadata, item.metadata),
  };

  return (
    <button
      type="button"
      className={
        isTimedGrid
          ? timedEventVariants({ color: colorKey, isSelected, isHighlighted })
          : monthEventVariants({ color: colorKey, isSelected, isHighlighted })
      }
      {...eventToneProps(colorKey)}
      onClick={(e) => {
        e.stopPropagation();
        actions.selectItem(item.id);
        onItemClick?.(ctx);
        actions.execute("open-item", ctx);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onItemDoubleClick?.(ctx);
      }}
    >
      {isTimedGrid ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Typography variant="body-sm" className="min-w-0 truncate text-left font-medium">
            {title}
          </Typography>
          {timeLabel ? (
            <Typography
              variant="body-sm"
              className="mt-auto pt-0.5 text-[10px] leading-tight tabular-nums text-fg-muted"
            >
              {timeLabel}
            </Typography>
          ) : null}
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <Typography variant="body-sm" className="min-w-0 truncate">
            {title}
          </Typography>
          {timeLabel ? (
            <Typography variant="body-sm" className="shrink-0 tabular-nums text-fg-muted">
              {timeLabel}
            </Typography>
          ) : null}
        </div>
      )}
    </button>
  );
}

/** @deprecated Use CalendarItemStandard — alias mantido para compatibilidade. */
export const CalendarItemDefault = CalendarItemStandard;

interface CalendarItemsProps {
  maxVisibleItems?: number;
  itemRenderer?: ComponentType<CalendarItemRendererProps>;
  className?: string;
}

export function CalendarItems({
  maxVisibleItems = 3,
  itemRenderer,
  className,
}: CalendarItemsProps) {
  const { day } = useCalendarDay("Items");
  const { itemRenderers, labels } = useCalendarConfig("Items");
  const { actions, view, metadata: providerMeta } = useCalendar();
  const { onOverflowClick } = useCalendarConfig("Items");
  const { selection, highlight } = useCalendar();

  const visible = day.items.slice(0, maxVisibleItems);
  const hidden = day.items.slice(maxVisibleItems);
  const hiddenCount = hidden.length;

  const renderItem = (item: CalendarItem) => {
    const Renderer =
      itemRenderer ?? itemRenderers?.[item.type] ?? CalendarItemStandard;
    const isSelected = selection.selectedItemId === item.id;
    const isHighlighted = isItemHighlighted(item, highlight);

    return (
      <CalendarItemProvider
        key={item.id}
        value={{ item, day, isSelected, isHighlighted }}
      >
        <Renderer item={item} day={day} />
      </CalendarItemProvider>
    );
  };

  const handleOverflow = () => {
    const ctx = {
      date: day.date,
      day,
      view,
      metadata: mergeMetadata(providerMeta, day.metadata, undefined),
      visibleItems: visible,
      hiddenItems: hidden,
    };
    onOverflowClick?.(ctx);
    actions.execute("overflow", ctx);
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden", className)}>
      {visible.map(renderItem)}
      {hiddenCount > 0 ? (
        <CalendarOverflowButton count={hiddenCount} onClick={handleOverflow} label={labels.overflowMore(hiddenCount)} />
      ) : null}
    </div>
  );
}

export function CalendarOverflowButton({
  count,
  onClick,
  label,
  className,
}: {
  count: number;
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  const { labels } = useCalendarConfig("OverflowButton");
  const text = label ?? labels.overflowMore(count);

  return (
    <button
      type="button"
      className={cn(
        "px-1.5 py-0.5 text-left text-xs font-medium text-fg-muted hover:text-fg",
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {text}
    </button>
  );
}

export { CalendarItemStandard as CalendarItem };
