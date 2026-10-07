import { expect, test } from "vitest";
import { createTheme, toCSS } from "./index";
import type { ThemeConfig } from "./index";

const cfg: ThemeConfig = { id: "t", label: "T", brand: "#16824f" };
test("createTheme is deterministic", () => expect(createTheme(cfg)).toEqual(createTheme(cfg)));
test("shape knob maps to radius table", () => {
  expect(createTheme({ ...cfg, shape: "precise" }).shared["radius-control"]).toBe("6px");
  expect(createTheme(cfg).shared["radius-card"]).toBe("12px");
  expect(createTheme({ ...cfg, shape: "soft" }).shared["radius-chip"]).toBe("9999px");
});
test("density knob maps to control heights", () => expect(createTheme({ ...cfg, density: "compact" }).shared["control-md"]).toBe("32px"));
test("font knob is honored with fallbacks", () => expect(createTheme(cfg).shared["font-sans"]).toMatch(/^"Plus Jakarta Sans", /));
test("ceiling flattens expressive in CSS vars", () => {
  const t = createTheme({ ...cfg, motion: "responsive" });
  expect(t.shared["motion-expressive-ease"]).toBe(t.shared["motion-responsive-ease"]);
});
test("override is applied and a contrast-breaking override warns", () => {
  const t = createTheme({ ...cfg, overrides: { light: { "on-emphasis": "#777777" } } });
  expect(t.light["on-emphasis"]).toBe("#777777");
  expect(t.warnings.join()).toMatch(/on-emphasis/);
});
test("brand override propagates to emphasis unless overridden", () => {
  const t = createTheme({ ...cfg, overrides: { light: { "brand-fill": "#ABCDEF" } } });
  expect(t.light["brand-fill"]).toBe("#abcdef");
  expect(t.light["emphasis-fill"]).toBe("#abcdef");
  const u = createTheme({ ...cfg, overrides: { light: { "brand-fill": "#abcdef", "emphasis-fill": "#123456" } } });
  expect(u.light["emphasis-fill"]).toBe("#123456");
});
test("on-brand override propagates to on-emphasis unless overridden", () => {
  const t = createTheme({ ...cfg, overrides: { light: { "on-brand": "#FAFAFA" } } });
  expect(t.light["on-brand"]).toBe("#fafafa");
  expect(t.light["on-emphasis"]).toBe("#fafafa");
  const u = createTheme({ ...cfg, overrides: { light: { "on-brand": "#fafafa", "on-emphasis": "#ffffff" } } });
  expect(u.light["on-emphasis"]).toBe("#ffffff");
});
test("typography and elevation keys", () => {
  const t = createTheme(cfg);
  expect(t.shared["text-caption"]).toBe("11px");
  expect(t.shared["text-caption-leading"]).toBe("16px");
  expect(t.light["shadow-flat"]).toBe("none");
  expect(t.light["shadow-raised"]).not.toBe(t.dark["shadow-raised"]);
});
test("toCSS emits light and dark blocks with --ui- prefix", () => {
  const css = toCSS(createTheme(cfg));
  expect(css).toContain('[data-theme="t"]{');
  expect(css).toContain('.dark [data-theme="t"]');
  expect(css).toMatch(/--ui-canvas:#[0-9a-f]{6};/);
  expect(css).not.toMatch(/NaN|undefined/);
  expect(toCSS(createTheme(cfg), { root: true })).toMatch(/^:where\(:root\),\[data-theme="t"\]\{/);
});
test("dark selector list covers every way a theme meets dark mode", () => {
  for (const css of [toCSS(createTheme(cfg)), toCSS(createTheme(cfg), { root: true })]) {
    const dark = css.split("\n")[1]!;
    const selectors = dark.slice(0, dark.indexOf("{")).replace(/^:where\([^)]*\),/, "").split(",");
    expect(selectors).toEqual([
      '.dark [data-theme="t"]',
      '.dark[data-theme="t"]',
      '[data-theme="t"][data-ui-mode="dark"]',
      '[data-ui-mode="dark"] [data-theme="t"]',
      '[data-theme="t"] [data-ui-mode="dark"]',
    ]);
  }
});
test("root selectors are zero-specificity so other themes always win", () => {
  const t = createTheme(cfg);
  const u = createTheme({ ...cfg, id: "u" });
  const rootCss = toCSS(t, { root: true });
  expect(rootCss).toContain('\n:where(.dark, [data-ui-mode="dark"]),.dark [data-theme="t"],');
  for (const css of [rootCss + toCSS(u), toCSS(u) + rootCss]) {
    const selectors = css.split("\n").filter(Boolean).map((l) => l.slice(0, l.indexOf("{")));
    expect(selectors).toHaveLength(6);
    for (const sel of selectors) {
      if (sel.endsWith('[data-ui-mode="light"]')) {
        // Claro forçado: sempre preso ao próprio data-theme, nunca vaza para outro tema.
        expect(sel).toMatch(/^\[data-theme="[tu]"\]\[data-ui-mode="light"\]$/);
        continue;
      }
      const isU = sel.includes('data-theme="u"');
      expect(sel.includes(":where(")).toBe(!isU);
      if (!isU) expect(sel.replace(/:where\([^)]*\)/g, "")).not.toMatch(/^(:root|\.dark)/);
    }
  }
});
test("forced light rule comes after dark and carries only per-mode light roles", () => {
  const t = createTheme(cfg);
  for (const css of [toCSS(t), toCSS(t, { root: true })]) {
    const lines = css.split("\n").filter(Boolean);
    expect(lines).toHaveLength(3);
    const forced = lines[2]!;
    expect(forced.startsWith('[data-theme="t"][data-ui-mode="light"]{')).toBe(true);
    expect(forced).toContain(`--ui-canvas:${t.light.canvas};`);
    expect(forced).not.toContain("--ui-radius-");
    expect(forced).not.toContain("--ui-font-");
  }
});
test("dark override applies to dark only", () => {
  const t = createTheme({ ...cfg, overrides: { dark: { canvas: "#101010" } } });
  expect(t.dark.canvas).toBe("#101010");
  expect(t.light.canvas).not.toBe("#101010");
});
test("dark shadow alpha values", () => {
  const t = createTheme(cfg);
  expect(t.dark["shadow-raised"]).toContain("/ 0.3)");
  expect(t.dark["shadow-overlay"]).toContain("/ 0.4)");
  expect(t.dark["shadow-modal"]).toContain("/ 0.5)");
});
test("density-scale per density", () => {
  expect(createTheme({ ...cfg, density: "compact" }).shared["density-scale"]).toBe("0.875");
  expect(createTheme(cfg).shared["density-scale"]).toBe("1");
  expect(createTheme({ ...cfg, density: "spacious" }).shared["density-scale"]).toBe("1.125");
});
test("override warning names pair and measured ratio", () => {
  const t = createTheme({ ...cfg, overrides: { light: { "on-emphasis": "#777777" } } });
  expect(t.warnings.join("\n")).toMatch(/light: override contrast on-emphasis on emphasis-fill\S* is \d+\.\d{2}:1 \(target/);
});
