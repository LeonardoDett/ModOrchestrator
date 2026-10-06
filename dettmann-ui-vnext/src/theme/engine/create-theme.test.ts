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
  expect(toCSS(createTheme(cfg), { root: true })).toMatch(/^:root,\[data-theme="t"\]\{/);
});
