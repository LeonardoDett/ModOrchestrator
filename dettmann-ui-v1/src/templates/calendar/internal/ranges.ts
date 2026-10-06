import type { CalendarRange } from "../types";

export function rangeKey(range: CalendarRange): string {
  return `${range.start.getTime()}-${range.end.getTime()}`;
}

export function rangesEqual(a: CalendarRange, b: CalendarRange): boolean {
  return a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime();
}

export function rangeContains(outer: CalendarRange, inner: CalendarRange): boolean {
  return outer.start.getTime() <= inner.start.getTime() && outer.end.getTime() >= inner.end.getTime();
}

export function rangesIntersect(a: CalendarRange, b: CalendarRange): boolean {
  return a.start.getTime() <= b.end.getTime() && a.end.getTime() >= b.start.getTime();
}

export function unionRanges(ranges: CalendarRange[]): CalendarRange | null {
  if (ranges.length === 0) return null;
  const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime());
  let start = sorted[0]!.start;
  let end = sorted[0]!.end;

  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i]!;
    if (r.start.getTime() <= end.getTime() + 1) {
      if (r.end.getTime() > end.getTime()) end = r.end;
    } else {
      return { start, end };
    }
  }
  return { start, end };
}

export function mergeLoadedRanges(ranges: CalendarRange[]): CalendarRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: CalendarRange[] = [];
  let current = { ...sorted[0]! };

  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i]!;
    if (r.start.getTime() <= current.end.getTime() + 86400000) {
      if (r.end.getTime() > current.end.getTime()) current.end = r.end;
    } else {
      merged.push(current);
      current = { ...r };
    }
  }
  merged.push(current);
  return merged;
}

export function isRangeLoaded(
  target: CalendarRange,
  loadedRanges: CalendarRange[]
): boolean {
  return loadedRanges.some((loaded) => rangeContains(loaded, target));
}

export function isRangeRequested(
  target: CalendarRange,
  requestedRanges: CalendarRange[]
): boolean {
  return requestedRanges.some(
    (requested) => rangesEqual(requested, target) || rangeContains(requested, target)
  );
}

export function removeRangeFromLoaded(
  loadedRanges: CalendarRange[],
  toRemove: CalendarRange
): CalendarRange[] {
  return loadedRanges.filter((r) => !rangesEqual(r, toRemove));
}

export function preloadMonthRange(date: Date): CalendarRange {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export function preloadYearRange(date: Date): CalendarRange {
  const start = new Date(date.getFullYear(), 0, 1);
  const end = new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
  return { start, end };
}
