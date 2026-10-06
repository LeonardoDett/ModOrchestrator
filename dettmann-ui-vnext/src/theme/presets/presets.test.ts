import { expect, test } from "vitest";
import { createTheme, ROLE_NAMES } from "../engine";
import { DEFAULT_PRESET, PRESETS, renderPresetsCSS, type PresetId } from "./index";

// Sem @types/node no projeto: especificador não literal, tipado localmente.
const NODE_FS: string = "node:fs";
const fs = (await import(/* @vite-ignore */ NODE_FS)) as { readFileSync(path: string, encoding: "utf8"): string };

const ids = Object.keys(PRESETS) as PresetId[];
const lf = (s: string) => s.replace(/\r\n/g, "\n");

test("default preset is forest and all five presets exist", () => {
  expect(DEFAULT_PRESET).toBe("forest");
  expect(ids).toEqual(["forest", "graphite", "orchestrator", "ember", "ink"]);
  for (const id of ids) expect(PRESETS[id]).toMatchObject({ id, label: id[0]!.toUpperCase() + id.slice(1) });
});

test.each(ids)("preset %s resolves without warnings", (id) => expect(createTheme(PRESETS[id]).warnings).toEqual([]));

test.each(ids)("preset %s matches snapshot", (id) => expect(createTheme(PRESETS[id])).toMatchSnapshot());

test("renderPresetsCSS starts with the header and forest as the root theme", () => {
  const css = renderPresetsCSS();
  expect(css.startsWith("/* gerado por scripts/theme/generate.ts — não editar */\n")).toBe(true);
  expect(css).toContain(':where(:root),[data-theme="forest"]{');
  for (const id of ids.slice(1)) {
    expect(css).toContain(`[data-theme="${id}"]{`);
    expect(css).not.toContain(`:where(:root),[data-theme="${id}"]`);
  }
});

test("generated CSS is up to date", () => {
  expect(lf(fs.readFileSync("src/styles/theme/themes.generated.css", "utf8"))).toBe(lf(renderPresetsCSS()));
});

test("tokens.css exposes every generated role as a Tailwind color", () => {
  const tokens = lf(fs.readFileSync("src/theme/tokens.css", "utf8"));
  for (const role of ROLE_NAMES) expect(tokens).toContain(`--color-${role}: var(--ui-${role});`);
});

test("tokens.css maps neutral and brand intents to their roles", () => {
  const tokens = lf(fs.readFileSync("src/theme/tokens.css", "utf8"));
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
