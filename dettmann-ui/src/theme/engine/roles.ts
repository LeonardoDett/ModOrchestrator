import { apcaContrast, wcagContrast } from "./color/contrast";
import { oklchToRgb, parseColor, toHex } from "./color/convert";
import { buildCategories, CATEGORY_COLORS, CATEGORY_ROLE_NAMES, categoryRole } from "./categories";
import { buildIntents, COLOR_INTENTS, neutralTone, subtleChroma } from "./palette";
import { CONTRAST_TARGETS, snap, solveLightness, targetMetric, type ContrastKind } from "./solve";
import type { ColorIntent, ContrastLevel, Mode, NormalizedConfig, Oklch, RoleName } from "./types";

export { CONTRAST_TARGETS, type ContrastKind } from "./solve";

const INTENT_SUFFIXES = ["fill", "fill-hover", "fill-pressed", "subtle", "text", "border"] as const;

/** Todos os papéis L3, na ordem de emissão. */
export const ROLE_NAMES: readonly RoleName[] = [
  "canvas",
  "surface",
  "raised",
  "sunken",
  "fg",
  "fg-muted",
  "fg-subtle",
  "fg-disabled",
  "border",
  "border-subtle",
  "border-strong",
  "structure",
  "structure-fg",
  "structure-border",
  "selected",
  "track",
  "fill-neutral",
  "fill-neutral-hover",
  "emphasis-fill",
  "emphasis-fill-hover",
  "emphasis-fill-pressed",
  "on-emphasis",
  "emphasis-subtle",
  "emphasis-text",
  "emphasis-border",
  "focus",
  ...COLOR_INTENTS.flatMap((x): RoleName[] => [
    `${x}-fill`,
    `${x}-fill-hover`,
    `${x}-fill-pressed`,
    `on-${x}`,
    `${x}-subtle`,
    `${x}-text`,
    `${x}-border`,
  ]),
  ...CATEGORY_ROLE_NAMES,
  "overlay",
];

export interface ContrastPair {
  fg: RoleName;
  bg: RoleName[];
  kind: ContrastKind;
}

const SURFACES: RoleName[] = ["canvas", "surface", "raised", "sunken", "structure"];

/** Pares texto/fundo verificados pelo solver e por `contrastReport`. */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { fg: "fg", bg: SURFACES, kind: "text" },
  { fg: "fg-muted", bg: SURFACES, kind: "text-secondary" },
  { fg: "structure-fg", bg: SURFACES, kind: "text-secondary" },
  { fg: "fg-subtle", bg: ["canvas", "surface"], kind: "text-meta" },
  { fg: "on-emphasis", bg: ["emphasis-fill", "emphasis-fill-hover", "emphasis-fill-pressed"], kind: "on-fill" },
  ...COLOR_INTENTS.flatMap((x): ContrastPair[] => [
    { fg: `on-${x}`, bg: [`${x}-fill`, `${x}-fill-hover`], kind: "on-fill" },
    { fg: `${x}-text`, bg: [`${x}-subtle`, "surface", "canvas"], kind: "intent-text" },
  ]),
  ...CATEGORY_COLORS.map(
    (color): ContrastPair => ({
      fg: categoryRole(color, "text"),
      bg: [categoryRole(color, "subtle"), "surface", "canvas"],
      kind: "intent-text",
    }),
  ),
  { fg: "border-strong", bg: ["surface", "canvas"], kind: "control-border" },
  { fg: "focus", bg: ["canvas", "surface"], kind: "focus" },
];

export interface ContrastResult {
  fg: RoleName;
  bg: RoleName;
  kind: ContrastKind;
  /** Razão WCAG medida. */
  ratio: number;
  /** Meta WCAG. */
  target: number;
  /** Lc APCA medido e meta, quando o par também exige APCA. */
  apca?: number;
  apcaTarget?: number;
  pass: boolean;
}

/** Mede todos os pares de `CONTRAST_PAIRS` em `roles` (valores em hex/CSS); ausente ou inválido reprova. */
export function contrastReport(roles: Record<string, string>, contrast: ContrastLevel): ContrastResult[] {
  const out: ContrastResult[] = [];
  const color = (role: RoleName) => (typeof roles[role] === "string" ? parseColor(roles[role]) : null);
  for (const { fg, bg: bgs, kind } of CONTRAST_PAIRS) {
    const fgColor = color(fg);
    const target = CONTRAST_TARGETS[contrast][kind];
    for (const bg of bgs) {
      const bgColor = color(bg);
      // papel ausente ou que não faz parse reprova (razão 0), nunca é pulado
      if (!fgColor || !bgColor) {
        out.push({ fg, bg, kind, ratio: 0, target: target.wcag, pass: false });
        continue;
      }
      const ratio = wcagContrast(fgColor, bgColor);
      const result: ContrastResult = { fg, bg, kind, ratio, target: target.wcag, pass: ratio >= target.wcag };
      if (target.apca !== undefined) {
        result.apca = apcaContrast(fgColor, bgColor);
        result.apcaTarget = target.apca;
        result.pass = result.pass && result.apca >= target.apca;
      }
      out.push(result);
    }
  }
  return out;
}

