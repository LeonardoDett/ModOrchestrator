import type { ComponentType } from "react";
import type { Locale } from "date-fns";

export type CalendarView = "month" | "week" | "day" | "year" | "agenda";

export type CalendarRange = { start: Date; end: Date };

export type CalendarLoadReason = "visible" | "preload" | "refresh";

export type CalendarLoadRequest = {
  range: CalendarRange;
  reason: CalendarLoadReason;
};

export type CalendarItem<TMeta extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  type: string;
  start: Date;
  end?: Date;
  allDay?: boolean;
  title?: string;
  metadata?: TMeta;
};

export type CalendarItemLayout = {
  columnIndex: number;
  columnCount: number;
  startOffset: number;
  endOffset: number;
};

export type CalendarDayData<TMeta extends Record<string, unknown> = Record<string, unknown>> = {
  date: Date;
  isCurrentPeriod: boolean;
  isToday: boolean;
  isSelected: boolean;
  isDisabled: boolean;
  isHighlighted: boolean;
  items: CalendarItem<TMeta>[];
  metadata?: Record<string, unknown>;
};

export type CalendarItemRendererProps<
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> = {
  item: CalendarItem<TMeta>;
  day: CalendarDayData<TMeta>;
  layout?: CalendarItemLayout;
};

export type CalendarItemRenderer<
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> = ComponentType<CalendarItemRendererProps<TMeta>>;

export type CalendarFilter<TMeta extends Record<string, unknown> = Record<string, unknown>> =
  | ((item: CalendarItem<TMeta>) => boolean)
  | { type?: string; metadata?: Partial<TMeta> & Record<string, unknown> };

export type CalendarHighlight =
  | {
      dates?: Date[];
      ranges?: CalendarRange[];
      itemIds?: string[];
      types?: string[];
    }
  | ((day: CalendarDayData) => boolean);

export type CalendarInteractionContext<
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> = {
  date?: Date;
  day?: CalendarDayData<TMeta>;
  item?: CalendarItem<TMeta>;
  metadata?: Record<string, unknown>;
  range?: CalendarRange;
  view: CalendarView;
};

export type CalendarOverflowContext<
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> = CalendarInteractionContext<TMeta> & {
  visibleItems: CalendarItem<TMeta>[];
  hiddenItems: CalendarItem<TMeta>[];
};

export type CalendarSelection = {
  selectedDate: Date | null;
  selectedRange: CalendarRange | null;
  selectedItemId: string | null;
};

export type CalendarLoadStatus = "idle" | "loading" | "error";

export type CalendarActions = {
  previous: () => void;
  next: () => void;
  today: () => void;
  goTo: (date: Date) => void;
  setView: (view: CalendarView) => void;
  selectDate: (date: Date | null) => void;
  selectRange: (range: CalendarRange | null) => void;
  selectItem: (itemId: string | null) => void;
  clearSelection: () => void;
  setFilter: (filter: CalendarFilter | null) => void;
  setHighlight: (highlight: CalendarHighlight | null) => void;
  refresh: (range?: CalendarRange) => Promise<void>;
  preload: (range: CalendarRange) => Promise<void>;
  execute: (
    name: string,
    payload?: Partial<CalendarInteractionContext>
  ) => void;
};

export type CalendarHandle = {
  refresh: (range?: CalendarRange) => Promise<void>;
  preload: (range: CalendarRange) => Promise<void>;
  next: () => void;
  previous: () => void;
  today: () => void;
  goTo: (date: Date) => void;
  setView: (view: CalendarView) => void;
};

export type CalendarProviderConfig = {
  locale?: Locale;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  isDateDisabled?: (date: Date) => boolean;
  itemRenderers?: Record<string, CalendarItemRenderer>;
  metadata?: Record<string, unknown>;
  preloadRange?: CalendarRange;
};
