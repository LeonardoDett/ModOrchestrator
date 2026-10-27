"use client";

import { useEffect, useRef, useCallback, type RefObject } from "react";

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "area[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

interface UseFocusTrapOptions {
  /** Whether the focus trap is active */
  enabled?: boolean;
  /** Element to focus when trap is activated (defaults to first focusable) */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Element to focus when trap is deactivated (defaults to previously focused) */
  returnFocus?: boolean;
}

/**
 * Hook to trap focus within a container element.
 * Used for modal dialogs to ensure keyboard navigation stays within the modal.
 *
 * @example
 * ```tsx
 * function Modal({ isOpen }) {
 *   const containerRef = useFocusTrap<HTMLDivElement>({ enabled: isOpen });
 *   return <div ref={containerRef}>...</div>;
 * }
 * ```
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  options: UseFocusTrapOptions = {}
): RefObject<T | null> {
  const { enabled = true, initialFocus, returnFocus = true } = options;

  const containerRef = useRef<T | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return [];
    return tabbables(containerRef.current);
  }, []);

  const focusFirst = useCallback(() => {
    if (initialFocus?.current) {
      initialFocus.current.focus();
      return;
    }
    const elements = getFocusableElements();
    const firstElement = elements[0];
    if (firstElement) {
      firstElement.focus();
    }
  }, [getFocusableElements, initialFocus]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled || event.key !== "Tab" || event.defaultPrevented) return;
      const container = containerRef.current;
      const active = document.activeElement;
      // Só a armadilha que contém o foco age: um overlay empilhado (ou um menu
      // portado fora do painel) cuida do próprio Tab.
      if (!container || !active || !container.contains(active)) return;

      const elements = getFocusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        return;
      }
      // Sai do painel quando não há destino na direção do Tab, inclusive a partir
      // de um elemento fora da ordem (tabindex -1, como uma grade com
      // aria-activedescendant ou o próprio painel).
      const after = elements.filter((el) => el !== active && active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
      const before = elements.filter((el) => el !== active && active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
      if (event.shiftKey && before.length === 0) {
        event.preventDefault();
        elements[elements.length - 1]!.focus();
      } else if (!event.shiftKey && after.length === 0) {
        event.preventDefault();
        elements[0]!.focus();
      }
    },
    [enabled, getFocusableElements]
  );

  useEffect(() => {
    if (!enabled) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement;

    const timeoutId = setTimeout(() => {
      focusFirst();
    }, 0);

    // No documento, não no painel: o painel de um overlay portado só existe depois
    // deste efeito (o Portal monta num efeito próprio).
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("keydown", handleKeyDown);

      // Devolve o foco só se ele ainda está no overlay (ou se perdeu): quem fechou
      // o overlay pode já ter levado o foco a outro lugar (navegação pela paleta).
      const previous = previouslyFocusedRef.current;
      const active = document.activeElement;
      const container = containerRef.current;
      const stillHere = !active || active === document.body || (container?.contains(active) ?? false);
      if (returnFocus && previous?.isConnected && stillHere) {
        previous.focus();
      }
    };
  }, [enabled, focusFirst, handleKeyDown, returnFocus]);

  return containerRef;
}

/**
 * Elementos que o Tab alcança dentro de `container`, na ordem do documento: sem
 * `tabindex` negativo, desabilitados, inertes ou invisíveis.
 */
export function tabbables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.hasAttribute("disabled") &&
      !el.closest("[inert]") &&
      (typeof el.checkVisibility !== "function" || el.checkVisibility()),
  );
}
