/** Explicit semantic color family used by runtime theme overrides. */
export interface ThemeColorFamily {
  base: string;
  hover: string;
  pressed: string;
  on: string;
  subtle: string;
  subtleHover: string;
  border: string;
  text: string;
}

/** Runtime visual overrides. Values are CSS colors, never hue/chroma instructions. */
export interface ThemeInputGroup {
  canvas?: string;
  surface?: string;
  raised?: string;
  sunken?: string;
  structure?: string;
  structureRaised?: string;
  fg?: string;
  fgSecondary?: string;
  fgTertiary?: string;
  border?: string;
  borderStrong?: string;
  focus?: string;
  brand?: ThemeColorFamily;
  secondary?: ThemeColorFamily;
  accent?: ThemeColorFamily;
  info?: ThemeColorFamily;
  success?: ThemeColorFamily;
  warning?: ThemeColorFamily;
  danger?: ThemeColorFamily;
  overlay?: string;
}

export interface ThemeInputs {
  light?: ThemeInputGroup;
  dark?: ThemeInputGroup;
}

const familyProperties: Record<keyof ThemeColorFamily, string> = {
  base: "",
  hover: "-hover",
  pressed: "-pressed",
  on: "",
  subtle: "-subtle",
  subtleHover: "-subtle-hover",
  border: "-border",
  text: "-text",
};

const scalarProperties: Record<"canvas" | "surface" | "raised" | "sunken" | "structure" | "structureRaised" | "fg" | "fgSecondary" | "fgTertiary" | "border" | "borderStrong" | "focus" | "overlay", string> = {
  canvas: "canvas",
  surface: "surface",
  raised: "raised",
  sunken: "sunken",
  structure: "structure",
  structureRaised: "structure-raised",
  fg: "fg",
  fgSecondary: "fg-secondary",
  fgTertiary: "fg-tertiary",
  border: "border",
  borderStrong: "border-strong",
  focus: "focus",
  overlay: "overlay",
};

const familyNames = new Set<keyof ThemeInputGroup>([
  "brand",
  "secondary",
  "accent",
  "info",
  "success",
  "warning",
  "danger",
]);

export function inputsToStyle(
  inputs?: ThemeInputs,
  mode: "light" | "dark" = "light",
): Record<string, string> | undefined {
  const group = inputs?.[mode];
  if (!group) return undefined;

  const style: Record<string, string> = {};

  for (const [key, value] of Object.entries(group) as [keyof ThemeInputGroup, ThemeInputGroup[keyof ThemeInputGroup]][]) {
    if (value == null) continue;

    if (familyNames.has(key)) {
      const family = value as ThemeColorFamily;
      const prefix = key === "brand" ? "brand" : key;
      for (const [property, suffix] of Object.entries(familyProperties) as [keyof ThemeColorFamily, string][]) {
        const familyValue = family[property];
        if (familyValue) style[property === "on" ? `--ui-on-${prefix}` : `--ui-${prefix}${suffix}`] = familyValue;
      }
      continue;
    }

    const cssName = scalarProperties[key as keyof typeof scalarProperties];
    if (cssName && typeof value === "string") style[`--ui-${cssName}`] = value;
  }

  return Object.keys(style).length ? style : undefined;
}

export function applyInputs(
  inputs: ThemeInputs,
  el: HTMLElement = document.documentElement,
  mode: "light" | "dark" = "light",
): void {
  const style = inputsToStyle(inputs, mode);
  if (!style) return;
  for (const [name, value] of Object.entries(style)) el.style.setProperty(name, value);
}

export function resetInputs(el: HTMLElement = document.documentElement): void {
  const names = [
    "canvas",
    "surface",
    "raised",
    "sunken",
    "structure",
    "structure-raised",
    "fg",
    "fg-secondary",
    "fg-tertiary",
    "border",
    "border-strong",
    "focus",
    "overlay",
    "brand",
    "brand-hover",
    "brand-pressed",
    "on-brand",
    "brand-subtle",
    "brand-subtle-hover",
    "brand-border",
    "brand-text",
    "secondary",
    "secondary-hover",
    "secondary-pressed",
    "on-secondary",
    "secondary-subtle",
    "secondary-subtle-hover",
    "secondary-border",
    "secondary-text",
    "accent",
    "accent-hover",
    "accent-pressed",
    "on-accent",
    "accent-subtle",
    "accent-subtle-hover",
    "accent-border",
    "accent-text",
    "info",
    "info-hover",
    "info-pressed",
    "on-info",
    "info-subtle",
    "info-subtle-hover",
    "info-border",
    "info-text",
    "success",
    "success-hover",
    "success-pressed",
    "on-success",
    "success-subtle",
    "success-subtle-hover",
    "success-border",
    "success-text",
    "warning",
    "warning-hover",
    "warning-pressed",
    "on-warning",
    "warning-subtle",
    "warning-subtle-hover",
    "warning-border",
    "warning-text",
    "danger",
    "danger-hover",
    "danger-pressed",
    "on-danger",
    "danger-subtle",
    "danger-subtle-hover",
    "danger-border",
    "danger-text",
  ];
  for (const name of names) el.style.removeProperty(`--ui-${name}`);
}
