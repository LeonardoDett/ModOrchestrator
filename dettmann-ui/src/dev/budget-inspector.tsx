"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Emphasis } from "../theme/engine";
import { isDev } from "./env";
import { budgetVerdict, formatShare, sampleLayers, summarizeLayers } from "./budget";

export interface BudgetInspectorProps {
  /** Lado da célula de amostragem em px. Padrão 24. */
  step?: number;
  tolerance?: { lowMedium?: number; highMax?: number };
  defaultOpen?: boolean;
}

interface Measure {
  ratios: Record<Emphasis, number>;
  cells: { x: number; y: number; layer: Emphasis }[];
  width: number;
  height: number;
}

const LAYER_VAR: Record<Emphasis, string> = {
  low: "--ui-fg-subtle",
  medium: "--ui-selected",
  high: "--ui-emphasis-fill",
};
const LAYERS: Emphasis[] = ["low", "medium", "high"];

const UNAVAILABLE = "Medição indisponível neste ambiente";

/** `null` sem layout (`document.elementFromPoint` ausente, ex.: jsdom/SSR): no-op seguro. */
function measure(step: number): Measure | null {
  if (typeof document === "undefined" || typeof document.elementFromPoint !== "function") return null;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const points: { x: number; y: number }[] = [];
  const layers = sampleLayers({
    width,
    height,
    step,
    hit: (x, y) => {
      const el = document.elementFromPoint(x, y);
      // Mesmos critérios de descarte de `sampleLayers`: mantém `points` alinhado a `layers`.
      if (el && !el.closest("[data-budget-ignore]")) points.push({ x: x - step / 2, y: y - step / 2 });
      return el;
    },
  });
  const cells = layers.map((layer, i) => ({ x: points[i]?.x ?? 0, y: points[i]?.y ?? 0, layer }));
  return { ratios: summarizeLayers(layers), cells, width, height };
}

function BudgetInspectorImpl({ step = 24, tolerance, defaultOpen = true }: BudgetInspectorProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [heat, setHeat] = useState(false);
  const [result, setResult] = useState<Measure | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  const run = useCallback(() => {
    const next = measure(step);
    setUnavailable(next === null);
    setResult(next);
  }, [step]);

  useEffect(() => {
    const id = requestAnimationFrame(run);
    return () => cancelAnimationFrame(id);
  }, [run]);

  useEffect(() => {
    const el = canvas.current;
    if (!heat || !el || !result) return;
    const ctx = el.getContext?.("2d");
    if (!ctx) return;
    const style = getComputedStyle(document.documentElement);
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.globalAlpha = 0.45;
    for (const c of result.cells) {
      ctx.fillStyle = style.getPropertyValue(LAYER_VAR[c.layer]).trim() || "currentColor";
      ctx.fillRect(c.x, c.y, step, step);
    }
  }, [heat, result, step]);

  const verdict = result ? budgetVerdict(result.ratios, tolerance) : null;
  const pct = formatShare;

  return (
    <div
      data-budget-ignore=""
      className="fixed bottom-4 right-4 z-[9999] w-64 rounded-card border border-border bg-raised p-3 text-caption text-fg shadow-overlay"
    >
      <div className="flex items-center justify-between gap-2">
        <strong>Orçamento 60/30/10</strong>
        <button type="button" aria-expanded={open} aria-label={open ? "Recolher" : "Expandir"} onClick={() => setOpen((v) => !v)}>
          {open ? "−" : "+"}
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <dl className="grid grid-cols-3 gap-2">
            {LAYERS.map((layer) => (
              <div key={layer}>
                <dt>{layer}</dt>
                <dd>{result ? pct(result.ratios[layer]) : "–"}</dd>
              </div>
            ))}
          </dl>
          {unavailable && <p role="status">{UNAVAILABLE}</p>}
          {verdict && (
            <div role="status">
              <p>{verdict.ok ? "Dentro do orçamento" : "Fora do orçamento"}</p>
              {verdict.messages.map((m) => (
                <p key={m}>{m}</p>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={run}>
              Medir
            </button>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} />
              Mapa de calor
            </label>
          </div>
        </div>
      )}
      {heat && result && (
        <canvas
          ref={canvas}
          data-budget-ignore=""
          width={result.width}
          height={result.height}
          style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 9998 }}
        />
      )}
    </div>
  );
}

/** Overlay de desenvolvimento: mede a fatia de tela de cada camada. `null` em produção. */
export function BudgetInspector(props: BudgetInspectorProps) {
  if (!isDev()) return null;
  return <BudgetInspectorImpl {...props} />;
}
