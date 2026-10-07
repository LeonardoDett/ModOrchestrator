import { MOTION_DEFAULTS, springToLinear } from "../theme/engine";

/** Valores de movimento efetivos num elemento, lidos das `--motion-*` computadas. */
export interface MotionValues {
  /** Curva da mola (`linear(...)`) do nível efetivo. */
  ease: string;
  /** ms, para transições não-spring (cor, opacidade). */
  duration: number;
  /** ms até o repouso da mola. */
  springDuration: number;
  /** Multiplicador de gestos (deslocamento, rotação, escala). */
  amp: number;
  /** Escala no press. */
  press: number;
  /** ms entre itens de uma lista. */
  stagger: number;
  /** `prefers-reduced-motion: reduce` ou `:root[data-reduce-motion="true"]`. */
  reduced: boolean;
}

let calmFallback: Omit<MotionValues, "reduced"> | undefined;

function fallback(): Omit<MotionValues, "reduced"> {
  if (!calmFallback) {
    const calm = MOTION_DEFAULTS.calm;
    const spring = springToLinear(calm);
    calmFallback = {
      ease: spring.easing,
      duration: calm.duration,
      springDuration: spring.duration,
      amp: calm.amplitude,
      press: calm.pressScale,
      stagger: calm.stagger,
    };
  }
  return calmFallback;
}

/** `"160ms"`, `"0.16s"` ou `"160"` → ms; vazio ou inválido → `undefined`. */
function parseTime(raw: string): number | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return undefined;
  return /[^m]s$/.test(s) ? n * 1000 : n;
}

function parseNumber(raw: string): number | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Redução de movimento do sistema ou do app; sem `window`/`matchMedia` conta como não reduzido. */
export function prefersReducedMotion(el?: Element): boolean {
  const doc = el?.ownerDocument ?? (typeof document !== "undefined" ? document : undefined);
  if (doc?.documentElement.getAttribute("data-reduce-motion") === "true") return true;
  const win = doc?.defaultView ?? (typeof window !== "undefined" ? window : undefined);
  try {
    return typeof win?.matchMedia === "function" && win.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Lê as `--motion-*` computadas em `el` (o contexto que `data-motion`/`MotionScope` emitem).
 * Valores ausentes (jsdom, elemento fora do documento, SSR) caem para `MOTION_DEFAULTS.calm`.
 */
export function readMotion(el: Element): MotionValues {
  const base = fallback();
  const reduced = prefersReducedMotion(el);
  const win = el.ownerDocument?.defaultView;
  let style: CSSStyleDeclaration | undefined;
  try {
    style = win?.getComputedStyle(el);
  } catch {
    style = undefined;
  }
  if (!style) return { ...base, reduced };
  const get = (name: string) => style!.getPropertyValue(`--motion-${name}`);
  return {
    ease: get("ease").trim() || base.ease,
    duration: parseTime(get("duration")) ?? base.duration,
    springDuration: parseTime(get("spring-duration")) ?? base.springDuration,
    amp: parseNumber(get("amp")) ?? base.amp,
    press: parseNumber(get("press")) ?? base.press,
    stagger: parseTime(get("stagger")) ?? base.stagger,
    reduced,
  };
}
