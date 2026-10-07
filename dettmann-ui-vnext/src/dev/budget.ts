import { useEffect } from "react";
import type { Emphasis } from "../theme/engine";

export interface BudgetViolation {
  region: Element;
  highCount: number;
}

const HIDDEN_ANCESTOR = '[hidden],[inert],[aria-hidden="true"]';

function isVisible(el: Element): boolean {
  if (el.closest(HIDDEN_ANCESTOR)) return false;
  const check = (el as Element & { checkVisibility?: () => boolean }).checkVisibility;
  return typeof check === "function" ? check.call(el) : true;
}

/** Regiões `[data-budget-region]` com mais de um `[data-layer="high"]` visível. */
export function findBudgetViolations(root: ParentNode): BudgetViolation[] {
  const out: BudgetViolation[] = [];
  root.querySelectorAll("[data-budget-region]").forEach((region) => {
    let highCount = 0;
    region.querySelectorAll('[data-layer="high"]').forEach((el) => {
      if (isVisible(el)) highCount++;
    });
    if (highCount > 1) out.push({ region, highCount });
  });
  return out;
}

const DEBOUNCE_MS = 250;
const MAX_WAIT_MS = 1000;
const EPS = 1e-9;
const WATCHED_ATTRIBUTES = ["class", "style", "hidden", "inert", "aria-hidden", "data-layer", "data-budget-region"];

/** Em dev, avisa no console (uma vez por região) quando uma região excede o orçamento de ênfase alta. */
export function useBudgetGuard(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof document === "undefined" || typeof MutationObserver === "undefined") return;
    const warned = new WeakSet<Element>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let firstPending = 0;
    const run = () => {
      timer = undefined;
      firstPending = 0;
      for (const { region, highCount } of findBudgetViolations(document)) {
        if (warned.has(region)) continue;
        warned.add(region);
        console.warn(`[dettmann-ui] budget: ${highCount} high-emphasis elements in`, region);
      }
    };
    const schedule = () => {
      const now = Date.now();
      if (timer === undefined) firstPending = now;
      else clearTimeout(timer);
      // Debounce com teto: mutações contínuas não adiam a varredura além de MAX_WAIT_MS.
      timer = setTimeout(run, Math.max(0, Math.min(DEBOUNCE_MS, firstPending + MAX_WAIT_MS - now)));
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: WATCHED_ATTRIBUTES });
    schedule();
    return () => {
      observer.disconnect();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [enabled]);
}

export interface SampleOptions {
  width: number;
  height: number;
  step: number;
  hit: (x: number, y: number) => Element | null;
}

/** Amostra a tela em grade e devolve a camada de cada ponto (sem `data-layer` → `low`; `data-budget-ignore` é descartado). */
export function sampleLayers({ width, height, step, hit }: SampleOptions): Emphasis[] {
  const out: Emphasis[] = [];
  const s = Math.max(1, step);
  for (let y = s / 2; y < height; y += s) {
    for (let x = s / 2; x < width; x += s) {
      const el = hit(x, y);
      if (!el || el.closest("[data-budget-ignore]")) continue;
      const layer = el.closest("[data-layer]")?.getAttribute("data-layer");
      out.push(layer === "medium" || layer === "high" ? layer : "low");
    }
  }
  return out;
}

export function summarizeLayers(samples: Emphasis[]): Record<Emphasis, number> {
  const counts: Record<Emphasis, number> = { low: 0, medium: 0, high: 0 };
  for (const s of samples) counts[s]++;
  const n = samples.length;
  if (n === 0) return counts;
  return { low: counts.low / n, medium: counts.medium / n, high: counts.high / n };
}

export function budgetVerdict(
  r: Record<Emphasis, number>,
  tol: { lowMedium?: number; highMax?: number } = {},
): { ok: boolean; messages: string[] } {
  const lowMedium = tol.lowMedium ?? 0.08;
  const highMax = tol.highMax ?? 0.12;
  const messages: string[] = [];
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  if (Math.abs(r.low - 0.6) > lowMedium + EPS) messages.push(`Base (low) em ${pct(r.low)}; meta 60% ± ${pct(lowMedium)}.`);
  if (Math.abs(r.medium - 0.3) > lowMedium + EPS) messages.push(`Estrutura (medium) em ${pct(r.medium)}; meta 30% ± ${pct(lowMedium)}.`);
  if (r.high > highMax + EPS) messages.push(`Destaque (high) em ${pct(r.high)}; máximo ${pct(highMax)} (meta 10%).`);
  return { ok: messages.length === 0, messages };
}
