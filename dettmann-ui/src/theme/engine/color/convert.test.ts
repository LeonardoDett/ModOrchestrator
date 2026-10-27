import { expect, test } from "vitest";
import { clampChroma, inGamut, parseColor, toHex } from "./convert";

test("round-trips sRGB primaries through OKLCH", () => {
  for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#ffffff", "#000000", "#16824f"])
    expect(toHex(parseColor(hex)!)).toBe(hex);
});
test("matches reference OKLCH for #ff0000", () => {
  const c = parseColor("#ff0000")!;
  expect(c.l).toBeCloseTo(0.628, 3);
  expect(c.c).toBeCloseTo(0.2577, 3);
  expect(c.h).toBeCloseTo(29.23, 1);
});
test.each(["#abc", "#AABBCC", "#aabbccdd", " rgb(22 130 79) ", "rgba(22,130,79,0.5)", "hsl(152 71% 30%)", "oklch(0.52 0.12 155)"])(
  "parses %s",
  (input) => expect(parseColor(input)).not.toBeNull(),
);
test.each(["teal", "", "#ggg", "rgb(1,2)"])("rejects %s", (input) => expect(parseColor(input)).toBeNull());
test("achromatic colors have c=0 and h=0", () => {
  const g = parseColor("#808080")!;
  expect(g.c).toBe(0);
  expect(g.h).toBe(0);
});
test("clampChroma brings out-of-gamut colors into sRGB keeping hue", () => {
  const out = clampChroma({ l: 0.7, c: 0.4, h: 150 });
  expect(inGamut(out)).toBe(true);
  expect(out.h).toBe(150);
  expect(out.l).toBe(0.7);
});
test.each(["oklch(0.5 0.1 1e999)", "oklch(1e999 0.1 30)", "rgb(1e999 0 0)", "hsl(1e400 50% 50%)"])(
  "rejects non-finite numbers in %s",
  (input) => expect(parseColor(input)).toBeNull(),
);
