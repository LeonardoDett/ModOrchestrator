/** Cor em OKLCH: l 0..1, c >= 0, h 0..360 (0 quando acromático). */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** Intensidade de movimento; a ordem de `MOTION_LEVELS` é a ordem de intensidade. */
export type MotionLevel = "calm" | "responsive" | "expressive";

export interface MotionSpec {
  stiffness: number;
  damping: number;
  mass: number;
  /** Duração de transições não-mola, em ms. */
  duration: number;
  amplitude: number;
  pressScale: number;
  /** Atraso entre itens de uma sequência, em ms. */
  stagger: number;
}

export type MotionTune = Partial<Record<MotionLevel, Partial<MotionSpec>>>;

export type Mode = "light" | "dark";
export type Intent = "neutral" | "brand" | "accent" | "info" | "success" | "warning" | "danger";
export type ColorIntent = Exclude<Intent, "neutral">;
export type Emphasis = "low" | "medium" | "high";

export type LowRole =
  | "canvas"
  | "surface"
  | "raised"
  | "sunken"
  | "fg"
  | "fg-muted"
  | "fg-subtle"
  | "fg-disabled"
  | "border"
  | "border-subtle"
  | "border-strong";
export type MediumRole =
  | "structure"
  | "structure-fg"
  | "structure-border"
  | "selected"
  | "track"
  | "fill-neutral"
  | "fill-neutral-hover";
export type HighRole =
  | "emphasis-fill"
  | "emphasis-fill-hover"
  | "emphasis-fill-pressed"
  | "on-emphasis"
  | "emphasis-subtle"
  | "emphasis-text"
  | "emphasis-border"
  | "focus";
export type IntentRole<X extends string = ColorIntent> =
  | `${X}-fill`
  | `${X}-fill-hover`
  | `${X}-fill-pressed`
  | `on-${X}`
  | `${X}-subtle`
  | `${X}-text`
  | `${X}-border`;
/** Papéis da paleta categórica (`category-<cor>-<parte>`, ver `categories.ts`). */
export type CategoryRoleName = import("./categories").CategoryRole;
/** Todos os papéis L3 gerados pelo motor. */
export type RoleName = LowRole | MediumRole | HighRole | IntentRole | CategoryRoleName | "overlay";
export type RoleOverrides = Partial<Record<RoleName, string>>;

export type NeutralTemperature = "cool" | "neutral" | "warm";
export type ContrastLevel = "standard" | "high";
export type Shape = "precise" | "balanced" | "soft";
export type Density = "compact" | "comfortable" | "spacious";

export interface ThemeConfig {
  id: string;
  label: string;
  /** Única semente obrigatória (hex, rgb(), hsl() ou oklch()). */
  brand: string;
  accent?: string;
  neutral?: NeutralTemperature;
  /** 0..1, padrão 0.5. */
  vibrance?: number;
  contrast?: ContrastLevel;
  shape?: Shape;
  density?: Density;
  motion?: MotionLevel | { ceiling: MotionLevel; tune?: MotionTune };
  font?: { sans?: string; mono?: string };
  overrides?: { light?: RoleOverrides; dark?: RoleOverrides };
}

export interface NormalizedConfig {
  id: string;
  label: string;
  brand: Oklch;
  /** Semente do accent; derivada da marca (matiz + 150°) quando ausente. */
  accent: Oklch;
  neutral: NeutralTemperature;
  vibrance: number;
  contrast: ContrastLevel;
  shape: Shape;
  density: Density;
  motion: { ceiling: MotionLevel; tune: MotionTune };
  font: { sans: string; mono: string };
  overrides: { light: RoleOverrides; dark: RoleOverrides };
}
