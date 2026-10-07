import { deltaEOK, wcagContrast } from "./color/contrast";
import { clampChroma } from "./color/convert";
import { CONTRAST_TARGETS, snap, solveLightness, targetMetric, type ContrastTarget } from "./solve";
import type { ColorIntent, Mode, NormalizedConfig, Oklch } from "./types";

export const COLOR_INTENTS: readonly ColorIntent[] = ["brand", "accent", "info", "success", "warning", "danger"];
export type StatusIntent = Exclude<ColorIntent, "brand" | "accent">;
export const STATUS_HUES: Record<StatusIntent, number> = { info: 250, success: 150, warning: 75, danger: 27 };

/** Distância perceptual mínima entre o fill da marca e o de cada status. */
export const MIN_STATUS_DELTA_E = 0.08;
const ROTATION_STEP = 10;
const ROTATION_MAX = 40;
const CHROMA_STEP = 0.02;
const STATUS_MIN_C = 0.06;
const STATUS_MAX_C = 0.19;
/** Faixa da luminosidade-base dos status: marca preta/branca não pode gerar status preto/branco. */
const STATUS_MIN_L = 0.45;
const STATUS_MAX_L = 0.85;
const WARNING_LIGHT_MIN_L = 0.72;
/** Teto do warning no light: cúspide do gamut no matiz 75° (acima dela a croma máxima despenca). */
const WARNING_LIGHT_MAX_L = 0.8;
/** Piso de croma do warning (limitado ao gamut): com marca pouco saturada ele sairia "mostarda barrenta". */
const WARNING_MIN_C = 0.15;
/** Deslocamentos de luminosidade-base tentados em cada matiz do giro de status. */
const L_OFFSETS = [0, -0.05, 0.05, -0.1, 0.1];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Diferença angular com sinal, em (-180, 180]. */
export const hueDelta = (from: number, to: number): number => ((((to - from) % 360) + 540) % 360) - 180;

/** Interpolação circular de matiz. */
export const mixHue = (from: number, to: number, t: number): number => (from + hueDelta(from, to) * t + 360) % 360;

/** Matiz e croma dos cinzas: matiz da marca, deslocado por `neutral`; croma 0 para marca acromática. */
export function neutralTone(config: NormalizedConfig): { h: number; c: number } {
  const { brand, neutral, vibrance } = config;
  if (brand.c === 0) return { h: 0, c: 0 };
  const h = neutral === "cool" ? mixHue(brand.h, 250, 0.5) : neutral === "warm" ? mixHue(brand.h, 70, 0.5) : brand.h;
  const base = neutral === "neutral" ? 0.006 : 0.012;
  return { h, c: Math.min(base * (0.5 + vibrance), 0.03) };
}

export interface IntentColors {
  fill: Oklch;
  hover: Oklch;
  pressed: Oklch;
  on: Oklch;
  subtle: Oklch;
  text: Oklch;
  border: Oklch;
}

/** Faixa de luminosidade dos fills no dark. */
const DARK_FILL_L: [number, number] = [0.65, 0.82];
const STATE_STEPS: Record<Mode, [number, number]> = { light: [-0.05, -0.09], dark: [0.05, 0.09] };
/** ΔL mínimo entre hover/pressed e o fill, e entre si, após quantização. */
const MIN_STATE_DL = 0.03;
/** Razão WCAG mínima entre estados: perto do preto, ΔL em OKLab sozinho não garante diferença visível. */
const MIN_STATE_RATIO = 1.12;
/** Distância mínima (ΔE OKLab) entre um fill e canvas/surface. */
export const MIN_SURFACE_DELTA_E = 0.08;

/**
 * fill, hover e pressed. Os passos seguem o modo (light escurece, dark clareia); quando o
 * pressed bateria no limite de L, os dois passos invertem. Medido nas cores quantizadas,
 * cada estado precisa diferir do anterior em ΔL >= 0.03 e razão WCAG >= 1.12; senão o passo
 * cresce (e, sem espaço, a direção inverte).
 */
