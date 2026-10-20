import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_END, APP_START, DEFAULT_ROUTE, GROUP_LABELS, workspaceGroups } from "./navigation";
import { en } from "../i18n/catalog/en";

describe("navigation (D120)", () => {
  const appItems = [...APP_START, ...APP_END];

  it("app level has unique ids, includes the default view and no game screen", () => {
    const ids = appItems.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_ROUTE.view);
    const labels = appItems.map((e) => en[e.label].toLowerCase());
    for (const reserved of ["downloads", "tools", "collections", "saves", "mods", "overview"]) {
      expect(labels).not.toContain(reserved);
    }
  });

  it("renders exactly the groups and items the backend sent, in its order (core/11 §5)", () => {
    const groups = workspaceGroups(
      [
        { id: "entry", items: ["overview"] },
        { id: "content", items: ["mods", "conflicts"] },
        { id: "setup", items: ["profiles"] },
        { id: "health", items: ["diagnostics"] },
      ],
      undefined,
    );
    expect(groups.map((g) => [g.id, g.items])).toEqual([
      ["entry", ["overview"]],
      ["content", ["mods", "conflicts"]],
      ["setup", ["profiles"]],
      ["health", ["diagnostics"]],
    ]);
    expect(GROUP_LABELS.entry).toBeUndefined();
    expect(en[GROUP_LABELS.content!]).toBe("Content");
  });

  it("ignores ids it does not know and drops a group left empty", () => {
    const groups = workspaceGroups([{ id: "content", items: ["mods", "saves" as never] }, { id: "obtain", items: ["downloads" as never] }], undefined);
    expect(groups).toEqual([{ id: "content", items: ["mods"] }]);
  });

  it("an older backend without groups gets one group with its items", () => {
    expect(workspaceGroups(undefined, ["overview", "mods", "saves"])).toEqual([{ id: "entry", items: ["overview", "mods"] }]);
    expect(workspaceGroups(undefined, undefined)).toEqual([]);
  });

  it("no screen decides by capability or by a feature id: it renders what the backend lists (D132)", () => {
    const src = join(import.meta.dirname, "..");
    const files = (readdirSync(src, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes("i18n"));
    const offenders = files.filter((f) => {
      const code = readFileSync(join(src, f), "utf8");
      return /capabilities\s*\.\s*(includes|some|indexOf)\(/.test(code) || /items\s*\.\s*includes\(\s*"(plugins|load_order)"/.test(code);
    });
    expect(offenders).toEqual([]);
  });
});
