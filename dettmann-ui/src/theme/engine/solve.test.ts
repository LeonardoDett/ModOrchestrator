import { expect, test } from "vitest";
import { apcaContrast, wcagContrast } from "./color/contrast";
import { parseColor, toHex } from "./color/convert";
import { solveLightness } from "./solve";

const white = parseColor("#ffffff")!;
const black = parseColor("#000000")!;

test("keeps the color when it already meets the target", () => {
  const r = solveLightness(parseColor("#16824f")!, [white], 4.5, "darker");
  expect(r.met).toBe(true);
  expect(toHex(r.color)).toBe("#16824f");
});
test("darkens until the target is met against every background", () => {
  const start = parseColor("#7fb3d5")!;
  const bgs = [white, parseColor("#f0f0f0")!];
  const r = solveLightness(start, bgs, 7, "darker");
  expect(r.met).toBe(true);
  expect(r.color.l).toBeLessThan(start.l);
  for (const bg of bgs) expect(wcagContrast(r.color, bg)).toBeGreaterThanOrEqual(7);
  // a busca para perto da meta, não no extremo
  expect(Math.min(...bgs.map((bg) => wcagContrast(r.color, bg)))).toBeLessThan(7.3);
});
test("lightens against dark backgrounds", () => {
  const r = solveLightness(parseColor("#335577")!, [black], 9, "lighter");
  expect(r.met).toBe(true);
  expect(wcagContrast(r.color, black)).toBeGreaterThanOrEqual(9);
});
test("reports met=false when even the extreme fails", () => {
  const r = solveLightness(parseColor("#777777")!, [parseColor("#202020")!], 30, "lighter");
  expect(r.met).toBe(false);
  expect(toHex(r.color)).toBe("#ffffff");
});
test("accepts a custom metric", () => {
  const r = solveLightness(parseColor("#888888")!, [white], 90, "darker", apcaContrast);
  expect(r.met).toBe(true);
  expect(apcaContrast(r.color, white)).toBeGreaterThanOrEqual(90);
});
test("result is snapped to the 8-bit sRGB color it will be emitted as", () => {
  const r = solveLightness({ l: 0.9, c: 0.3, h: 145 }, [white], 4.5, "darker");
  expect(parseColor(toHex(r.color))).toEqual(r.color);
});