export function fillStates(fill: Oklch, mode: Mode): [Oklch, Oklch, Oklch] {
  const [h, p] = STATE_STEPS[mode];
  const step = (from: Oklch, delta: number) => {
    let c = from;
    for (let d = delta; Math.abs(d) <= 1; d += Math.sign(d) * 0.01) {
      c = snap({ ...fill, l: clamp(from.l + d, 0, 1) });
      if (Math.abs(c.l - from.l) >= MIN_STATE_DL && wcagContrast(c, from) >= MIN_STATE_RATIO) return { c, ok: true };
    }
    return { c, ok: false };
  };
  const build = (dir: number) => {
    const hover = step(fill, dir * h);
    const pressed = step(hover.c, dir * (p - h));
    return { states: [fill, hover.c, pressed.c] as [Oklch, Oklch, Oklch], ok: hover.ok && pressed.ok };
  };
  const preferred = fill.l + p < 0 || fill.l + p > 1 ? -1 : 1;
  const first = build(preferred);
  return first.ok ? first.states : build(-preferred).states;
}

/** Quase-branco e quase-preto tingidos no matiz da semente. */
function onCandidates(seed: Oklch): { white: Oklch; black: Oklch } {
  const c = seed.c === 0 ? 0 : 0.01;
  return { white: snap({ l: 0.99, c, h: seed.h }), black: snap({ l: 0.18, c, h: seed.h }) };
}

/**
 * Fill sólido + estados + `on`. O `on` precisa atingir a meta sobre fill, hover e pressed.
 * 1. Light: parte da semente; dark: L clampada em [.65, .82].
 * 2. Se o fill estiver a menos de ΔE 0.08 de algum dos `surfaces`, afasta-se deles em L
 *    (escurece no light, clareia no dark).
 * 3. Se nenhum `on` atinge a meta: light escurece rumo ao quase-branco; dark clareia rumo
 *    ao quase-preto. `darkOn` (warning no light) clareia rumo ao quase-preto, o que
 *    preserva o piso de L.
 * O `on` final é o candidato com maior contraste.
 */
export function solveFill(
  seed: Oklch,
  mode: Mode,
  target: ContrastTarget,
  surfaces: Oklch[] = [],
  darkOn = false,
): Pick<IntentColors, "fill" | "hover" | "pressed" | "on"> {
  const light = mode === "light";
  const metric = targetMetric(target);
  const worst = (fill: Oklch, on: Oklch) => Math.min(...fillStates(fill, mode).map((s) => metric(on, s)));
  const { white, black } = onCandidates(seed);
  const initial = snap(light ? seed : { ...seed, l: clamp(seed.l, DARK_FILL_L[0], DARK_FILL_L[1]) });
  const start = solveLightness(initial, surfaces, MIN_SURFACE_DELTA_E, light ? "darker" : "lighter", deltaEOK).color;

  let fill = start;
  if (Math.max(worst(start, white), worst(start, black)) < 1) {
    if (!light || darkOn) {
      // clarear nunca viola o piso de L do warning; o quase-preto sempre passa perto de L 1
      fill = solveLightness(start, [black], 1, "lighter", worst).color;
    } else fill = solveLightness(start, [white], 1, "darker", worst).color;
  }
  const [f, hover, pressed] = fillStates(fill, mode);
  const on = worst(fill, white) >= worst(fill, black) ? white : black;
  return { fill: f, hover, pressed, on };
}

/**
 * Papéis completos de um intent a partir da semente. `surfaces` = canvas e surface já
 * resolvidos; `darkOn` resolve o fill no light rumo ao quase-preto (warning).
 */
export function intentColors(
  seed: Oklch,
  config: NormalizedConfig,
  mode: Mode,
  surfaces: Oklch[],
  darkOn = false,
): IntentColors {
  const targets = CONTRAST_TARGETS[config.contrast];
  const light = mode === "light";
  const { fill, hover, pressed, on } = solveFill(seed, mode, targets["on-fill"], surfaces, darkOn);
  const subtle = snap({ l: light ? 0.96 : 0.27, c: subtleChroma(seed, config.vibrance), h: seed.h });
  const text = solveLightness(
    { l: fill.l, c: seed.c, h: seed.h },
    [subtle, ...surfaces],
    1,
    light ? "darker" : "lighter",
    targetMetric(targets["intent-text"]),
  ).color;
  const border = snap({ l: light ? 0.82 : 0.45, c: seed.c * 0.5, h: seed.h });
  return { fill, hover, pressed, on, subtle, text, border };
}

export function subtleChroma(seed: Oklch, vibrance: number): number {
  return Math.min(seed.c * 0.25, 0.05) * (0.5 + vibrance);
}

