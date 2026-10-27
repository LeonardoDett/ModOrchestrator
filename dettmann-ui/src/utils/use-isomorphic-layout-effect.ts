import { useEffect, useLayoutEffect } from "react";

/** `useLayoutEffect` no navegador e `useEffect` sem `window` (SSR), sem o aviso do React. */
export const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
