import { endOfDay, startOfDay } from "date-fns";
import type { CalendarItem, CalendarItemLayout } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DURATION_MS = 30 * 60 * 1000;

export function getItemEnd(item: CalendarItem): Date {
  return item.end ?? new Date(item.start.getTime() + DEFAULT_DURATION_MS);
}

/** Fração do dia (0–1) correspondente ao horário atual. */
export function getCurrentTimeOffset(date: Date = new Date()): number {
  const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  return minutes / (24 * 60);
}

function itemsOverlap(a: CalendarItem, b: CalendarItem): boolean {
  const aEnd = getItemEnd(a);
  const bEnd = getItemEnd(b);
  return a.start.getTime() < bEnd.getTime() && b.start.getTime() < aEnd.getTime();
}

function toOffset(date: Date, dayStart: Date): number {
  const ms = date.getTime() - dayStart.getTime();
  return Math.max(0, Math.min(1, ms / DAY_MS));
}

export function computeTimedLayouts(
  items: CalendarItem[],
  day: Date
): Map<string, CalendarItemLayout> {
  const dayStart = startOfDay(day);
  const timed = items
    .filter((item) => !item.allDay)
    .sort((a, b) => {
      const diff = a.start.getTime() - b.start.getTime();
      if (diff !== 0) return diff;
      return getItemEnd(b).getTime() - getItemEnd(a).getTime();
    });

  const layouts = new Map<string, CalendarItemLayout>();
  if (timed.length === 0) return layouts;

  const clusters: CalendarItem[][] = [];
  let currentCluster: CalendarItem[] = [timed[0]!];

  for (let i = 1; i < timed.length; i++) {
    const item = timed[i]!;
    const overlapsCluster = currentCluster.some((c) => itemsOverlap(c, item));
    if (overlapsCluster) {
      currentCluster.push(item);
    } else {
      clusters.push(currentCluster);
      currentCluster = [item];
    }
  }
  clusters.push(currentCluster);

  for (const cluster of clusters) {
    const columns: CalendarItem[][] = [];

    for (const item of cluster) {
      let placed = false;
      for (const col of columns) {
        if (!col.some((c) => itemsOverlap(c, item))) {
          col.push(item);
          placed = true;
          break;
        }
      }
      if (!placed) columns.push([item]);
    }

    const columnCount = columns.length;
    for (let colIndex = 0; colIndex < columns.length; colIndex++) {
      for (const item of columns[colIndex]!) {
        layouts.set(item.id, {
          columnIndex: colIndex,
          columnCount,
          startOffset: toOffset(item.start, dayStart),
          endOffset: toOffset(getItemEnd(item), dayStart),
        });
      }
    }
  }

  return layouts;
}

export function getAllDayItems(items: CalendarItem[]): CalendarItem[] {
  return items.filter((item) => item.allDay);
}

export { hashEventColor as hashTypeColor } from "./event-colors";