/**
 * Semente inicial de um status: matiz semântico, croma e luminosidade derivadas da marca.
 * O warning tem croma mínima 0.15 (limitada ao gamut) e, no light, L em [.72, .80].
 */
export function statusSeed(status: StatusIntent, brand: Oklch, mode: Mode): Oklch {
  // no dark a faixa do fill já vale aqui, para que os deslocamentos de L do giro tenham efeito
  const base = mode === "dark" ? clamp(brand.l, DARK_FILL_L[0], DARK_FILL_L[1]) : clamp(brand.l, STATUS_MIN_L, STATUS_MAX_L);
  const l = status === "warning" && mode === "light" ? clamp(base, WARNING_LIGHT_MIN_L, WARNING_LIGHT_MAX_L) : base;
  const h = STATUS_HUES[status];
  const c = clamp(brand.c, STATUS_MIN_C, STATUS_MAX_C);
  if (status !== "warning") return { l, c, h };
  return { l, c: Math.max(c, clampChroma({ l, c: WARNING_MIN_C, h }).c), h };
}

/**
 * Sementes e papéis de todos os intents de cor. Status perto demais da marca
 * (ΔE OKLab < 0.08 entre fills) giram o matiz em passos de 10° até ±40° (primeiro para
 * longe da marca), usando o menor giro que resolve; em cada giro a luminosidade-base pode
 * andar ±0.05/±0.1 e a croma subir em passos de 0.02 até 0.19. Se nada resolver, fica o
 * melhor e um aviso.
 */
export function buildIntents(
  config: NormalizedConfig,
  mode: Mode,
  surfaces: Oklch[],
  minDelta = MIN_STATUS_DELTA_E,
): { intents: Record<ColorIntent, IntentColors>; warnings: string[] } {
  const warnings: string[] = [];
  const brand = intentColors(config.brand, config, mode, surfaces);
  const intents = { brand, accent: intentColors(config.accent, config, mode, surfaces) } as Record<ColorIntent, IntentColors>;
  for (const status of Object.keys(STATUS_HUES) as StatusIntent[]) {
    const seed = statusSeed(status, config.brand, mode);
    // warning no light fica em L [.72, .80] e resolve o fill rumo ao `on` escuro
    const warningLight = status === "warning" && mode === "light";
    const targets = CONTRAST_TARGETS[config.contrast];
    // a busca só precisa do fill; os demais papéis saem uma vez, da semente escolhida
    const attempt = (h: number, c: number, l: number) => {
      const candidate = { l: warningLight ? clamp(l, WARNING_LIGHT_MIN_L, WARNING_LIGHT_MAX_L) : l, c, h };
      const { fill } = solveFill(candidate, mode, targets["on-fill"], surfaces, warningLight);
      return { seed: candidate, delta: deltaEOK(brand.fill, fill) };
    };
    // menor giro de matiz possível (primeiro para longe da marca, depois para o outro lado);
    // em cada matiz, a luminosidade-base pode andar ±0.05/±0.1 e a croma subir até 0.19 —
    // o gamut às vezes limita a croma e a meta do `on` força fills à mesma luminância
    let best = attempt(seed.h, seed.c, seed.l);
    const away = hueDelta(config.brand.h, seed.h) >= 0 ? 1 : -1;
    const hues = [seed.h];
    for (let step = ROTATION_STEP; step <= ROTATION_MAX; step += ROTATION_STEP)
      hues.push((seed.h + away * step + 360) % 360, (seed.h - away * step + 360) % 360);
    search: for (const h of hues)
      for (const dl of L_OFFSETS)
        for (let c = seed.c; c <= STATUS_MAX_C + 1e-9; c += CHROMA_STEP) {
          if (best.delta >= minDelta) break search;
          if (h === seed.h && dl === 0 && c === seed.c) continue;
          const next = attempt(h, c, clamp(seed.l + dl, 0, 1));
          if (next.delta > best.delta) best = next;
        }
    if (best.delta < minDelta)
      warnings.push(
        `${status}-fill is too close to brand-fill in ${mode} mode (ΔE ${best.delta.toFixed(3)} < ${minDelta})`,
      );
    intents[status] = intentColors(best.seed, config, mode, surfaces, warningLight);
  }
  return { intents, warnings };
}
