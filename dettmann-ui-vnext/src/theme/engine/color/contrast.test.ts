import { expect, test } from "vitest";
import { apcaContrast, deltaEOK, wcagContrast } from "./contrast";
import { parseColor } from "./convert";

test("WCAG black/white is 21", () => expect(wcagContrast(parseColor("#000")!, parseColor("#fff")!)).toBeCloseTo(21, 1));
test("WCAG is symmetric", () => {
  const a = parseColor("#16824f")!, b = parseColor("#ffffff")!;
  expect(wcagContrast(a, b)).toBeCloseTo(wcagContrast(b, a), 6);
});
test("APCA black on white ≈ 106", () => expect(apcaContrast(parseColor("#000")!, parseColor("#fff")!)).toBeCloseTo(106.04, 0));
test("APCA #888 on #fff ≈ 63", () => expect(apcaContrast(parseColor("#888")!, parseColor("#fff")!)).toBeCloseTo(63.06, 0));
test("deltaEOK is 0 for identical and >0 for different", () => {
  const a = parseColor("#ff0000")!, b = parseColor("#00ff00")!;
  expect(deltaEOK(a, a)).toBe(0);
  expect(deltaEOK(a, b)).toBeGreaterThan(0.3);
  expect(deltaEOK(a, b)).toBeCloseTo(deltaEOK(b, a), 12);
});
