"use client";
import { useSyncExternalStore } from "react";
import { prefersReducedMotion } from "./read-motion";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const cleanups: Array<() => void> = [];
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    try {
      const mql = window.matchMedia(QUERY);
      mql.addEventListener?.("change", onChange);
      cleanups.push(() => mql.removeEventListener?.("change", onChange));
    } catch {
      /* matchMedia indisponível: só o atributo conta */
    }
  }
  if (typeof MutationObserver === "function") {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-reduce-motion"] });
    cleanups.push(() => observer.disconnect());
  }
  return () => cleanups.forEach((fn) => fn());
}

/**
 * Redução de movimento reativa: `prefers-reduced-motion` (evento `change`) ou
 * `data-reduce-motion="true"` no `<html>` (observado). Sem DOM/`matchMedia`/`MutationObserver` vale `false`.
 * Entra nas deps de efeitos de loop para recriá-los quando a preferência muda.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => prefersReducedMotion(), () => false);
}