/** Soma vetorial em OKLab de um tingimento (croma `c` no matiz `h`) a uma cor. */
function tint(base: Oklch, h: number, c: number): Oklch {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = base.c * Math.cos(rad(base.h)) + c * Math.cos(rad(h));
  const b = base.c * Math.sin(rad(base.h)) + c * Math.sin(rad(h));
  const chroma = Math.hypot(a, b);
  if (chroma < 1e-4) return { l: base.l, c: 0, h: 0 };
  return { l: base.l, c: chroma, h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

const SURFACE_L: Record<Mode, Record<"canvas" | "surface" | "raised" | "sunken" | "structure", number>> = {
  light: { canvas: 0.975, surface: 0.995, raised: 0.995, sunken: 0.955, structure: 0.935 },
  dark: { canvas: 0.19, surface: 0.225, raised: 0.26, sunken: 0.165, structure: 0.155 },
};

/** Gera todos os papéis L3 de um modo. `warnings` lista colisões de status não resolvidas. */
export function buildRoles(config: NormalizedConfig, mode: Mode): { roles: Record<RoleName, string>; warnings: string[] } {
  const targets = CONTRAST_TARGETS[config.contrast];
  const light = mode === "light";
  const dir = light ? "darker" : "lighter";
  const sign = light ? -1 : 1;
  const { brand, vibrance } = config;
  const tone = neutralTone(config);
  const neutral = (l: number): Oklch => ({ l, c: tone.c, h: tone.h });
  const solve = (start: Oklch, against: Oklch[], kind: ContrastKind) =>
    solveLightness(start, against, 1, dir, targetMetric(targets[kind])).color;

  /**
   * Texto secundário/meta: o primeiro valor que atinge a meta andando da superfície em
   * direção ao fg (o L mais próximo das superfícies que passa contra todas elas). Assim
   * fg > fg-muted > fg-subtle em contraste, cada um no mínimo da sua meta.
   */
  const fromSurface = (against: Oklch[], kind: ContrastKind) => {
    const ls = against.map((bg) => bg.l);
    return solve(neutral(light ? Math.max(...ls) : Math.min(...ls)), against, kind);
  };

  const L = SURFACE_L[mode];
  const canvas = snap(neutral(L.canvas));
  const surface = snap(neutral(L.surface));
  const raised = snap(neutral(L.raised));
  const sunken = snap(neutral(L.sunken));
  const structureTone = brand.c === 0 ? neutral(L.structure) : tint(neutral(L.structure), brand.h, 0.02 * vibrance);
  const structure = snap(structureTone);
  const surfaces = [canvas, surface, raised, sunken, structure];

  const { intents, warnings } = buildIntents(config, mode, [surface, canvas]);
  const brandSet = intents.brand;

  const c: Partial<Record<RoleName, Oklch>> = {
    canvas,
    surface,
    raised,
    sunken,
    fg: solve(neutral(light ? 0.22 : 0.95), surfaces, "text"),
    "fg-muted": fromSurface(surfaces, "text-secondary"),
    "fg-subtle": fromSurface([canvas, surface], "text-meta"),
    "fg-disabled": snap(neutral(light ? 0.7 : 0.45)),
    "border-subtle": snap(neutral(surface.l + sign * 0.05)),
    border: snap(neutral(surface.l + sign * 0.09)),
    "border-strong": solve(neutral(surface.l + sign * 0.09), [surface, canvas], "control-border"),
    structure,
    "structure-fg": fromSurface(surfaces, "text-secondary"),
    "structure-border": snap({ ...structureTone, l: structureTone.l + sign * 0.09 }),
    selected: snap({
      l: light ? 0.96 : 0.27,
      c: subtleChroma(brand, vibrance) * (0.3 + 0.7 * vibrance),
      h: brand.h,
    }),
    track: snap(neutral(light ? 0.88 : 0.32)),
    "fill-neutral": snap(neutral(light ? 0.93 : 0.28)),
    "fill-neutral-hover": snap(neutral(light ? 0.9 : 0.31)),
    focus: solve(brandSet.fill, [canvas, surface], "focus"),
  };

  for (const x of COLOR_INTENTS) {
    const set = intents[x as ColorIntent];
    c[`${x}-fill`] = set.fill;
    c[`${x}-fill-hover`] = set.hover;
    c[`${x}-fill-pressed`] = set.pressed;
    c[`on-${x}`] = set.on;
    c[`${x}-subtle`] = set.subtle;
    c[`${x}-text`] = set.text;
    c[`${x}-border`] = set.border;
  }
  Object.assign(c, buildCategories(config, mode, [surface, canvas]));
  for (const suffix of INTENT_SUFFIXES) c[`emphasis-${suffix}`] = c[`brand-${suffix}`];
  c["on-emphasis"] = c["on-brand"];

  const roles = {} as Record<RoleName, string>;
  for (const name of ROLE_NAMES) if (name !== "overlay") roles[name] = toHex(c[name]!);
  const [r, g, b] = oklchToRgb(snap(neutral(0.12))).map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255));
  roles.overlay = `rgb(${r} ${g} ${b} / ${light ? 0.48 : 0.62})`;
  return { roles, warnings };
}
