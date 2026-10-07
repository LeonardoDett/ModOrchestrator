"use client";

import { useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MotionContext, ThemeScopeContext } from "../theme/theme-context";

const CONTENTS = { display: "contents" } as const;

/**
 * Reemite o escopo de tema e movimento do ponto de montagem para conteúdo portado (fora da
 * árvore DOM do `ThemeScope`): um `div` com `display: contents` e `data-theme`,
 * `data-ui-mode` (só com modo forçado), `data-density` (se o escopo definir) e `data-motion`.
 * Sem tema nem movimento de contexto, renderiza os filhos sem wrapper. Use em todo overlay
 * que porta para fora da árvore (`Portal` já usa; `FloatingPortal`/`createPortal` envolvem).
 */
export function OverlayScope({ children }: { children: ReactNode }) {
  const scope = useContext(ThemeScopeContext);
  const motion = useContext(MotionContext);
  if (!scope && !motion) return <>{children}</>;
  return (
    <div
      style={CONTENTS}
      data-theme={scope?.theme.id}
      data-ui-mode={scope?.forcedMode}
      data-density={scope?.density}
      data-motion={motion?.level}
    >
      {children}
    </div>
  );
}

type PortalProps = {
  /** Content to render in the portal */
  children: ReactNode;
  /** DOM element to render into (defaults to document.body) */
  container?: Element | null;
  /** Custom container selector (alternative to container prop) */
  containerSelector?: string;
  /** Disable the portal (renders children in place) */
  disabled?: boolean;
};

/**
 * Portal renders children into a DOM node outside the parent component's hierarchy.
 * Useful for modals, tooltips, popovers, and other overlay elements. Portaled content is
 * wrapped in `OverlayScope`, so it keeps the theme, forced mode, density and motion level
 * of the nearest `ThemeScope`/`MotionScope`.
 *
 * @example
 * ```tsx
 * // Render to document.body (default)
 * <Portal>
 *   <Modal>Content</Modal>
 * </Portal>
 *
 * // Render to a specific container
 * <Portal container={document.getElementById("modal-root")}>
 *   <Modal>Content</Modal>
 * </Portal>
 *
 * // Render to container by selector
 * <Portal containerSelector="#modal-root">
 *   <Modal>Content</Modal>
 * </Portal>
 *
 * // Disable portal (render in place)
 * <Portal disabled>
 *   <div>Renders here, not in portal</div>
 * </Portal>
 * ```
 */
export function Portal({
  children,
  container,
  containerSelector,
  disabled = false,
}: PortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (disabled) {
    return <>{children}</>;
  }

  if (!mounted) {
    return null;
  }

  const resolvedContainer =
    container ??
    (containerSelector ? document.querySelector(containerSelector) : null) ??
    document.body;

  return createPortal(<OverlayScope>{children}</OverlayScope>, resolvedContainer);
}
