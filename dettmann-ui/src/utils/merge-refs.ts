import type { MutableRefObject, Ref, RefCallback } from "react";

type PossibleRef<T> = Ref<T> | undefined | null;

/**
 * Sets a ref value, handling both callback refs and ref objects.
 */
function setRef<T>(ref: PossibleRef<T>, value: T): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref !== null && ref !== undefined) {
    (ref as MutableRefObject<T>).current = value;
  }
}

/**
 * Merges multiple refs into a single ref callback.
 *
 * Useful when a component needs to forward a ref while also using it internally,
 * or when composing multiple components that each need a ref to the same element.
 *
 * @param refs - Array of refs to merge (can include null/undefined)
 * @returns A ref callback that updates all provided refs
 *
 * @example
 * ```tsx
 * function MyComponent({ forwardedRef }) {
 *   const internalRef = useRef<HTMLDivElement>(null);
 *
 *   // Both refs will point to the same element
 *   const mergedRef = mergeRefs([forwardedRef, internalRef]);
 *
 *   return <div ref={mergedRef}>Content</div>;
 * }
 *
 * // With forwardRef:
 * const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
 *   const internalRef = useRef<HTMLButtonElement>(null);
 *
 *   return (
 *     <button ref={mergeRefs([ref, internalRef])} {...props}>
 *       {props.children}
 *     </button>
 *   );
 * });
 * ```
 */
export function mergeRefs<T>(refs: PossibleRef<T>[]): RefCallback<T> {
  return (value: T) => {
    for (const ref of refs) {
      setRef(ref, value);
    }
  };
}

/**
 * Creates a stable merged ref that doesn't change on every render.
 * Use this in combination with useCallback for better performance.
 *
 * @example
 * ```tsx
 * function MyComponent({ forwardedRef }) {
 *   const internalRef = useRef<HTMLDivElement>(null);
 *
 *   const mergedRef = useCallback(
 *     useMergedRef([forwardedRef, internalRef]),
 *     [forwardedRef]
 *   );
 *
 *   return <div ref={mergedRef}>Content</div>;
 * }
 * ```
 */
export function useMergedRef<T>(refs: PossibleRef<T>[]): RefCallback<T> {
  return mergeRefs(refs);
}

/**
 * Composes multiple refs into a single ref.
 * Alias for mergeRefs for semantic clarity.
 *
 * @example
 * ```tsx
 * const ref = composeRefs(refA, refB, refC);
 * ```
 */
export function composeRefs<T>(...refs: PossibleRef<T>[]): RefCallback<T> {
  return mergeRefs(refs);
}
