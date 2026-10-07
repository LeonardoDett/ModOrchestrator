import { expect, test } from "vitest";
import { EMPHASES, EMPHASIS_MOTION, INTENTS, intentData, resolveEmphasis, restingClassName } from "./emphasis";

test("high without intent resolves to brand + expressive", () =>
  expect(resolveEmphasis({ emphasis: "high" })).toMatchObject({ intent: "brand", motion: "expressive", attrs: { "data-layer": "high" } }));
test("explicit neutral high is respected", () =>
  expect(resolveEmphasis({ emphasis: "high", intent: "neutral" }).className).toContain("bg-fg"));
test("medium danger uses subtle classes", () =>
  expect(resolveEmphasis({ emphasis: "medium", intent: "danger" }).className).toContain("bg-intent-subtle"));
test("default is medium neutral responsive", () =>
  expect(resolveEmphasis({})).toMatchObject({ emphasis: "medium", intent: "neutral", motion: "responsive" }));
test("motion override wins", () => expect(resolveEmphasis({ emphasis: "low", motion: "expressive" }).motion).toBe("expressive"));
test("every emphasis × intent combination yields classes and attrs", () => {
  for (const e of EMPHASES)
    for (const i of INTENTS) {
      const r = resolveEmphasis({ emphasis: e, intent: i });
      expect(r.className.length).toBeGreaterThan(0);
      expect(r.attrs).toEqual({ "data-intent": i, "data-layer": e, "data-motion": EMPHASIS_MOTION[e] });
    }
});
test("defaults param is used when input is empty", () =>
  expect(resolveEmphasis({}, { emphasis: "low", intent: "info" })).toMatchObject({ emphasis: "low", intent: "info", motion: "calm" }));
test("intentData emits only explicit intent", () => {
  expect(intentData()).toEqual({});
  expect(intentData("danger")).toEqual({ "data-intent": "danger" });
});
test("resting classes drop hover/active states", () => {
  const resting = restingClassName(resolveEmphasis({ emphasis: "low", intent: "danger" }));
  expect(resting).toBe("bg-transparent text-intent-text");
});
