import type { MotionValues } from "../motion";
import type { Choreography, Extent, IconMode, Technique, TechniqueContext, TechniqueKind, TechniqueRun } from "./types";

const REDUCED_PULSE: Keyframe[] = [{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }];
const ACTION: readonly IconMode[] = ["action"];
const BOTH: readonly IconMode[] = ["action", "loop"];
const LOOP: readonly IconMode[] = ["loop"];

const xy = (x: number, y: number) => `${x}px ${y}px`;

function make(
  kind: TechniqueKind,
  modes: readonly IconMode[],
  extent: Partial<Extent>,
  delay: number | undefined,
  run: (m: MotionValues, ctx: TechniqueContext) => TechniqueRun,
  exempt = false,
): Technique {
  return {
    kind,
    modes,
    extent: { translate: 0, rotate: 0, scale: 0, ...extent },
    delay: delay ?? 0,
    ...(exempt ? { exempt: true } : {}),
    run,
  };
}

/** Encolhe e volta (o overshoot vem da mola). */
export function squash(p: { amount?: number; delay?: number } = {}): Technique {
  const amount = p.amount ?? 0.12;
  return make("squash", ACTION, { scale: amount }, p.delay, (m) => ({
    keyframes: [{ scale: "1" }, { scale: String(1 - amount * m.amp) }, { scale: "1" }],
  }));
}

/** A parte desloca e/ou gira e volta. */
export function lift(p: { x?: number; y?: number; rotate?: number; delay?: number }): Technique {
  const x = p.x ?? 0;
  const y = p.y ?? 0;
  const deg = p.rotate ?? 0;
  const extent = { translate: Math.max(Math.abs(x), Math.abs(y)), rotate: Math.abs(deg) };
  return make("lift", ACTION, extent, p.delay, (m) => ({
    keyframes: [
      { translate: "0px 0px", rotate: "0deg" },
      { translate: xy(x * m.amp, y * m.amp), rotate: `${deg * m.amp}deg` },
      { translate: "0px 0px", rotate: "0deg" },
    ],
  }));
}

/** Desloca na direção e volta. Sem x/y, x = 1.8 (1.8 × amp 1.6 ≤ 3). */
export function nudge(p: { x?: number; y?: number; delay?: number; period?: number } = {}): Technique {
  const none = p.x === undefined && p.y === undefined;
  const x = none ? 1.8 : (p.x ?? 0);
  const y = p.y ?? 0;
  const period = p.period ?? 1200;
  return make("nudge", BOTH, { translate: Math.max(Math.abs(x), Math.abs(y)) }, p.delay, (m, ctx) => ({
    keyframes: [{ translate: "0px 0px" }, { translate: xy(x * m.amp, y * m.amp) }, { translate: "0px 0px" }],
    ...(ctx.mode === "loop" ? { period, easing: "spring" as const } : {}),
  }));
}

/** Gira N graus e volta. */
export function rotate(p: { deg: number; delay?: number }): Technique {
  return make("rotate", ACTION, { rotate: Math.abs(p.deg) }, p.delay, (m) => ({
    keyframes: [{ rotate: "0deg" }, { rotate: `${p.deg * m.amp}deg` }, { rotate: "0deg" }],
  }));
}

/** Rotação contínua (isenta do limite geométrico). */
export function spin(p: { turns?: number; period?: number } = {}): Technique {
  const turns = p.turns ?? 1;
  const period = p.period ?? 1000;
  return make(
    "spin",
    LOOP,
    { rotate: turns * 360 },
    undefined,
    () => ({ keyframes: [{ rotate: "0deg" }, { rotate: `${turns * 360}deg` }], period, easing: "linear" }),
    true,
  );
}

/** Traço desenhado (`pathLength=1`). Não escala por `amp`: é conteúdo, não gesto. */
export function draw(p: { from?: "start" | "end"; delay?: number; period?: number } = {}): Technique {
  const from = p.from === "end" ? -1 : 1;
  const period = p.period ?? 1400;
  return make("draw", BOTH, {}, p.delay, (_m, ctx) => ({
    keyframes: [
      { strokeDasharray: "1", strokeDashoffset: from },
      { strokeDasharray: "1", strokeDashoffset: 0 },
    ],
    ...(ctx.mode === "loop" ? { period, easing: "linear" as const } : { reduced: REDUCED_PULSE }),
  }));
}

/** Traço apagado e redesenhado de volta. */
export function undraw(p: { delay?: number } = {}): Technique {
  return make("undraw", ACTION, {}, p.delay, () => ({
    keyframes: [
      { strokeDasharray: "1", strokeDashoffset: 0 },
      { strokeDasharray: "1", strokeDashoffset: 1 },
      { strokeDasharray: "1", strokeDashoffset: 0 },
    ],
    reduced: REDUCED_PULSE,
  }));
}

/**
 * Gira com perspectiva até `deg` e volta ao repouso (isenta). Única técnica que usa `transform`
 * (a perspectiva precisa compor com a rotação do eixo).
 */
export function flip(p: { deg?: number; axis?: "x" | "y" } = {}): Technique {
  const deg = p.deg ?? 180;
  const fn = p.axis === "x" ? "rotateX" : "rotateY";
  return make(
    "flip",
    ACTION,
    { rotate: deg },
    undefined,
    (m) => ({
      keyframes: [
        { transform: `perspective(48px) ${fn}(0deg)` },
        { transform: `perspective(48px) ${fn}(${deg * m.amp}deg)` },
        { transform: `perspective(48px) ${fn}(0deg)` },
      ],
    }),
    true,
  );
}

/** Linhas de velocidade surgem e somem; aplicada à parte que contém as linhas `trail-*`. */
export function trail(p: { length?: number; delay?: number; period?: number } = {}): Technique {
  const length = p.length ?? 1;
  const period = p.period ?? 1200;
  return make("trail", BOTH, {}, p.delay, (m, ctx) => ({
    keyframes: [
      { opacity: 1, strokeDasharray: "1", strokeDashoffset: 0 },
      { opacity: 0.3, strokeDasharray: "1", strokeDashoffset: -length * 0.5 * m.amp },
      { opacity: 1, strokeDasharray: "1", strokeDashoffset: 0 },
    ],
    ...(ctx.mode === "loop" ? { period, easing: "linear" as const } : { reduced: REDUCED_PULSE }),
  }));
}

/** Escala e opacidade respirando. */
export function pulse(p: { amount?: number; period?: number } = {}): Technique {
  const amount = p.amount ?? 0.12;
  const period = p.period ?? 1600;
  return make("pulse", LOOP, { scale: amount }, undefined, (m) => ({
    keyframes: [
      { scale: "1", opacity: 1 },
      { scale: String(1 + amount * m.amp), opacity: 0.75 },
      { scale: "1", opacity: 1 },
    ],
    period,
    easing: "spring",
  }));
}

/** Aplica `t` às partes em ordem; a parte `i` recebe uma cópia com `index = i`. */
export function stagger(order: readonly string[], t: Technique): Choreography {
  const out: Choreography = {};
  order.forEach((part, i) => {
    out[part] = { ...t, index: i };
  });
  return out;
}
