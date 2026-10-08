import type { ReactNode } from "react";

export interface SelectOption {
  /** Option value */
  value: string;
  /** Option display label (also used for typeahead) */
  label: string;
  /** Whether the option is disabled */
  disabled?: boolean;
  /** Leading icon */
  icon?: ReactNode;
  /** Supporting text under the label */
  description?: ReactNode;
}

export interface SelectGroup {
  /** Group heading */
  label: string;
  options: SelectOption[];
}

export type SelectItem = SelectOption | SelectGroup;

export function isSelectGroup(item: SelectItem): item is SelectGroup {
  return "options" in item;
}

/** Selectable options in visual order (groups flattened). */
export function flattenOptions(items: SelectItem[]): SelectOption[] {
  return items.flatMap((item) => (isSelectGroup(item) ? item.options : [item]));
}

/** Next enabled index from `from` in `step` direction (no wrap); `from` itself if none. */
export function stepEnabled(options: SelectOption[], from: number, step: 1 | -1): number {
  for (let i = from + step; i >= 0 && i < options.length; i += step) {
    if (!options[i]?.disabled) return i;
  }
  return from;
}

export function firstEnabled(options: SelectOption[]): number {
  return stepEnabled(options, -1, 1);
}

export function lastEnabled(options: SelectOption[]): number {
  return stepEnabled(options, options.length, -1);
}

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Typeahead like a native select: finds the first enabled option whose label starts with
 * `query`, searching after `from`. A query of one repeated character cycles through the
 * options starting with that character. Returns -1 when nothing matches.
 */
export function matchTypeahead(options: SelectOption[], query: string, from: number): number {
  if (!query) return -1;
  const q = fold(query);
  const repeated = q.length > 1 && [...q].every((c) => c === q[0]);
  const needle = repeated ? q[0]! : q;
  // A longer query keeps the current match if it still fits; a single/cycling one moves on.
  const start = needle.length > 1 ? from : from + 1;
  for (let k = 0; k < options.length; k++) {
    const i = (((start + k) % options.length) + options.length) % options.length;
    const option = options[i];
    if (option && !option.disabled && fold(option.label).startsWith(needle)) return i;
  }
  return -1;
}
