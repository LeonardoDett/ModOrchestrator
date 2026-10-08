import { animate, animateLoop, readMotion, REDUCED_LOOP } from "../motion";
import type { Choreography, IconMode, Technique } from "./types";

function partsOf(svg: SVGSVGElement): Map<string, Element> {
  const map = new Map<string, Element>();
  for (const el of svg.querySelectorAll("[data-part]")) {
    const name = el.getAttribute("data-part")!;
    if (!map.has(name)) map.set(name, el);
  }
  return map;
}

/**
 * Executa uma coreografia no `<svg>` de um ícone: lê `readMotion(svg)` uma vez, roda cada técnica
 * na parte `[data-part=chave]` (técnicas em array em paralelo), com `delay = t.delay + index·m.stagger`.
 * `action` usa `animate()` (com `reduced` da técnica sob redução); `loop` usa `animateLoop()` e, sob
 * redução, um único loop no `root` (o pulso de opacidade de `animateLoop`). Devolve as animações criadas.
 */
export function playChoreography(svg: SVGSVGElement, choreo: Choreography, mode: IconMode): Animation[] {
  const m = readMotion(svg);
  const parts = partsOf(svg);
  const out: Animation[] = [];
  const push = (a: Animation | null) => {
    if (a) out.push(a);
  };

  if (mode === "loop" && m.reduced) {
    const root = parts.get("root");
    if (root) push(animateLoop(root, [], { period: REDUCED_LOOP.duration }));
    return out;
  }

  for (const [key, value] of Object.entries(choreo)) {
    const el = parts.get(key);
    if (!el || !value) continue;
    const techniques: readonly Technique[] = Array.isArray(value) ? value : [value as Technique];
    for (const t of techniques) {
      const index = t.index ?? 0;
      const run = t.run(m, { mode, index });
      const delay = t.delay + index * m.stagger;
      if (mode === "action") {
        push(animate(el, m.reduced && run.reduced ? run.reduced : run.keyframes, { ...run.options, delay }));
      } else {
        push(animateLoop(el, run.keyframes, { period: run.period ?? 0, easing: run.easing, delay }));
      }
    }
  }
  return out;
}
