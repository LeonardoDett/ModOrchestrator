import { GLOBAL_NAVIGATION, DEFAULT_VIEW } from "./navigation";

describe("global navigation", () => {
  it("has unique ids and includes the default view", () => {
    const ids = GLOBAL_NAVIGATION.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_VIEW);
  });

  it("does not expose reserved areas as navigable entries", () => {
    const labels = GLOBAL_NAVIGATION.map((e) => e.label.toLowerCase());
    for (const reserved of ["downloads", "tools", "collections"]) {
      expect(labels).not.toContain(reserved);
    }
  });
});
