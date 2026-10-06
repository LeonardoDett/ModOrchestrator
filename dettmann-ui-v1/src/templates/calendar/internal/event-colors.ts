import { defineRecipe } from "../../../core/recipe";
import type { CalendarItem } from "../types";
import { toneData, type Tone } from "../../../theme/tone";

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
  "bg-tone-subtle text-tone-text border border-tone-border hover:bg-tone-subtle-hover";
const eventMuted = "border border-border bg-muted text-fg-muted hover:bg-hover";

export function eventTone(color: CalendarEventColor): Tone | undefined {
  return color === "muted" ? undefined : color;
}

export function eventToneProps(color: CalendarEventColor) {
  return toneData(eventTone(color));
}

export const monthEventVariants = defineRecipe({
  base: "flex w-full items-center justify-between gap-2 truncate rounded-md px-1.5 py-0.5 text-left text-xs font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  variants: {
    color: {
      primary: eventSoft,
      danger: eventSoft,
      success: eventSoft,
      warning: eventSoft,
      muted: eventMuted,
    },
    isSelected: {
      true: "ring-1 ring-secondary-border",
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
    "flex h-full min-h-0 w-full flex-col rounded-md px-1.5 py-1 text-left text-xs",
    "transition-colors duration-fast shadow-sm",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
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
      true: "ring-2 ring-secondary-border",
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
      primary: "bg-tone",
      danger: "bg-tone",
      success: "bg-tone",
      warning: "bg-tone",
      muted: "bg-fg-subtle",
    },
  },
  defaultVariants: { color: "primary" },
});
