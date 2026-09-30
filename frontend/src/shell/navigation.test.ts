import { DEFAULT_ROUTE, NAV_SECTIONS, VIEWS } from "./navigation";
import { en } from "../i18n/catalog/en";

describe("navigation", () => {
  const items = NAV_SECTIONS.flatMap((s) => s.items);

  it("has unique ids, includes the default view and pins global app items to the bottom", () => {
    const ids = items.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_ROUTE.view);
    expect(NAV_SECTIONS.map((s) => [s.id, s.placement])).toEqual([
      ["global", "start"],
      ["app", "end"],
    ]);
  });

  it("does not expose reserved areas or the game workspace without a game (D023, anti-pattern 18)", () => {
    const labels = items.map((e) => en[e.label].toLowerCase());
    for (const reserved of ["downloads", "tools", "collections", "saves", "mods", "overview"]) {
      expect(labels).not.toContain(reserved);
    }
    expect(items).not.toContain(VIEWS.diagnostics);
  });
});
