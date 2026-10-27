import { expect, test } from "vitest";
import { createTheme } from "./create-theme";
import { contrastReport } from "./roles";
import { withSeed } from "./seed";
import type { ThemeConfig } from "./types";

const base: ThemeConfig = {
  id: "app",
  label: "App",
  brand: "#2FC4A0",
  accent: "#E28B55",
  neutral: "cool",
  vibrance: 0.6,
  shape: "balanced",
  density: "compact",
  overrides: { dark: { "brand-fill": "#2FC4A0" } },
};

test("invalid or missing seed returns the same config", () => {
  expect(withSeed(base, undefined, "x")).toBe(base);
  expect(withSeed(base, "", "x")).toBe(base);
  expect(withSeed(base, "teal", "x")).toBe(base);
});

test("valid seed keeps shape, density and neutral, re-derives accent and drops overrides", () => {
  const seeded = withSeed(base, "#7FA6D9", "game-skyrimse");
  expect(seeded).toMatchObject({ id: "game-skyrimse", brand: "#7FA6D9", neutral: "cool", vibrance: 0.6, shape: "balanced", density: "compact" });
  expect(seeded.accent).toBeUndefined();
  expect(seeded.overrides).toBeUndefined();
  expect(base.brand).toBe("#2FC4A0");
});

test.each(["#7FA6D9", "#C9A227", "#ED5286", "#9B78E5", "#ffff00", "#0a0a0a", "#fafafa", "#808080"])(
  "seed %s produces a theme that passes every contrast target without warnings",
  (seed) => {
    for (const contrast of ["standard", "high"] as const) {
      const theme = createTheme(withSeed({ ...base, contrast }, seed, "game"));
      expect(theme.warnings).toEqual([]);
      for (const mode of ["light", "dark"] as const)
        expect(contrastReport(theme[mode], contrast).filter((r) => !r.pass)).toEqual([]);
    }
  },
);
