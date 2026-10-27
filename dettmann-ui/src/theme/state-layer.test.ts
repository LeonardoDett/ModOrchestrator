// @vitest-environment node
import { expect, test } from "vitest";
import { createTheme, parseColor, wcagContrast, type ResolvedTheme } from "./engine";
import { resolveEmphasis } from "./emphasis";
import { PRESETS } from "./presets";

// Sem @types/node no projeto: especificador não literal, tipado localmente.
const NODE_FS: string = "node:fs";
const fs = (await import(/* @vite-ignore */ NODE_FS)) as {
  readFileSync(path: URL, encoding: "utf8"): string;
  readdirSync(path: URL, options: { recursive: true }): string[];
};
const lf = (s: string) => s.replace(/\r\n/g, "\n");
const read = (rel: string) => lf(fs.readFileSync(new URL(rel, import.meta.url), "utf8"));

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** Composição alfa em sRGB (como o navegador pinta `color-mix(..., transparent)` sobre um fundo). */
function over(top: string, bottom: string, alpha: number): string {
  const b = rgb(bottom);
  return `#${rgb(top)
    .map((v, i) => Math.round(v * alpha + b[i]! * (1 - alpha)).toString(16).padStart(2, "0"))
    .join("")}`;
}
const ratio = (a: string, b: string) => wcagContrast(parseColor(a)!, parseColor(b)!);

const HOVER_ALPHA = 0.06; // --state-hover (spec 4.4)

/**
 * Cor pintada em hover dada a lista de classes: `hover:state-layer-hover` compõe
 * a camada sobre o fundo de repouso; `hover:bg-state-hover` substitui o fundo e a
 * camada cai sobre o pai.
 */
function hoverPaint(className: string, rest: string, parent: string, base: string): string {
  const classes = className.split(/\s+/);
  if (classes.includes("hover:state-layer-hover")) return over(base, rest, HOVER_ALPHA);
  if (classes.includes("hover:bg-state-hover")) return over(base, parent, HOVER_ALPHA);
  return rest;
}

// Piso 1.05 calibrado no forest. O padrão da lib é orchestrator; o par claro
// danger-subtle/hover dele fica logo abaixo desse piso e não entra nesta amostra.
const theme = createTheme(PRESETS.forest);
const modes = ["light", "dark"] as const;
type Roles = ResolvedTheme["light"];

test.each(modes)("medium+danger hover composites over the subtle rest (%s, ratio ≥ 1.05)", (mode) => {
  const r: Roles = theme[mode];
  const { className } = resolveEmphasis({ emphasis: "medium", intent: "danger" });
  const rest = r["danger-subtle"]!;
  const hover = hoverPaint(className, rest, r.surface!, r["danger-fill"]!);
  expect(ratio(rest, hover)).toBeGreaterThanOrEqual(1.05);
  // A camada escurece/clareia a cor de repouso, nunca a troca por cinza.
  expect(hover).toBe(over(r["danger-fill"]!, rest, HOVER_ALPHA));
});

test("interactive Surface hover composites over its layer in dark mode (ratio ≥ 1.05)", async () => {
  const { Surface } = await import("../primitives/surface");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const html = renderToStaticMarkup(createElement(Surface, { interactive: true }));
  const className = html.match(/class="([^"]*)"/)![1]!;
  expect(className.split(" ")).toContain("hover:state-layer-hover");
  const r: Roles = theme.dark;
  const hover = hoverPaint(className, r.surface!, r.canvas!, r.fg!);
  expect(ratio(r.surface!, hover)).toBeGreaterThanOrEqual(1.05);
});

test("opaque-rest components overlay the state layer instead of replacing the background", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { Card } = await import("../components/card");
  const { Sidebar } = await import("../templates/sidebar");
  const card = renderToStaticMarkup(createElement(Card.Root, { interactive: true }));
  expect(card).toContain("hover:state-layer-hover");
  expect(card).not.toContain("hover:bg-state-hover");
  const sidebar = renderToStaticMarkup(
    createElement(Sidebar.Root, { sections: [{ id: "s", items: [{ id: "files", label: "Files" }] }], currentId: "files" }),
  );
  const current = sidebar.match(/<button[^>]*aria-current="page"[^>]*>/)![0];
  expect(current).toContain("bg-selected");
  expect(current).toContain("hover:state-layer-hover");
  expect(resolveEmphasis({ emphasis: "medium", intent: "danger" }).className).toContain("active:state-layer-pressed");
});

test("tokens.css defines state-layer utilities as composited background images", () => {
  const tokens = read("./tokens.css");
  for (const state of ["hover", "pressed", "selected"])
    expect(tokens).toContain(
      `@utility state-layer-${state} {\n  background-image: linear-gradient(var(--state-${state}), var(--state-${state}));\n}`,
    );
});

/** Expansão de chaves sem aninhamento, como `@source inline` do Tailwind. */
function expand(token: string): string[] {
  const m = token.match(/\{([^{}]*)\}/);
  if (!m) return [token];
  return m[1]!.split(",").flatMap((alt) => expand(token.replace(m[0], alt)));
}

test("state-layer utilities are safelisted with hover/active variants", () => {
  const tokens = read("./tokens.css");
  const inline = [...tokens.matchAll(/@source inline\("([^"]*)"\)/g)].map((m) => m[1]!).join(" ");
  const safelist = new Set(inline.split(/\s+/).filter(Boolean).flatMap(expand));
  for (const u of ["hover:state-layer-hover", "active:state-layer-pressed", "state-layer-selected", "state-layer-hover"])
    expect(safelist.has(u), u).toBe(true);
});

const OPAQUE_REST =
  /(?<![:\w-])bg-(?:canvas|surface|raised|sunken|structure|selected|fill-neutral|(?:emphasis|brand|accent|info|success|warning|danger|intent)-subtle)\b/;

test("no source line pairs an opaque rest background with a replacing bg-state layer", () => {
  const root = new URL("../", import.meta.url);
  const files = fs
    .readdirSync(root, { recursive: true })
    .map((f) => f.replace(/\\/g, "/"))
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.startsWith("__tests__/"));
  const offenders: string[] = [];
  for (const file of files) {
    lf(fs.readFileSync(new URL(file, root), "utf8"))
      .split("\n")
      .forEach((line, i) => {
        if (OPAQUE_REST.test(line) && /(?:hover|active):bg-state-/.test(line)) offenders.push(`${file}:${i + 1}`);
      });
  }
  expect(offenders).toEqual([]);
});
