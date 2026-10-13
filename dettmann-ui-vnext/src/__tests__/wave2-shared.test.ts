import { describe, expect, it } from "vitest";
import { intentIcon } from "../icons/intent-icon";
import { INTENTS } from "../theme/emphasis";
import { fadeEnter, fadeExit, overlayEnter, overlayExit, slideEnter, slideExit } from "../motion/overlay-keyframes";
import type { MotionValues } from "../motion/read-motion";

const m = { amp: 1 } as MotionValues;

describe("intentIcon", () => {
  it("maps every intent to a glyph", () => {
    for (const intent of INTENTS) expect(intentIcon(intent)).toBeTruthy();
    expect(intentIcon("success")).not.toBe(intentIcon("danger"));
    expect(intentIcon("warning")).not.toBe(intentIcon("info"));
  });
});

describe("overlay keyframes", () => {
  it("enter goes from transparent to rest; exit is the reverse", () => {
    for (const [enter, exit] of [
      [overlayEnter, overlayExit],
      [fadeEnter, fadeExit],
      [slideEnter("left"), slideExit("left")],
    ] as const) {
      const frames = enter(m);
      expect(frames[0]!.opacity).toBe(0);
      expect(frames.at(-1)!.opacity).toBe(1);
      expect(exit(m)).toEqual([...frames].reverse());
    }
  });

  it("overlay scales with the motion amplitude and rests at identity", () => {
    expect(overlayEnter(m)[0]!.transform).toBe("scale(0.96)");
    expect(overlayEnter({ amp: 0.45 } as MotionValues)[0]!.transform).toBe("scale(0.982)");
    expect(overlayEnter(m)[1]!.transform).toBe("scale(1)");
  });

  it("slide comes from its side", () => {
    expect(slideEnter("left")(m)[0]!.transform).toBe("translate(-16px, 0px)");
    expect(slideEnter("right")(m)[0]!.transform).toBe("translate(16px, 0px)");
    expect(slideEnter("top")(m)[0]!.transform).toBe("translate(0px, -16px)");
    expect(slideEnter("bottom")(m)[0]!.transform).toBe("translate(0px, 16px)");
    expect(slideEnter("left")(m)[1]!.transform).toBe("translate(0px, 0px)");
  });
});
