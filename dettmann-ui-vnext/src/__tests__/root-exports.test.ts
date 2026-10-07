import { describe, expect, test } from "vitest";
import * as root from "../index";

describe("root exports", () => {
  test("engine helpers used by consumers and the playground are exported from the root", () => {
    for (const name of [
      "contrastReport",
      "CONTRAST_PAIRS",
      "CONTRAST_TARGETS",
      "ROLE_NAMES",
      "COLOR_INTENTS",
      "MOTION_DEFAULTS",
      "MOTION_LEVELS",
      "parseColor",
      "toHex",
    ]) {
      expect(root, name).toHaveProperty(name);
    }
    expect(root.toHex(root.parseColor("#FF0000")!)).toBe("#ff0000");
  });
});
