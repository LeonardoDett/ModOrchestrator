import { isSameDay, startOfDay, endOfDay } from "date-fns";
import type {
  CalendarDayData,
  CalendarFilter,
  CalendarHighlight,
  CalendarItem,
  CalendarRange,
} from "../types";
import { rangesIntersect } from "./ranges";

export function applyFilter<TMeta extends Record<string, unknown>>(
  items: CalendarItem<TMeta>[],
  filter: CalendarFilter<TMeta> | null | undefined
): CalendarItem<TMeta>[] {
  if (!filter) return items;
  if (typeof filter === "function") return items.filter(filter);

  return items.filter((item) => {
    if (filter.type !== undefined && item.type !== filter.type) return false;
    if (filter.metadata) {
      const meta = (item.metadata ?? {}) as Record<string, unknown>;
      for (const [key, value] of Object.entries(filter.metadata)) {
        if (meta[key] !== value) return false;
      }
    }
    return true;
  });
}

export function isItemHighlighted(
  item: CalendarItem,
  highlight: CalendarHighlight | null | undefined
): boolean {
  if (!highlight) return false;
  if (typeof highlight === "function") return false;
  if (highlight.itemIds?.includes(item.id)) return true;
  if (highlight.types?.includes(item.type)) return true;
  return false;
}

export function createDayHighlightChecker(
  highlight: CalendarHighlight | null | undefined
): (day: CalendarDayData) => boolean {
  if (!highlight) return () => false;
  if (typeof highlight === "function") return highlight;

  return (day: CalendarDayData) => {
    if (highlight.dates?.some((d) => isSameDay(d, day.date))) return true;
    if (
      highlight.ranges?.some((range: CalendarRange) =>
        rangesIntersect(range, { start: startOfDay(day.date), end: endOfDay(day.date) })
      )
    ) {
      return true;
    }
    if (highlight.itemIds?.length) {
      return day.items.some((item) => highlight.itemIds!.includes(item.id));
    }
    if (highlight.types?.length) {
      return day.items.some((item) => highlight.types!.includes(item.type));
    }
    return false;
  };
}

export function mergeMetadata(
  providerMetadata: Record<string, unknown> | undefined,
  dayMetadata: Record<string, unknown> | undefined,
  itemMetadata: Record<string, unknown> | undefined
): Record<string, unknown> {
  return {
    ...(providerMetadata ?? {}),
    ...(dayMetadata ?? {}),
    ...(itemMetadata ?? {}),
  };
}
