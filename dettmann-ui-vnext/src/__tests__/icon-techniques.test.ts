import { expect, test } from "vitest";
import type { MotionValues } from "../motion";
import { draw, flip, lift, nudge, pulse, rotate, spin, squash, stagger, trail, undraw } from "../icons/techniques";
import type { Technique, TechniqueContext } from "../icons/types";

const mv = (amp: number): MotionValues => ({
  ease: "linear",
  duration: 160,
  springDuration: 400,
  amp,
  press: 0.96,
  stagger: 40,
  reduced: false,
});
const levels = { calm: mv(0.45), responsive: mv(1), expressive: mv(1.6) };
const actionCtx: TechniqueContext = { mode: "action", index: 0 };
const loopCtx: TechniqueContext = { mode: "loop", index: 0 };

const ALL: Technique[] = [
  squash(),
  lift({ x: 1, y: -2, rotate: 8 }),
  nudge(),
  nudge({ y: 2 }),
  rotate({ deg: 20 }),
  spin(),
  draw(),
  draw({ from: "end" }),
  undraw(),
  flip(),
  flip({ axis: "x", deg: 90 }),
  trail(),
  pulse(),
];
const ACTION = ALL.filter((t) => t.modes.includes("action"));
const LOOP = ALL.filter((t) => t.modes.includes("loop"));

const num = (v: unknown) => parseFloat(String(v));
function parts(f: Keyframe) {
  const out = { translate: 0, rotate: 0, scale: 0, dash: 0 };
  if (f.translate) out.translate = Math.max(...String(f.translate).split(" ").map((s) => Math.abs(num(s))));
  if (f.rotate) out.rotate = Math.abs(num(f.rotate));
  if (f.scale) out.scale = Math.abs(num(f.scale) - 1);
  if (typeof f.transform === "string") {
    const mt = /rotate[XY]\((-?[\d.]+)deg\)/.exec(f.transform);
    if (mt) out.rotate = Math.abs(num(mt[1]));
  }
  if (f.strokeDashoffset !== undefined) out.dash = Math.abs(num(f.strokeDashoffset));
  return out;
}
const magnitude = (frames: Keyframe[]) =>
  Math.max(...frames.map(parts).map((p) => p.translate + p.rotate + p.scale + p.dash));
const isRest = (f: Keyframe) => {
  const p = parts(f);
  return p.translate === 0 && p.rotate === 0 && p.scale === 0 && p.dash === 0 && (f.opacity === undefined || f.opacity === 1);
};
const withName = (list: Technique[]) => list.map((t) => [`${t.kind}#${ALL.indexOf(t)}`, t] as const);

test.each(withName(ALL))("%s scales magnitude with amp (calm < responsive < expressive)", (_n, t) => {
  const mag = (m: MotionValues) => {
    const ctx = t.modes.includes("action") ? actionCtx : loopCtx;
    return magnitude(t.run(m, ctx).keyframes);
  };
  if (t.kind === "draw" || t.kind === "undraw") {
    expect(mag(levels.calm)).toBe(mag(levels.expressive));
    return;
  }
  if (t.exempt) return; // spin e flip: gesto completo, isentos
  expect(mag(levels.calm)).toBeLessThan(mag(levels.responsive));
  expect(mag(levels.responsive)).toBeLessThan(mag(levels.expressive));
});

test.each(withName(ACTION))("%s action ends at rest", (_n, t) => {
  const frames = t.run(levels.responsive, actionCtx).keyframes;
  expect(isRest(frames[frames.length - 1]!)).toBe(true);
});

test.each(["draw", "undraw", "trail"] as const)("%s provides reduced opacity frames in action", (kind) => {
  const t = ALL.find((x) => x.kind === kind)!;
  expect(t.run(levels.responsive, actionCtx).reduced).toEqual([{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }]);
});

test.each(withName(LOOP))("%s loop has a period", (_n, t) => {
  expect(t.run(levels.responsive, loopCtx).period).toBeGreaterThan(0);
});

test("spin only supports loop; squash only action", () => {
  expect(spin().modes).toEqual(["loop"]);
  expect(squash().modes).toEqual(["action"]);
  expect(spin().run(levels.responsive, loopCtx).easing).toBe("linear");
});

test("defaults match the spec", () => {
  expect(squash().run(levels.responsive, actionCtx).keyframes[1]).toEqual({ scale: String(1 - 0.12) });
  expect(nudge().run(levels.responsive, actionCtx).keyframes[1]).toEqual({ translate: "1.8px 0px" });
  expect(spin().run(levels.responsive, loopCtx)).toMatchObject({ period: 1000 });
  expect(pulse().run(levels.responsive, loopCtx)).toMatchObject({ period: 1600 });
  expect(draw({ from: "end" }).run(levels.responsive, actionCtx).keyframes[0]).toMatchObject({ strokeDashoffset: -1 });
  expect(flip().run(levels.responsive, actionCtx).keyframes[1]!.transform).toContain("perspective(48px) rotateY(180deg)");
  expect(lift({ y: -1 }).delay).toBe(0);
  expect(lift({ y: -1, delay: 30 }).delay).toBe(30);
});

test.each(withName(ALL))("%s extent at amp 1 matches the largest keyframe value", (_n, t) => {
  const ctx = t.modes.includes("action") ? actionCtx : loopCtx;
  const ps = t.run(levels.responsive, ctx).keyframes.map(parts);
  expect(t.extent.translate).toBeCloseTo(Math.max(...ps.map((p) => p.translate)));
  expect(t.extent.rotate).toBeCloseTo(Math.max(...ps.map((p) => p.rotate)));
  expect(t.extent.scale).toBeCloseTo(Math.max(...ps.map((p) => p.scale)));
});

test("stagger assigns increasing index", () => {
  const c = stagger(["a", "b", "c"], nudge());
  expect([c.a, c.b, c.c].map((t) => (t as Technique).index)).toEqual([0, 1, 2]);
  expect((c.b as Technique).kind).toBe("nudge");
});
