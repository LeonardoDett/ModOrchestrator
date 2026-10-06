import { expect, test } from "vitest";
import { normalizeConfig, ThemeConfigError } from "./config";
import type { ThemeConfig } from "./types";

const base: ThemeConfig = { id: "x", label: "X", brand: "#123456" };

test("fills defaults", () =>
  expect(normalizeConfig({ id: "x", label: "X", brand: "#123456" })).toMatchObject({
    vibrance: 0.5,
    shape: "balanced",
    density: "comfortable",
    motion: { ceiling: "expressive" },
  }));
test("fills the remaining defaults", () =>
  expect(normalizeConfig(base)).toMatchObject({
    neutral: "neutral",
    contrast: "standard",
    motion: { ceiling: "expressive", tune: {} },
    font: { sans: "Plus Jakarta Sans", mono: "JetBrains Mono" },
    overrides: { light: {}, dark: {} },
  }));
test("seeds are parsed to OKLCH", () => {
  const n = normalizeConfig({ ...base, accent: "rgb(226 139 85)" });
  expect(n.brand.l).toBeGreaterThan(0);
  expect(n.accent.h).toBeGreaterThan(40);
  expect(n.accent.h).toBeLessThan(70);
});
test("motion shorthand string becomes ceiling", () =>
  expect(normalizeConfig({ id: "x", label: "X", brand: "#123456", motion: "calm" }).motion.ceiling).toBe("calm"));
test("invalid brand throws a descriptive error", () =>
  expect(() => normalizeConfig({ id: "x", label: "X", brand: "teal" })).toThrow(/brand.*"teal"/));
test("errors are ThemeConfigError", () => expect(() => normalizeConfig({ ...base, brand: "teal" })).toThrow(ThemeConfigError));
test("vibrance outside 0..1 throws", () =>
  expect(() => normalizeConfig({ id: "x", label: "X", brand: "#123456", vibrance: 2 })).toThrow(/vibrance/));
test("non-finite vibrance throws", () => expect(() => normalizeConfig({ ...base, vibrance: NaN })).toThrow(/vibrance/));
test("invalid accent throws", () => expect(() => normalizeConfig({ ...base, accent: "nope" })).toThrow(/accent.*"nope"/));
test.each([
  ["neutral", { neutral: "hot" }],
  ["contrast", { contrast: "max" }],
  ["shape", { shape: "round" }],
  ["density", { density: "tight" }],
  ["motion", { motion: "wild" }],
  ["motion.ceiling", { motion: { ceiling: "wild" } }],
])("invalid %s throws", (field, extra) =>
  expect(() => normalizeConfig({ ...base, ...(extra as Partial<ThemeConfig>) })).toThrow(
    new RegExp(field.replace(".", "\\.")),
  ));
test("invalid override role or color throws", () => {
  expect(() => normalizeConfig({ ...base, overrides: { light: { nope: "#fff" } as never } })).toThrow(/overrides\.light/);
  expect(() => normalizeConfig({ ...base, overrides: { dark: { fg: "teal" } } })).toThrow(/overrides\.dark\.fg.*"teal"/);
});
test("motion tune is validated: dev throws, prod clamps", () => {
  const cfg: ThemeConfig = { ...base, motion: { ceiling: "responsive", tune: { calm: { damping: 0, stagger: 10 } } } };
  expect(() => normalizeConfig(cfg)).toThrow(/damping/);
  expect(() => normalizeConfig(cfg, { mode: "dev" })).toThrow(ThemeConfigError);
  expect(normalizeConfig(cfg, { mode: "prod" }).motion).toEqual({
    ceiling: "responsive",
    tune: { calm: { damping: 1, stagger: 10 } },
  });
});
test("seed and enum errors throw even in prod", () =>
  expect(() => normalizeConfig({ ...base, brand: "teal" }, { mode: "prod" })).toThrow(ThemeConfigError));
