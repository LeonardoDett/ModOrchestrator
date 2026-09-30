import { DEFAULT_ROUTE, NAV_SECTIONS, VIEWS, buildSections } from "./navigation";
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
    expect(buildSections(undefined)).toBe(NAV_SECTIONS);
    expect(buildSections([])).toBe(NAV_SECTIONS);
  });

  it("shows exactly the workspace screens the backend sent, in its order (core/11 §5)", () => {
    const generic = buildSections(["overview", "mods", "conflicts", "profiles", "diagnostics"]);
    expect(generic.map((s) => s.id)).toEqual(["global", "workspace", "app"]);
    const ids = generic[1]!.items.map((e) => e.id);
    expect(ids).toEqual(["overview", "mods", "conflicts", "profiles", "diagnostics"]);
    expect(ids).not.toContain("plugins");

    const withPlugins = buildSections(["overview", "mods", "plugins", "load_order", "diagnostics"]);
    expect(withPlugins[1]!.items.map((e) => e.id)).toEqual(["overview", "mods", "plugins", "load_order", "diagnostics"]);
  });

  it("ignores ids it does not know instead of inventing screens", () => {
    const sections = buildSections(["overview", "saves", "downloads"]);
    expect(sections[1]!.items.map((e) => e.id)).toEqual(["overview"]);
  });
});
