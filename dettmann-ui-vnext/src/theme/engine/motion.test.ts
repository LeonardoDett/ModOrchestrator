import { expect, test } from "vitest";
import {
  MOTION_DEFAULTS,
  motionVars,
  resolveMotionSpecs,
  springToLinear,
  validateMotionSpec,
} from "./motion";

test("spring easing starts at 0 and ends at 1", () => {
  const { easing } = springToLinear(MOTION_DEFAULTS.expressive);
  expect(easing).toMatch(/^linear\(0(,|\s)/);
  expect(easing).toMatch(/1\)$/);
});
test("critically damped calm spring has no overshoot", () =>
  expect(springToLinear(MOTION_DEFAULTS.calm).overshoot).toBeLessThan(0.005));
test("overshoot grows as damping drops", () => {
  const r = springToLinear(MOTION_DEFAULTS.responsive).overshoot,
    e = springToLinear(MOTION_DEFAULTS.expressive).overshoot;
  expect(r).toBeGreaterThan(0.03);
  expect(e).toBeGreaterThan(r);
  expect(e).toBeLessThan(0.35);
});
test("point count is bounded", () =>
  expect(
    springToLinear(MOTION_DEFAULTS.expressive, { maxPoints: 40 }).easing.split(",").length,
  ).toBeLessThanOrEqual(40));
test("duration is time to rest within tolerance, in ms", () => {
  const d = springToLinear(MOTION_DEFAULTS.expressive).duration;
  expect(d).toBeGreaterThan(300);
  expect(d).toBeLessThan(2000);
  expect(Number.isInteger(d)).toBe(true);
});
test("ceiling clamps levels above it to the ceiling spec", () => {
  const s = resolveMotionSpecs("responsive");
  expect(s.expressive).toEqual(s.responsive);
});
test("tune merges per level and keeps the rest", () => {
  const s = resolveMotionSpecs("expressive", { expressive: { damping: 10 } });
  expect(s.expressive.damping).toBe(10);
  expect(s.expressive.stiffness).toBe(260);
});
test("tune applies before the ceiling clamp", () => {
  const s = resolveMotionSpecs("responsive", { responsive: { damping: 30 } });
  expect(s.expressive.damping).toBe(30);
});
test("invalid spec throws in dev and clamps in prod", () => {
  expect(() => validateMotionSpec({ damping: 0 }, "dev")).toThrow(/damping/);
  expect(validateMotionSpec({ damping: -1, pressScale: 2 }, "prod")).toEqual({
    damping: 1,
    pressScale: 1,
  });
  expect(validateMotionSpec({ damping: 5 }, "dev")).toEqual({ damping: 5 });
});
test("motionVars emits ms and unitless values", () => {
  const v = motionVars(resolveMotionSpecs("expressive"));
  expect(v["motion-calm-duration"]).toBe("160ms");
  expect(v["motion-expressive-amp"]).toBe("1.6");
  expect(v["motion-expressive-ease"]).toMatch(/^linear\(/);
  expect(v["motion-expressive-spring-duration"]).toMatch(/ms$/);
});
test("explicit positions only appear when off the uniform grid", () => {
  const { easing } = springToLinear(MOTION_DEFAULTS.expressive);
  expect(easing).toMatch(/\d%/);
  expect(easing).not.toMatch(/NaN|Infinity/);
});
