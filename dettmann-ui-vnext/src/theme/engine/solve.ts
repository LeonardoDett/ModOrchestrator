import { apcaContrast, wcagContrast } from "./color/contrast";
import { parseColor, toHex } from "./color/convert";
import type { ContrastLevel, Oklch } from "./types";

export type ContrastKind = "text" | "text-secondary" | "text-meta" | "on-fill" | "intent-text" | "control-border" | "focus";
export interface ContrastTarget {
  wcag: number;
  apca?: number;
}

/** Metas por tipo de par (spec 4.3 + decisões do plano para papéis que o spec não lista). */
export const CONTRAST_TARGETS: Record<ContrastLevel, Record<ContrastKind, ContrastTarget>> = {
  standard: {
    text: { wcag: 7 },
    "text-secondary": { wcag: 4.5 },
    "text-meta": { wcag: 3 },
    "on-fill": { wcag: 4.5 },
    "intent-text": { wcag: 4.5 },
    "control-border": { wcag: 3 },
    focus: { wcag: 3 },
  },
  high: {
    text: { wcag: 7, apca: 90 },
    "text-secondary": { wcag: 7 },
    "text-meta": { wcag: 4.5 },
    "on-fill": { wcag: 7 },
    "intent-text": { wcag: 7 },
    "control-border": { wcag: 4.5 },
    focus: { wcag: 4.5 },
  },
};

/** Métrica normalizada: >= 1 quando todas as metas (WCAG e, se houver, APCA) são atingidas. */
export function targetMetric(target: ContrastTarget): (fg: Oklch, bg: Oklch) => number {
  const { wcag, apca } = target;
  if (apca === undefined) return (fg, bg) => wcagContrast(fg, bg) / wcag;
  return (fg, bg) => Math.min(wcagContrast(fg, bg) / wcag, apcaContrast(fg, bg) / apca);
}

/**
 * A cor exatamente como será emitida: gamut por redução de croma e quantização para 8 bits.
 * Medir contraste sobre ela garante que o hex final atinge a meta.
 */
export function snap(c: Oklch): Oklch {
  const l = Math.min(1, Math.max(0, c.l));
  return parseColor(toHex({ l, c: Math.max(0, c.c), h: c.h }))!;
}

const ITERATIONS = 24;
const MIN_STEP = 1e-4;

/**
 * Ajusta só a luminosidade (matiz e croma mantidos, croma reduzida ao gamut) até
 * `metric(cor, fundo) >= target` para todos os fundos. Se a cor inicial já atinge a meta,
 * ela é mantida; senão a bissecção (até 24 iterações, parando quando o intervalo em L fica
 * < 1e-4) devolve o valor mais próximo do inicial que atinge a meta. `met=false` (com o
 * extremo) quando nem o extremo atinge.
 */
export function solveLightness(
  color: Oklch,
  against: Oklch[],
  target: number,
  direction: "darker" | "lighter",
  metric: (fg: Oklch, bg: Oklch) => number = wcagContrast,
): { color: Oklch; met: boolean } {
  const at = (l: number) => snap({ l, c: color.c, h: color.h });
  const meets = (c: Oklch) => against.every((bg) => metric(c, bg) >= target);
  const start = snap(color);
  if (meets(start)) return { color: start, met: true };
  const extreme = direction === "darker" ? 0 : 1;
  const end = at(extreme);
  if (!meets(end)) return { color: end, met: false };
  // invariante: `ok` atinge a meta, `bad` não
  let ok = extreme;
  let okColor = end;
  let bad = Math.min(1, Math.max(0, color.l));
  // até 24 iterações; para antes quando o intervalo fica bem abaixo de um passo de 8 bits
  for (let i = 0; i < ITERATIONS && Math.abs(bad - ok) > MIN_STEP; i++) {
    const mid = (ok + bad) / 2;
    const c = at(mid);
    if (meets(c)) {
      ok = mid;
      okColor = c;
    } else bad = mid;
  }
  return { color: okColor, met: true };
}
