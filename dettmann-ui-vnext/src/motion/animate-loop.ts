import { isDev } from "../dev/env";
import type { KeyframesInput } from "./animate";
import { readMotion } from "./read-motion";

export interface LoopOptions {
  /** ms de um ciclo completo (dado da técnica, não do tema). */
  period: number;
  delay?: number;
  /** `"linear"` (padrão) ou `"spring"` (curva `--motion-ease` do contexto). */
  easing?: "linear" | "spring";
}

/** Alternativa de loop sob redução de movimento: pulso lento de opacidade, sem deslocamento. */
export const REDUCED_LOOP = {
  keyframes: [{ opacity: 1 }, { opacity: 0.5 }, { opacity: 1 }] as Keyframe[],
  duration: 2000 as const,
};

/**
 * Loop infinito em WAAPI para estados contínuos (spinner, carregando). `keyframes` pode ser função
 * dos `MotionValues`. Sob redução de movimento ignora os keyframes e usa `REDUCED_LOOP`. Sem
 * `el.animate` devolve `null`; `period <= 0` ou keyframes inválidos lançam em dev e devolvem `null` em produção.
 */
export function animateLoop(el: Element, keyframes: KeyframesInput, opts: LoopOptions): Animation | null {
  if (typeof (el as Partial<Element>).animate !== "function") return null;
  if (!(opts.period > 0)) {
    if (isDev()) throw new Error(`animateLoop: period deve ser > 0 (recebido ${opts.period}).`);
    return null;
  }
  const m = readMotion(el);
  const timing: KeyframeAnimationOptions = { iterations: Infinity };
  let frames: Keyframe[];
  if (m.reduced) {
    frames = REDUCED_LOOP.keyframes;
    timing.duration = REDUCED_LOOP.duration;
    timing.easing = "ease-in-out";
  } else {
    frames = typeof keyframes === "function" ? keyframes(m) : keyframes;
    timing.duration = opts.period;
    timing.easing = opts.easing === "spring" ? m.ease : "linear";
  }
  if (opts.delay !== undefined) timing.delay = opts.delay;
  try {
    return el.animate(frames, timing);
  } catch (error) {
    if (isDev()) throw error;
    return null;
  }
}
