import type { Intent, StatusToggleState } from "dettmann-ui";
import type { Category, ModRow } from "../../bridge/types";
import type { Translator } from "../../i18n/i18n";

/**
 * Presentation helpers of the Mods screen. They translate backend facts
 * into labels; none of them decides anything (anti-pattern 1).
 */

/** Toggle state of a row: installing/queued rows are busy, imported rows cannot be enabled. */
export function toggleState(row: ModRow): StatusToggleState {
  if (row.state === "installing" || row.queued) return "busy";
  if (row.state !== "installed") return "unavailable";
  return row.enabled ? "on" : "off";
}

export function toggleLabels(i18n: Translator): Record<StatusToggleState, string> {
  return {
    on: i18n.t("mods.status.enabled"),
    off: i18n.t("mods.status.disabled"),
    unavailable: i18n.t("mods.status.notInstalled"),
    busy: i18n.t("mods.status.installing"),
  };
}

/** Status filter values (ui/telas/mods.md §5.1). */
export type StatusFilter = "all" | "enabled" | "disabled" | "notInstalled";

export function matchesStatus(row: ModRow, filter: StatusFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "enabled":
      return row.state === "installed" && row.enabled;
    case "disabled":
      return row.state === "installed" && !row.enabled;
    case "notInstalled":
      return row.state !== "installed";
  }
}

/** Content flags are declared by adapters; unknown ones show their id. */
export function contentLabel(i18n: Translator, flag: string): string {
  const key = `mods.content.${flag}`;
  return i18n.has(key) ? i18n.t(key) : flag;
}

export function installerLabel(i18n: Translator, id: string): string {
  const key = `mods.installer.${id}`;
  return i18n.has(key) ? i18n.t(key) : id;
}

const UNITS = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;

/** Human size with the language's number format (1.2 GB). */
export function formatSize(language: string, bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  // "1.000 bytes" does not fit the Tamanho column (board: "4 MB", "1,2 GB"): bytes use "B".
  if (unit === 0) return `${new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value)} B`;
  return new Intl.NumberFormat(language, {
    style: "unit",
    unit: UNITS[unit],
    unitDisplay: "short",
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}

/** Category options with their full path, for selects. */
export function categoryOptions(categories: readonly Category[]): { value: string; label: string }[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const path = (c: Category): string => {
    const parent = c.parent ? byId.get(c.parent) : undefined;
    return parent ? `${path(parent)} › ${c.name}` : c.name;
  };
  return categories.map((c) => ({ value: c.id, label: path(c) })).sort((a, b) => a.label.localeCompare(b.label));
}

/** Category shown in the table: the full path, or only the last level (ui.hideTopLevelCategory). */
export function categoryText(row: ModRow, lastOnly: boolean): string {
  if (row.categoryPath.length === 0) return "";
  return lastOnly ? row.categoryPath[row.categoryPath.length - 1]! : row.categoryPath.join(" › ");
}

/**
 * Highlight colours of mods and separators are intents of the theme
 * palette (ui/04 §2). Values saved before the dettmann-ui v2 migration use
 * the v1 tone names; they are read as the intent that replaced them
 * (primary → brand, secondary → neutral) and saved with the new name the
 * next time the user edits them.
 */
export const HIGHLIGHTS = ["brand", "neutral", "accent", "info", "success", "warning", "danger"] as const satisfies readonly Intent[];

const LEGACY_HIGHLIGHT: Record<string, Intent> = { primary: "brand", secondary: "neutral" };

export function highlightIntent(value?: string): Intent | undefined {
  if (!value) return undefined;
  if (value in LEGACY_HIGHLIGHT) return LEGACY_HIGHLIGHT[value];
  return (HIGHLIGHTS as readonly string[]).includes(value) ? (value as Intent) : undefined;
}

export function highlightOptions(i18n: Translator): { value: string; label: string }[] {
  return [{ value: "", label: i18n.t("mods.highlight.none") }, ...HIGHLIGHTS.map((h) => ({ value: h, label: i18n.t(`mods.highlight.${h}`) }))];
}
