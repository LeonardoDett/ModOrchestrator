import type { ForwardRefExoticComponent, ReactNode, RefAttributes, SVGProps } from "react";
import type { AnimateOptions, MotionValues } from "../motion";
import type { IconSize } from "../primitives/icon";
import type { Intent } from "../theme/engine";

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

/** Definição de um ícone animado (entrada de `defineIcon`). */
export interface IconDefinition {
  /** kebab-case, único no catálogo. */
  name: string;
  /** Partes do glifo; ordem = ordem de pintura. `"root"` é reservado. */
  parts: Record<string, ReactNode>;
  /** `transform-origin` por parte (padrão `"50% 50%"`). */
  origin?: Record<string, string>;
  /** Gesto disparado (gatilho herdado, `playKey`); ausente = ícone estático. */
  action?: Choreography;
  /** Estado contínuo (prop `loop`). */
  loop?: Choreography;
}

/** Controle imperativo registrado por ícone montado (usado pelo controlador delegado). */
export interface IconHandle {
  /** Toca o `action`, salvo se já está tocando ou se o `loop` está ativo. */
  play(): void;
  isPlaying(): boolean;
}

export interface AnimatedIconProps extends Omit<SVGProps<SVGSVGElement>, "ref" | "children"> {
  /** Mesmo mapa de tamanho e `strokeWidth` do `Icon`. Padrão `md`. */
  size?: IconSize;
  /** Cor semântica: `text-intent-fill` + `data-intent`. */
  intent?: Intent;
  /** Nome acessível (`role="img"`); sem ele o ícone é `aria-hidden`. */
  label?: string;
  strokeWidth?: number | string;
  /** `"auto"` (padrão): reage ao controle pai. `"none"`: só `playKey`/`loop`. */
  trigger?: "auto" | "none";
  /** Quando muda (não na montagem), cancela o `action` em curso e toca de novo. */
  playKey?: unknown;
  /** Roda a coreografia `loop`; enquanto ativo, gatilhos de `action` são ignorados. */
  loop?: boolean;
}

export type AnimatedIconComponent = ForwardRefExoticComponent<AnimatedIconProps & RefAttributes<SVGSVGElement>> & {
  readonly definition: IconDefinition;
};
