"use client";

import { createStrictContext } from "../../utils/create-strict-context";
import type { ReactNode } from "react";
import type { CalendarItemRenderer, CalendarInteractionContext, CalendarItem } from "./types";
import type { Locale } from "date-fns";
import type { CalendarLabels } from "./internal/labels";

export type CalendarConfigContextValue = {
  locale: Locale;
  labels: CalendarLabels;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  itemRenderers?: Record<string, CalendarItemRenderer>;
  isDateDisabled?: (date: Date) => boolean;
  onDateClick?: (ctx: CalendarInteractionContext) => void;
  onDateDoubleClick?: (ctx: CalendarInteractionContext) => void;
  onItemClick?: (ctx: CalendarInteractionContext) => void;
  onItemDoubleClick?: (ctx: CalendarInteractionContext) => void;
  onOverflowClick?: (
    ctx: CalendarInteractionContext & { visibleItems: CalendarItem[]; hiddenItems: CalendarItem[] }
  ) => void;
  onSearchClick?: () => void;
  onAddEvent?: () => void;
  headerStart?: ReactNode;
  headerEnd?: ReactNode;
};

export const [CalendarConfigProvider, useCalendarConfig] = createStrictContext<CalendarConfigContextValue>(
  "Calendar",
  "Calendar.Provider"
);
