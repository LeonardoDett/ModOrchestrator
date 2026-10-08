import type { IconHandle } from "./types";

const handles = new WeakMap<Element, IconHandle>();

/** Associa o `<svg>` montado ao seu handle; devolve a função que desfaz o registro. */
export function registerIcon(el: Element, handle: IconHandle): () => void {
  handles.set(el, handle);
  return () => {
    if (handles.get(el) === handle) handles.delete(el);
  };
}

export function getIconHandle(el: Element): IconHandle | undefined {
  return handles.get(el);
}
