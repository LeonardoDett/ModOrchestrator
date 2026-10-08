import type { AnimateOptions, MotionValues } from "../motion";

export type IconMode = "action" | "loop";

export type TechniqueKind =
  | "squash"
  | "lift"
  | "nudge"
  | "rotate"
  | "spin"
  | "draw"
  | "undraw"
  | "flip"
  | "trail"
  | "pulse";

/** Limite geométrico da técnica a `amp` = 1 (unidades do viewBox, graus, desvio de escala). */
export interface Extent {
  translate: number;
  rotate: number;
  scale: number;
}

/** Resultado de uma técnica para um disparo: o runner executa com `animate()` (action) ou `animateLoop()` (loop). */
export interface TechniqueRun {
  keyframes: Keyframe[];
  /** Só action. */
  options?: Pick<AnimateOptions, "durationFactor" | "spring">;
  /** Obrigatório em loop (ms de um ciclo). */
  period?: number;
  /** Só loop. */
  easing?: "linear" | "spring";
  /** Só action; ausente = deixar `animate()` filtrar movimento. */
  reduced?: Keyframe[];
}

export interface TechniqueContext {
  mode: IconMode;
  /** Posição no stagger (0 sem stagger). */
  index: number;
}

export interface Technique {
  readonly kind: TechniqueKind;
  readonly modes: readonly IconMode[];
  readonly extent: Extent;
  /** Isenta do limite geométrico (spin, flip). */
  readonly exempt?: boolean;
  /** ms; o delay não passa por `TechniqueRun`: o runner calcula `delay = t.delay + ctx.index * m.stagger`. */
  readonly delay: number;
  /**
   * Posição no stagger, definida por `stagger()` (cópia da técnica por parte). O runner usa
   * `t.index ?? 0` como `ctx.index` e soma `index * m.stagger` ao delay.
   */
  readonly index?: number;
  run(m: MotionValues, ctx: TechniqueContext): TechniqueRun;
}

/** Chave `"root"` = ícone inteiro; as demais são ids de partes do glifo. */
export type Choreography = Partial<Record<string, Technique | readonly Technique[]>>;
