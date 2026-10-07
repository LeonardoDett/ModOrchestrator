import { useCallback, useRef } from "react";
import { useIsomorphicLayoutEffect } from "../utils/use-isomorphic-layout-effect";
import { animate } from "./animate";

interface Box {
  left: number;
  top: number;
}

const sameDeps = (a: readonly unknown[] | undefined, b: readonly unknown[]) =>
  a !== undefined && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/**
 * Reordenação animada (FLIP). Registre cada item com `ref={flip(key)}`.
 *
 * - First: no render em que `deps` diferem das do último commit, mede os itens ainda no
 *   DOM antigo (inclui o `translate` de um FLIP em curso, então interrupções não saltam,
 *   e reflete rolagem/layout atuais).
 * - Last: em layout effect, cancela os FLIPs em curso e mede as posições novas.
 * - Invert/Play: anima `translate` do deslocamento até zero nos itens que se moveram.
 *
 * Itens novos não animam; itens removidos são ignorados; a primeira montagem não anima.
 * Sob redução de movimento não há animação (`animate` remove `translate`).
 */
export function useFlip<T extends HTMLElement>(deps: unknown[]): (key: string) => (el: T | null) => void {
  const nodes = useRef(new Map<string, T>());
  const refs = useRef(new Map<string, (el: T | null) => void>());
  const before = useRef(new Map<string, Box>());
  const running = useRef(new Map<string, Animation>());
  const committedDeps = useRef<readonly unknown[] | undefined>(undefined);

  // Medição "antes" durante o render: o DOM ainda é o do commit anterior. Repetir
  // (StrictMode, render descartado) só remede o mesmo DOM.
  if (committedDeps.current !== undefined && !sameDeps(committedDeps.current, deps)) {
    const snapshot = new Map<string, Box>();
    for (const [key, el] of nodes.current) {
      const r = el.getBoundingClientRect();
      snapshot.set(key, { left: r.left, top: r.top });
    }
    before.current = snapshot;
  }

  const flip = useCallback((key: string) => {
    let ref = refs.current.get(key);
    if (!ref) {
      ref = (el: T | null) => {
        if (el) nodes.current.set(key, el);
        else nodes.current.delete(key);
      };
      refs.current.set(key, ref);
    }
    return ref;
  }, []);

  useIsomorphicLayoutEffect(() => {
    committedDeps.current = deps;
    const previous = before.current;
    before.current = new Map();
    for (const key of refs.current.keys()) if (!nodes.current.has(key)) refs.current.delete(key);
    if (previous.size === 0) return;

    for (const anim of running.current.values()) anim.cancel();
    running.current.clear();

    const moves: [T, number, number, string][] = [];
    for (const [key, el] of nodes.current) {
      const from = previous.get(key);
      if (!from) continue;
      const r = el.getBoundingClientRect();
      const dx = from.left - r.left;
      const dy = from.top - r.top;
      if (dx !== 0 || dy !== 0) moves.push([el, dx, dy, key]);
    }
    for (const [el, dx, dy, key] of moves) {
      const anim = animate(el, [{ translate: `${dx}px ${dy}px` }, { translate: "0px 0px" }]);
      if (anim) running.current.set(key, anim);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useIsomorphicLayoutEffect(
    () => () => {
      for (const anim of running.current.values()) anim.cancel();
      running.current.clear();
    },
    [],
  );

  return flip;
}
