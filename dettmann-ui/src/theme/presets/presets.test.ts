import { expect, test } from "vitest";
import { CATEGORY_COLORS, createTheme, ROLE_NAMES } from "../engine";
import { DEFAULT_PRESET, PRESETS, renderPresetsCSS, type PresetId } from "./index";

// Sem @types/node no projeto: especificador não literal, tipado localmente.
const NODE_FS: string = "node:fs";
const fs = (await import(/* @vite-ignore */ NODE_FS)) as { readFileSync(path: URL, encoding: "utf8"): string };

const lf = (s: string) => s.replace(/\r\n/g, "\n");
/** Lê um arquivo relativo a este teste (independe do cwd), normalizando CRLF. */
const read = (rel: string) => lf(fs.readFileSync(new URL(rel, import.meta.url), "utf8"));

const ids = Object.keys(PRESETS) as PresetId[];

test("default preset is orchestrator and all five presets exist", () => {
  expect(DEFAULT_PRESET).toBe("orchestrator");
  expect(ids).toEqual(["forest", "graphite", "orchestrator", "ember", "ink"]);
  for (const id of ids) expect(PRESETS[id]).toMatchObject({ id, label: id[0]!.toUpperCase() + id.slice(1) });
});

test.each(ids)("preset %s resolves without warnings", (id) => expect(createTheme(PRESETS[id]).warnings).toEqual([]));

test.each(ids)("preset %s matches snapshot", (id) => expect(createTheme(PRESETS[id])).toMatchSnapshot());

test("renderPresetsCSS starts with the header and orchestrator as the root theme", () => {
  const css = renderPresetsCSS();
  expect(css.startsWith("/* gerado por scripts/theme/generate.ts — não editar */\n")).toBe(true);
  expect(css).toContain(':where(:root),[data-theme="orchestrator"]{');
  for (const id of ids) {
    if (id === DEFAULT_PRESET) continue;
    expect(css).toContain(`[data-theme="${id}"]{`);
    expect(css).not.toContain(`:where(:root),[data-theme="${id}"]`);
  }
});

test("generated CSS is up to date", () => {
  expect(read("../../styles/theme/themes.generated.css")).toBe(lf(renderPresetsCSS()));
});

test("tokens.css exposes every generated role as a Tailwind color", () => {
  const tokens = read("../tokens.css");
  for (const role of ROLE_NAMES) expect(tokens).toContain(`--color-${role}: var(--ui-${role});`);
});

test("tokens.css maps neutral and brand intents to their roles", () => {
  const tokens = read("../tokens.css");
  const block = (intent: string) => tokens.split(`\n[data-intent="${intent}"] {`)[1]?.split("}")[0]?.trim();
  expect(block("neutral")).toBe(
    [
      "--intent-fill: var(--ui-fill-neutral);",
      "--intent-fill-hover: var(--ui-fill-neutral-hover);",
      "--intent-fill-pressed: var(--ui-fill-neutral-hover);",
      "--on-intent: var(--ui-fg);",
      "--intent-subtle: var(--ui-selected);",
      "--intent-text: var(--ui-fg);",
      "--intent-border: var(--ui-border-strong);",
    ].join("\n  "),
  );
  expect(block("brand")).toContain("--intent-fill: var(--ui-emphasis-fill);");
  expect(block("brand")).toContain("--on-intent: var(--ui-on-emphasis);");
  expect(block("danger")).toContain("--intent-fill: var(--ui-danger-fill);");
});

test("state layers re-resolve in nested theme, mode and intent scopes", () => {
  const tokens = read("../tokens.css");
  const scopes = [":root,", "[data-theme],", "[data-ui-mode],", ".dark,"].join("\n");
  const base = `${scopes}\n[data-intent="neutral"] {\n  --state-base: var(--ui-fg);\n}`;
  const tinted = `[data-intent]:not([data-intent="neutral"]) {\n  --state-base: var(--intent-fill);\n}`;
  const layers = `${scopes}\n[data-intent] {\n  --state-hover: color-mix(in oklab, var(--state-base) 6%, transparent);`;
  for (const rule of [base, tinted, layers]) expect(tokens).toContain(rule);
  // Intents tingidos vencem por especificidade (0,2,0 > 0,1,0) e também vêm depois.
  expect(tokens.indexOf(tinted)).toBeGreaterThan(tokens.indexOf(base));
});

test("tokens.css maps every category color to the intent contract and its state layer", () => {
  const tokens = read("../tokens.css");
  for (const color of CATEGORY_COLORS) {
    const block = tokens.split(`\n[data-category="${color}"] {`)[1]?.split("}")[0];
    expect(block, color).toContain(`--intent-fill: var(--ui-category-${color}-dot);`);
    expect(block, color).toContain(`--intent-subtle: var(--ui-category-${color}-subtle);`);
    expect(block, color).toContain(`--intent-text: var(--ui-category-${color}-text);`);
    expect(block, color).toContain(`--intent-border: var(--ui-category-${color}-border);`);
  }
  const layer = "[data-category] {\n  --state-base: var(--intent-fill);";
  expect(tokens).toContain(layer);
  // vem depois das camadas genéricas, para vencer `[data-intent]` no mesmo nó
  expect(tokens.indexOf(layer)).toBeGreaterThan(tokens.indexOf("[data-intent] {\n  --state-hover"));
});

/** Expansão de chaves sem aninhamento, como `@source inline` do Tailwind. */
function expand(token: string): string[] {
  const m = token.match(/\{([^{}]*)\}/);
  if (!m) return [token];
  return m[1]!.split(",").flatMap((alt) => expand(token.replace(m[0], alt)));
}

test("bridge utilities are safelisted for every role and intent", () => {
  const tokens = read("../tokens.css");
  const inline = [...tokens.matchAll(/@source inline\("([^"]*)"\)/g)].map((m) => m[1]!).join(" ");
  const safelist = new Set(inline.split(/\s+/).filter(Boolean).flatMap(expand));
  const intentRoles = ["intent-fill", "intent-fill-hover", "intent-fill-pressed", "on-intent", "intent-subtle", "intent-text", "intent-border"];
  const wanted = [
    ...[...ROLE_NAMES, ...intentRoles].flatMap((r) => ["bg", "text", "border"].map((p) => `${p}-${r}`)),
    "stroke-intent-fill",
    "hover:bg-intent-fill-hover",
    "active:bg-intent-fill-pressed",
    "hover:bg-state-hover",
    "active:bg-state-pressed",
    "bg-state-selected",
    "rounded-control",
    "h-control-md",
    "shadow-raised",
    "text-caption",
    "motion-transition",
    "motion-press",
  ];
  expect(wanted.filter((u) => !safelist.has(u))).toEqual([]);
});
