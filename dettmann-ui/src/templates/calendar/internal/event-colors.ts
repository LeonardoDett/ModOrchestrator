import { defineRecipe } from "../../../core/recipe";
import type { CalendarItem } from "../types";
import { intentData } from "../../../theme/emphasis";
import type { Intent } from "../../../theme/engine";

/** Famílias de cor alinhadas à paleta Untitled UI (blue, pink, green, orange, gray). */
export type CalendarEventColor = "primary" | "danger" | "success" | "warning" | "muted";

const EVENT_COLOR_ALIASES: Record<string, CalendarEventColor> = {
  primary: "primary",
  blue: "primary",
  info: "primary",
  danger: "danger",
  pink: "danger",
  magenta: "danger",
  success: "success",
  green: "success",
  warning: "warning",
  orange: "warning",
  muted: "muted",
  gray: "muted",
  grey: "muted",
};

const HASH_PALETTE: CalendarEventColor[] = [
  "primary",
  "danger",
  "success",
  "warning",
  "muted",
];

export function hashEventColor(type: string): CalendarEventColor {
  let hash = 0;
  for (let i = 0; i < type.length; i++) {
    hash = type.charCodeAt(i) + ((hash << 5) - hash);
  }
  return HASH_PALETTE[Math.abs(hash) % HASH_PALETTE.length]!;
}

export function resolveEventColor(item: CalendarItem): CalendarEventColor {
  const metaColor = item.metadata?.color;
  if (typeof metaColor === "string") {
    const key = metaColor.toLowerCase();
    if (key in EVENT_COLOR_ALIASES) {
      return EVENT_COLOR_ALIASES[key]!;
    }
  }
  return hashEventColor(item.type);
}

const eventSoft =
  "bg-intent-subtle text-intent-text border border-intent-border hover:state-layer-hover";
const eventMuted = "border border-border bg-sunken text-fg-muted hover:state-layer-hover";

export function eventIntent(color: CalendarEventColor): Intent | undefined {
  return color === "muted" ? undefined : color === "primary" ? "brand" : color;
}

export function eventIntentProps(color: CalendarEventColor) {
  return intentData(eventIntent(color));
}

export const monthEventVariants = defineRecipe({
  base: "flex w-full items-center justify-between gap-2 truncate rounded-control px-1.5 py-0.5 text-left text-xs font-medium motion-transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus",
  variants: {
    color: {
      primary: eventSoft,
      danger: eventSoft,
      success: eventSoft,
      warning: eventSoft,
      muted: eventMuted,
    },
    isSelected: {
      true: "ring-1 ring-focus",
      false: "",
    },
    isHighlighted: {
      true: "ring-1 ring-warning-border",
      false: "",
    },
  },
  defaultVariants: { color: "primary", isSelected: false, isHighlighted: false },
});

export const timedEventVariants = defineRecipe({
  base: [
    "flex h-full min-h-0 w-full flex-col rounded-control px-1.5 py-1 text-left text-xs",
    "motion-transition shadow-raised",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus",
  ].join(" "),
  variants: {
    color: {
      primary: eventSoft,
      danger: eventSoft,
      success: eventSoft,
      warning: eventSoft,
      muted: eventMuted,
    },
    isSelected: {
      true: "ring-2 ring-focus",
      false: "",
    },
    isHighlighted: {
      true: "ring-2 ring-warning-border",
      false: "",
    },
  },
  defaultVariants: { color: "primary", isSelected: false, isHighlighted: false },
});

export const yearEventDotVariants = defineRecipe({
  base: "size-1 rounded-full",
  variants: {
    color: {
      primary: "bg-intent-fill",
      danger: "bg-intent-fill",
      success: "bg-intent-fill",
      warning: "bg-intent-fill",
      muted: "bg-fg-subtle",
    },
  },
  defaultVariants: { color: "primary" },
});
