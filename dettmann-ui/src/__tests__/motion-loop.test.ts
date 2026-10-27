import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { REDUCED_LOOP, animateLoop } from "../motion";

function reset() {
  delete document.documentElement.dataset.reduceMotion;
  document.body.innerHTML = "";
}

beforeEach(reset);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  reset();
});

function stubbed(style?: string) {
  const el = document.createElement("div");
  if (style) el.setAttribute("style", style);
  document.body.append(el);
  const spy = vi.fn((..._args: unknown[]) => ({}) as Animation);
  (el as unknown as { animate: unknown }).animate = spy;
  return { el, spy };
}

test("animateLoop runs forever with the given period and linear easing by default", () => {
  const { el, spy } = stubbed();
  animateLoop(el, [{ rotate: "0deg" }, { rotate: "360deg" }], { period: 1000, delay: 40 });
  expect(spy.mock.calls[0]![1]).toMatchObject({ duration: 1000, iterations: Infinity, easing: "linear", delay: 40 });
});

test("timing stays linear (never --motion-ease) and per-keyframe easings pass through", () => {
  const { el, spy } = stubbed("--motion-ease: cubic-bezier(0.1, 0.2, 0.3, 0.4)");
  const frames: Keyframe[] = [{ opacity: 0, easing: "ease-in-out" }, { opacity: 1, easing: "ease-in-out" }, { opacity: 0 }];
  animateLoop(el, frames, { period: 800 });
  expect(spy.mock.calls[0]![0]).toEqual(frames);
  expect(spy.mock.calls[0]![1]).toMatchObject({ easing: "linear" });
});

test("keyframes as function receive MotionValues (amp)", () => {
  const { el, spy } = stubbed("--motion-amp: 1.6");
  const fn = vi.fn((m: { amp: number }) => [{ translate: `0 ${m.amp}px` }, { translate: "0 0" }]);
  animateLoop(el, fn, { period: 500 });
  expect(fn.mock.calls[0]![0]).toMatchObject({ amp: 1.6 });
  expect(spy.mock.calls[0]![0]).toEqual([{ translate: "0 1.6px" }, { translate: "0 0" }]);
});

test("under data-reduce-motion=true it ignores keyframes and pulses opacity slowly", () => {
  document.documentElement.dataset.reduceMotion = "true";
  const { el, spy } = stubbed();
  animateLoop(el, [{ rotate: "0deg" }, { rotate: "360deg" }], { period: 1000 });
  expect(spy.mock.calls[0]![0]).toEqual([{ opacity: 1 }, { opacity: 0.5 }, { opacity: 1 }]);
  expect(spy.mock.calls[0]![1]).toMatchObject({ duration: 2000, iterations: Infinity, easing: "ease-in-out" });
  expect(REDUCED_LOOP.duration).toBe(2000);
});

test("returns null without WAAPI", () => expect(animateLoop(document.createElement("div"), [], { period: 1000 })).toBeNull());

test("period <= 0 throws in dev and returns null in production", () => {
  const { el, spy } = stubbed();
  expect(() => animateLoop(el, [{ opacity: 0 }, { opacity: 1 }], { period: 0 })).toThrow(/period/);
  vi.stubEnv("NODE_ENV", "production");
  expect(animateLoop(el, [{ opacity: 0 }, { opacity: 1 }], { period: -5 })).toBeNull();
  expect(spy).not.toHaveBeenCalled();
});
