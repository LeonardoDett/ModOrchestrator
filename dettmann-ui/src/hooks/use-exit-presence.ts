"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ExitPresence {
  /** Renderize os filhos enquanto for `true`: aberto, ou fechado com a saída ainda em curso. */
  mounted: boolean;
  /** O painel chama quando a animação de saída termina (ou na hora, sem animação). */
  onExited: () => void;
  /** O painel se registra enquanto está montado; sem painel não há saída a esperar. */
  registerPanel: () => () => void;
}

/**
 * Mantém um overlay montado depois de `open` virar `false`, até o painel avisar que a
 * saída terminou. Foco, scroll e Esc são soltos por quem usa `open` diretamente.
 */
export function useExitPresence(open: boolean): ExitPresence {
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  const panels = useRef(0);

  const onExited = useCallback(() => setPresent(false), []);
  const registerPanel = useCallback(() => {
    panels.current += 1;
    return () => {
      panels.current -= 1;
    };
  }, []);

  // Sem painel registrado ninguém chamaria `onExited`: desmonta na hora.
  useEffect(() => {
    if (!open && present && panels.current === 0) setPresent(false);
  }, [open, present]);

  return { mounted: open || present, onExited, registerPanel };
}
