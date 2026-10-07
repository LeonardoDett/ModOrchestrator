import { useCallback, useLayoutEffect, useRef } from "react";
import { animate } from "./animate";

interface Box {
  left: number;
  top: number;
}

/**
 * Reordenação animada (FLIP). Registre cada item com `ref={flip(key)}`; quando `deps`
 * mudam, mede as posições novas em `useLayoutEffect`, compara com as do commit anterior
 * e anima `translate` do deslocamento até zero nos itens que mudaram de lugar.
 * Sob redução de movimento não há animação (translate é removido por `animate`).
 */
export function useFlip<T extends HTMLElement>(deps: unknown[]): (key: string) => (el: T | null) => void {
  const nodes = useRef(new Map<string, T>());
  const refs = useRef(new Map<string, (el: T | null) => void>());
  const boxes = useRef(new Map<string, Box>());
  const running = useRef(new Map<string, Animation>());

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

  useLayoutEffect(() => {
    // Mede sem o deslocamento de uma animação anterior ainda em curso.
    for (const anim of running.current.values()) anim.cancel();
    running.current.clear();

    const next = new Map<string, Box>();
    for (const [key, el] of nodes.current) {
      const r = el.getBoundingClientRect();
      next.set(key, { left: r.left, top: r.top });
    }
    const previous = boxes.current;
    boxes.current = next;
    for (const key of refs.current.keys()) if (!nodes.current.has(key)) refs.current.delete(key);

    for (const [key, box] of next) {
      const before = previous.get(key);
      if (!before) continue;
      const dx = before.left - box.left;
      const dy = before.top - box.top;
      if (dx === 0 && dy === 0) continue;
      const el = nodes.current.get(key)!;
      const anim = animate(el, [{ translate: `${dx}px ${dy}px` }, { translate: "0px 0px" }]);
      if (anim) running.current.set(key, anim);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return flip;
}
