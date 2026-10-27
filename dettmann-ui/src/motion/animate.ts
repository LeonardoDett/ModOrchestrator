import { isDev } from "../dev/env";
import { readMotion, type MotionValues } from "./read-motion";

export interface AnimateOptions {
  /** Multiplica a duração escolhida (spring ou plana). Padrão 1. */
  durationFactor?: number;
  /** `true` (padrão): duração até o repouso da mola; `false`: `--motion-duration`. A curva é `--motion-ease` (salvo `keyframeEasing`). */
  spring?: boolean;
  /**
   * `true`: a curva do timing é `linear` e valem os `easing` de cada keyframe (ex.: ida `ease-out`,
   * volta com `--motion-ease`, para o overshoot da mola cair sobre o repouso). A duração não muda.
   * Sem efeito sob redução de movimento.
   */
  keyframeEasing?: boolean;
  delay?: number;
  iterations?: number;
  direction?: PlaybackDirection;
  fill?: FillMode;
}

export type KeyframesInput = Keyframe[] | ((m: MotionValues) => Keyframe[]);

/** Duração usada sob redução de movimento (igual ao CSS). */
export const REDUCED_DURATION = 120;

const MOTION_PROPS = new Set(["transform", "translate", "rotate", "scale"]);
const META_PROPS = new Set(["offset", "easing", "composite"]);

/** Remove deslocamento/rotação/escala; descarta quadros que ficaram sem propriedade animada. */
function reduceKeyframes(frames: Keyframe[]): Keyframe[] {
  const out: Keyframe[] = [];
  for (const frame of frames) {
    const kept: Keyframe = {};
    let animated = false;
    for (const [key, value] of Object.entries(frame)) {
      if (MOTION_PROPS.has(key)) continue;
      kept[key] = value;
      if (!META_PROPS.has(key)) animated = true;
    }
    if (animated) out.push(kept);
  }
  return out;
}

/**
 * Wrapper fino de WAAPI que lê o contexto de movimento do elemento (`readMotion`).
 * `keyframes` pode ser função dos `MotionValues` (ex.: escalar deslocamentos por `amp`).
 * Sob redução de movimento: só opacidade/cor (sem `transform/translate/rotate/scale`),
 * 120 ms, curva linear e no máximo 1 iteração. Com `keyframeEasing`, o timing é linear e a curva
 * vem dos keyframes. Sem `el.animate` (jsdom, SSR), ou quando
 * nada sobra para animar, devolve `null`. Keyframes que a WAAPI rejeita lançam em dev e
 * devolvem `null` em produção.
 */
export function animate(el: Element, keyframes: KeyframesInput, opts: AnimateOptions = {}): Animation | null {
  if (typeof (el as Partial<Element>).animate !== "function") return null;
  const m = readMotion(el);
  let frames = typeof keyframes === "function" ? keyframes(m) : keyframes;
  const timing: KeyframeAnimationOptions = {};
  if (m.reduced) {
    frames = reduceKeyframes(frames);
    if (frames.length === 0) return null;
    timing.duration = REDUCED_DURATION;
    timing.easing = "linear";
  } else {
    const base = opts.spring === false ? m.duration : m.springDuration;
    timing.duration = base * (opts.durationFactor ?? 1);
    timing.easing = opts.keyframeEasing ? "linear" : m.ease;
  }
  if (opts.delay !== undefined) timing.delay = opts.delay;
  if (opts.iterations !== undefined) timing.iterations = m.reduced ? Math.min(opts.iterations, 1) : opts.iterations;
  if (opts.direction !== undefined) timing.direction = opts.direction;
  if (opts.fill !== undefined) timing.fill = opts.fill;
  try {
    return el.animate(frames, timing);
  } catch (error) {
    // Keyframes inválidos são erro do chamador: visível em dev, no-op em produção.
    if (isDev()) throw error;
    return null;
  }
}
