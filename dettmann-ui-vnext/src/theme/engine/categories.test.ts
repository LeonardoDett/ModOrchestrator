import { expect, test } from "vitest";
import { parseColor } from "./color/convert";
import { deltaEOK } from "./color/contrast";
import { normalizeConfig } from "./config";
import { CATEGORY_COLORS, categoryRole, MIN_CATEGORY_DOT_DELTA_E } from "./categories";
import { buildRoles } from "./roles";

/** PRNG determinístico (mulberry32), como em `roles.test.ts`. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randomBrand = (i: number): string => {
  const rand = mulberry32(1042 + i);
  return "#" + Array.from({ length: 3 }, () => Math.floor(rand() * 256).toString(16).padStart(2, "0")).join("");
};
const brands = ["#2FC4A0", "#ffff00", "#0a0a0a", "#fafafa", "#808080", ...Array.from({ length: 120 }, (_, i) => randomBrand(i))];
const color = (hex: string) => parseColor(hex)!;

test("16 stable category colors", () => {
  expect(CATEGORY_COLORS).toHaveLength(16);
  expect(new Set(CATEGORY_COLORS).size).toBe(16);
});

test.each(brands)("category dots stay visible and neighbours differ in lightness for %s", (brand) => {
  for (const contrast of ["standard", "high"] as const)
    for (const mode of ["light", "dark"] as const) {
      const { roles } = buildRoles(normalizeConfig({ id: "t", label: "t", brand, contrast }), mode);
      const where = `${brand} ${contrast} ${mode}`;
      const dots = CATEGORY_COLORS.map((c) => color(roles[categoryRole(c, "dot")]));
      for (const [i, dot] of dots.entries()) {
        for (const surface of ["canvas", "surface"] as const)
          expect(deltaEOK(dot, color(roles[surface])), `${where} ${CATEGORY_COLORS[i]} vs ${surface}`).toBeGreaterThanOrEqual(
            MIN_CATEGORY_DOT_DELTA_E - 0.005,
          );
        if (i > 0) expect(Math.abs(dot.l - dots[i - 1]!.l), `${where} ${CATEGORY_COLORS[i]} vs previous`).toBeGreaterThanOrEqual(0.05);
      }
      const gray = color(roles["category-gray-dot"]);
      const graphite = color(roles["category-graphite-dot"]);
      expect(Math.abs(gray.l - graphite.l), `${where} gray vs graphite`).toBeGreaterThanOrEqual(0.12);
    }
});

test("category colors carry no brand hue: the palette is the same for any brand up to the neutral tint", () => {
  const a = buildRoles(normalizeConfig({ id: "a", label: "a", brand: "#2FC4A0" }), "light").roles;
  const b = buildRoles(normalizeConfig({ id: "b", label: "b", brand: "#C42F6B" }), "light").roles;
  for (const c of CATEGORY_COLORS) {
    if (c === "gray" || c === "graphite") continue;
    const hueA = color(a[categoryRole(c, "dot")]).h;
    const hueB = color(b[categoryRole(c, "dot")]).h;
    expect(Math.abs(hueA - hueB), c).toBeLessThan(3);
  }
});
