import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import * as icons from "../icons";
import { CATALOG } from "../icons/catalog";
import type { AnimatedIconComponent, Choreography, Technique } from "../icons";

const LOOP_ICONS = ["search", "settings", "file-search", "upload", "download", "database-backup", "triangle-alert", "bell", "rocket", "refresh", "history", "scan-search", "sparkles", "clock"];
const ROTATION_ICONS = ["refresh", "undo", "settings", "sun", "moon"];

function techniquesOf(choreo: Choreography | undefined): Technique[] {
  if (!choreo) return [];
  return Object.values(choreo).flatMap((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v as Technique]));
}
const byName = (n: string) => CATALOG.find((c) => c.definition.name === n);
const entries = CATALOG.map((c) => [c.definition.name, c] as [string, AnimatedIconComponent]);

test("catalog is not empty", () => {
  expect(CATALOG.length).toBeGreaterThan(0);
});

test("names are unique kebab-case", () => {
  const names = CATALOG.map((c) => c.definition.name);
  expect(new Set(names).size).toBe(names.length);
  for (const n of names) expect(n).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

describe.each(entries)("%s", (name, C) => {
  test("renders with viewBox 24", () => {
    const { container } = render(<C />);
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 24 24");
  });

  test("parts are unique and every referenced part exists", () => {
    const d = C.definition;
    const keys = Object.keys(d.parts);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain("root");
    for (const choreo of [d.action, d.loop]) {
      for (const k of Object.keys(choreo ?? {})) expect(k === "root" || keys.includes(k)).toBe(true);
    }
    for (const k of Object.keys(d.origin ?? {})) expect(keys).toContain(k);
  });

  test("uses no color other than currentColor/none", () => {
    const { container } = render(<C />);
    const html = container.innerHTML;
    for (const m of html.matchAll(/\b(?:fill|stroke)="([^"]*)"/g)) {
      expect(["currentColor", "none"]).toContain(m[1]);
    }
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|hsl|oklch/i);
  });

  test("respects geometric limits at amp 1.6", () => {
    for (const t of [...techniquesOf(C.definition.action), ...techniquesOf(C.definition.loop)]) {
      if (t.exempt) continue;
      expect(t.extent.translate * 1.6).toBeLessThanOrEqual(3);
      // 180° só para a técnica `rotate` dos ícones de rotação natural; as demais seguem 30°.
      const limit = t.kind === "rotate" && ROTATION_ICONS.includes(name) ? 180 : 30;
      expect(t.extent.rotate * 1.6).toBeLessThanOrEqual(limit);
      expect(t.extent.scale * 1.6).toBeLessThanOrEqual(0.25);
    }
  });
});

test("loop icons declare a loop choreography", () => {
  for (const n of LOOP_ICONS) {
    expect(byName(n), n).toBeDefined();
    expect(byName(n)!.definition.loop, n).toBeDefined();
  }
});

test("every glyph is exported from src/icons/index.ts", () => {
  const exported = new Set(Object.values(icons));
  for (const c of CATALOG) expect(exported.has(c)).toBe(true);
});
