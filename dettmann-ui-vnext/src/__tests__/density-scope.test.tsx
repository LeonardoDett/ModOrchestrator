import { afterEach, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { ThemeScope } from "../theme";

// Sem @types/node no projeto: especificador não literal, tipado localmente.
const NODE_FS: string = "node:fs";
const fs = (await import(/* @vite-ignore */ NODE_FS)) as { readFileSync(path: string, encoding: "utf8"): string };
// Sob jsdom, import.meta.url não é file:; o vitest roda com cwd na raiz do pacote.
const foundations = fs
  .readFileSync("src/styles/theme/foundations.css", "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

afterEach(() => document.querySelectorAll("style[data-dettmann-theme]").forEach((s) => s.remove()));

type Spec = [number, number, number];
/** Especificidade de um seletor complexo simples (sem :is/:not aninhados); `:where()` vale zero. */
function specificity(selector: string): Spec {
  const s = selector.replace(/:where\([^)]*\)/g, "");
  const attrs = s.match(/\[[^\]]*\]/g)?.length ?? 0;
  const rest = s.replace(/\[[^\]]*\]/g, "");
  return [
    rest.match(/#[\w-]+/g)?.length ?? 0,
    attrs + (rest.match(/\.[\w-]+/g)?.length ?? 0) + (rest.match(/:[\w-]+/g)?.length ?? 0),
    rest.match(/(?:^|[\s>+~])[a-z][\w-]*/gi)?.length ?? 0,
  ];
}
const cmp = (a: Spec, b: Spec) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const rules = (css: string) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1]!.trim().split(/\s*,\s*/), body: m[2]! }));

/** Maior especificidade, entre as regras que declaram `prop` e casam com `node`. */
function strongest(css: string, node: Element, prop: string, filter: (body: string) => boolean = () => true): Spec | null {
  let best: Spec | null = null;
  for (const r of rules(css)) {
    if (!r.body.includes(`${prop}:`) || !filter(r.body)) continue;
    for (const sel of r.selectors) {
      if (sel.startsWith("@") || !node.matches(sel)) continue;
      const sp = specificity(sel);
      if (!best || cmp(sp, best) > 0) best = sp;
    }
  }
  return best;
}

const runtime = { id: "dense", label: "Dense", brand: "#336699" };
const injected = () =>
  [...document.querySelectorAll<HTMLStyleElement>("style[data-dettmann-theme]")].map((s) => s.textContent).join("\n");
/** O bloco compact de foundations.css é o único que declara control-md abaixo de 36. */
const compactRule = (body: string) => /--ui-density-scale:\s*0\.875/.test(body);

function expectDensityWins(node: Element) {
  const theme = strongest(injected(), node, "--ui-control-md");
  const density = strongest(foundations, node, "--ui-control-md", compactRule);
  expect(theme).not.toBeNull();
  expect(density).not.toBeNull();
  // O <style> injetado vem depois de foundations.css: a densidade precisa de especificidade estritamente maior.
  expect(cmp(density!, theme!)).toBeGreaterThan(0);
}

test("density beats a runtime (non-preset) theme declared on the same node", () => {
  const { container } = render(
    <ThemeScope theme={runtime} density="compact">
      <span />
    </ThemeScope>,
  );
  const scope = container.firstElementChild!;
  expect(scope.getAttribute("data-theme")).toBe("dense");
  expect(scope.getAttribute("data-density")).toBe("compact");
  expectDensityWins(scope);
});

test("nested scope that re-emits data-theme keeps the inherited density", () => {
  const { container } = render(
    <ThemeScope theme={runtime} density="compact">
      <ThemeScope mode="dark">
        <span />
      </ThemeScope>
    </ThemeScope>,
  );
  const inner = container.querySelectorAll("div[data-theme]")[1]!;
  expect(inner.getAttribute("data-ui-mode")).toBe("dark");
  expect(inner.getAttribute("data-density")).toBe("compact");
  expectDensityWins(inner);
});

test("density selectors also cover the root and themed nodes", () => {
  for (const d of ["compact", "comfortable", "spacious"])
    expect(foundations).toContain(`[data-density="${d}"],\n[data-theme][data-density="${d}"],\n:root[data-density="${d}"] {`);
});
