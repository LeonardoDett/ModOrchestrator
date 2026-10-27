"use client";

import { useRef, useState } from "react";
import { useIsomorphicLayoutEffect } from "../../utils/use-isomorphic-layout-effect";
import { Tag } from "../tag";
import type { SelectOption } from "./select.items";

const GAP = 4;
/** Largura reservada para o contador `+N` quando nem tudo cabe. */
const MORE_RESERVE = 32;

interface SelectTagsProps {
  /** Opções marcadas, na ordem das opções. */
  selected: SelectOption[];
  disabled: boolean;
  moreLabel: (hidden: number) => string;
}

/** Quantas tags cabem em `available`, reservando o contador quando sobra alguma. */
function fitCount(widths: number[], available: number): number {
  const total = widths.reduce((sum, w) => sum + w, 0) + GAP * Math.max(0, widths.length - 1);
  if (total <= available) return widths.length;
  let used = 0;
  for (let i = 0; i < widths.length; i++) {
    used += widths[i]! + GAP;
    if (used + MORE_RESERVE > available) return i;
  }
  return widths.length;
}

/**
 * Seleção do `Input.Select multiple` dentro do gatilho: uma linha de tags que nunca
 * quebra; o que não cabe vira `+N`. Sem layout mensurável (SSR, jsdom) mostra todas.
 */
export function SelectTags({ selected, disabled, moreLabel }: SelectTagsProps) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const widths = useRef(new Map<string, number>());
  const [available, setAvailable] = useState(0);
  const [, setMeasured] = useState(0);

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setAvailable(container.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Tags novas são renderizadas uma vez visíveis, medidas aqui e só então podem ser recolhidas.
  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let changed = false;
    container.querySelectorAll<HTMLElement>("[data-slot=tag]").forEach((el) => {
      const key = el.dataset.value ?? "";
      const width = el.offsetWidth;
      if (width > 0 && widths.current.get(key) !== width) {
        widths.current.set(key, width);
        changed = true;
      }
    });
    if (changed) setMeasured((n) => n + 1);
  });

  const known = selected.every((o) => widths.current.has(o.value));
  const visible =
    available > 0 && known
      ? fitCount(
          selected.map((o) => widths.current.get(o.value)!),
          available,
        )
      : selected.length;
  const hidden = selected.length - visible;

  return (
    <span ref={containerRef} data-slot="tags" className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden">
      {selected.slice(0, visible).map((o) => (
        <Tag key={o.value} size="sm" data-slot="tag" data-value={o.value} emphasis={disabled ? "low" : "medium"} className="shrink-0">
          {o.label}
        </Tag>
      ))}
      {hidden > 0 ? (
        <span data-slot="more" aria-label={moreLabel(hidden)} className="shrink-0 text-caption font-medium text-fg-muted tabular-nums">
          +{hidden}
        </span>
      ) : null}
    </span>
  );
}
