import { deltaEOK } from "./color/contrast";
import { clampChroma } from "./color/convert";
import { CONTRAST_TARGETS, snap, solveLightness, targetMetric } from "./solve";
import type { Mode, NormalizedConfig, Oklch } from "./types";

/**
 * Paleta categórica: cores sem significado de status, para rotular itens escolhidos pelo
 * usuário (categorias, tags, séries). A ordem é a de exibição no seletor e é estável:
 * vizinhas alternam a luminosidade do `dot`, para não depender só do matiz.
 */
export const CATEGORY_COLORS = [
  "blue",
  "green",
  "amber",
  "coral",
  "pink",
  "violet",
  "teal",
  "gray",
  "cyan",
  "lime",
  "orange",
  "red",
  "indigo",
  "graphite",
  "magenta",
  "olive",
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];
export type CategoryPart = "dot" | "subtle" | "text" | "border";
export type CategoryRole = `category-${CategoryColor}-${CategoryPart}`;

export const CATEGORY_PARTS: readonly CategoryPart[] = ["dot", "subtle", "text", "border"];

/** Matiz e croma-base de cada cor; `gray` e `graphite` são neutros (só diferem em luminosidade). */
const SEEDS: Record<CategoryColor, { h: number; c: number }> = {
  blue: { h: 250, c: 0.14 },
  green: { h: 150, c: 0.14 },
  amber: { h: 80, c: 0.14 },
  coral: { h: 35, c: 0.14 },
  pink: { h: 350, c: 0.13 },
  violet: { h: 300, c: 0.14 },
  teal: { h: 185, c: 0.11 },
  gray: { h: 0, c: 0 },
  cyan: { h: 215, c: 0.12 },
  lime: { h: 125, c: 0.15 },
  orange: { h: 55, c: 0.15 },
  red: { h: 25, c: 0.17 },
  indigo: { h: 275, c: 0.15 },
  graphite: { h: 0, c: 0 },
  magenta: { h: 325, c: 0.16 },
  olive: { h: 105, c: 0.09 },
};

/** Luminosidade do `dot` por posição (par, ímpar) e modo; `graphite` fica sempre no extremo escuro (light) ou claro (dark). */
const DOT_L: Record<Mode, [number, number]> = { light: [0.6, 0.72], dark: [0.74, 0.62] };
const GRAPHITE_DOT_L: Record<Mode, number> = { light: 0.42, dark: 0.86 };

/** Distância mínima (ΔE OKLab) entre o `dot` e canvas/surface, para o ponto não sumir. */
export const MIN_CATEGORY_DOT_DELTA_E = 0.1;

export const categoryRole = (color: CategoryColor, part: CategoryPart): CategoryRole => `category-${color}-${part}`;

/** Todos os papéis categóricos, na ordem de emissão. */
export const CATEGORY_ROLE_NAMES: readonly CategoryRole[] = CATEGORY_COLORS.flatMap((color) =>
  CATEGORY_PARTS.map((part) => categoryRole(color, part)),
);

/**
 * Papéis de uma cor categórica num modo. `surfaces` = canvas e surface já resolvidos.
 * - `dot`: ponto/amostra sólida; ΔE >= 0.1 de canvas e surface.
 * - `subtle`: fundo de selo; mesma luminosidade do subtle dos intents.
 * - `text`: texto sobre `subtle`, `surface` e `canvas`, na meta `intent-text`.
 * - `border`: borda do selo.
 */
export function categoryColors(color: CategoryColor, index: number, config: NormalizedConfig, mode: Mode, surfaces: Oklch[]): Record<CategoryPart, Oklch> {
  const light = mode === "light";
  const { h, c } = SEEDS[color];
  const dotL = color === "graphite" ? GRAPHITE_DOT_L[mode] : DOT_L[mode][(index % 2) as 0 | 1];
  const start = clampChroma({ l: dotL, c, h });
  const dot = solveLightness(start, surfaces, MIN_CATEGORY_DOT_DELTA_E, light ? "darker" : "lighter", deltaEOK).color;
  const subtle = snap(clampChroma({ l: light ? 0.95 : 0.29, c: Math.min(c * 0.35, 0.05), h }));
  const text = solveLightness(
    { l: dot.l, c, h },
    [subtle, ...surfaces],
    1,
    light ? "darker" : "lighter",
    targetMetric(CONTRAST_TARGETS[config.contrast]["intent-text"]),
  ).color;
  const border = snap(clampChroma({ l: light ? 0.8 : 0.46, c: c * 0.6, h }));
  return { dot, subtle, text, border };
}

/** Papéis de todas as cores categóricas num modo. */
export function buildCategories(config: NormalizedConfig, mode: Mode, surfaces: Oklch[]): Record<CategoryRole, Oklch> {
  const out = {} as Record<CategoryRole, Oklch>;
  CATEGORY_COLORS.forEach((color, index) => {
    const parts = categoryColors(color, index, config, mode, surfaces);
    for (const part of CATEGORY_PARTS) out[categoryRole(color, part)] = parts[part];
  });
  return out;
}
