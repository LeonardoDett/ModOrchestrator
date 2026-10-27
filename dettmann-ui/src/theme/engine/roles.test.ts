import { expect, test } from "vitest";
import { inGamut, parseColor } from "./color/convert";
import { deltaEOK, wcagContrast } from "./color/contrast";
import { normalizeConfig } from "./config";
import { buildIntents } from "./palette";
import { buildRoles, CONTRAST_PAIRS, contrastReport, ROLE_NAMES } from "./roles";
import type { ThemeConfig } from "./types";
import { PRESETS } from "../presets";

/** PRNG determinístico (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Cada marca depende só do índice: reordenar testes não muda a amostra. */
const randomBrand = (i: number): string => {
  const rand = mulberry32(42 + i);
  return "#" + Array.from({ length: 3 }, () => Math.floor(rand() * 256).toString(16).padStart(2, "0")).join("");
};

const seeds = Array.from({ length: 300 }, (_, i) => randomBrand(i));
const edge = ["#ffff00", "#0a0a0a", "#fafafa", "#808080", "#000000", "#ffffff", "#16a34a", "#dc2626", "#2563eb", "#f59e0b"];
const cfg = (extra: Partial<ThemeConfig> = {}): ThemeConfig => ({ id: "t", label: "t", brand: "#16824f", ...extra });

test.each([...edge, ...seeds])("all contrast targets pass for %s in both modes and contrasts", (brand) => {
  for (const contrast of ["standard", "high"] as const)
    for (const mode of ["light", "dark"] as const) {
      const { roles } = buildRoles(normalizeConfig({ id: "t", label: "t", brand, contrast }), mode);
      const failing = contrastReport(roles, contrast).filter((r) => !r.pass);
      expect(failing).toEqual([]);
    }
});

const L = (hex: string) => parseColor(hex)!.l;
const hex = (hex: string) => parseColor(hex)!;
const FILL_INTENTS = ["brand", "accent", "info", "success", "warning", "danger"] as const;

test.each([...edge, ...seeds])("text hierarchy and distinct fills/states for %s", (brand) => {
  for (const contrast of ["standard", "high"] as const)
    for (const mode of ["light", "dark"] as const) {
      const { roles } = buildRoles(normalizeConfig({ id: "t", label: "t", brand, contrast }), mode);
      const where = `${brand} ${contrast} ${mode}`;
      const canvas = hex(roles.canvas);
      const ratio = (role: "fg" | "fg-muted" | "fg-subtle") => wcagContrast(hex(roles[role]), canvas);
      expect(ratio("fg"), where).toBeGreaterThan(ratio("fg-muted"));
      expect(ratio("fg-muted"), where).toBeGreaterThan(ratio("fg-subtle"));
      expect(Math.abs(L(roles.fg) - L(roles["fg-muted"])), where).toBeGreaterThanOrEqual(0.06);
      expect(Math.abs(L(roles["fg-muted"]) - L(roles["fg-subtle"])), where).toBeGreaterThanOrEqual(0.06);
      // a camada de estrutura (30%) precisa se distinguir da base e dos cartões
      for (const surface of ["canvas", "surface"] as const)
        expect(Math.abs(L(roles.structure) - L(roles[surface])), `${where} structure vs ${surface}`).toBeGreaterThanOrEqual(0.03);
      if (mode === "light") {
        // piso do warning no light (tolerância de quantização em 8 bits) com `on` escuro
        expect(L(roles["warning-fill"]), where).toBeGreaterThanOrEqual(0.72 - 0.005);
        expect(L(roles["on-warning"]), where).toBeLessThan(0.3);
      }
      for (const x of FILL_INTENTS) {
        const fill = hex(roles[`${x}-fill`]);
        for (const surface of ["canvas", "surface"] as const)
          expect(deltaEOK(fill, hex(roles[surface])), `${where} ${x} vs ${surface}`).toBeGreaterThanOrEqual(0.08);
      }
    }
});

test("every role is a valid in-gamut hex (overlay excepted) and never NaN", () => {
  for (const brand of [...edge, "oklch(0.7 0.4 145)", "hsl(300 100% 50%)"])
    for (const neutral of ["cool", "neutral", "warm"] as const)
      for (const mode of ["light", "dark"] as const) {
        const { roles } = buildRoles(normalizeConfig(cfg({ brand, neutral, vibrance: 1 })), mode);
        expect(Object.keys(roles).sort()).toEqual([...ROLE_NAMES].sort());
        for (const name of ROLE_NAMES) {
          const value = roles[name];
          expect(value).not.toMatch(/nan/i);
          if (name === "overlay") {
            expect(value).toMatch(/^rgb\(\d{1,3} \d{1,3} \d{1,3} \/ 0\.\d+\)$/);
            continue;
          }
          expect(value, `${name} for ${brand}`).toMatch(/^#[0-9a-f]{6}$/);
          expect(inGamut(parseColor(value)!)).toBe(true);
        }
      }
});

test("light brand is kept as-is when it already passes", () => {
  const { roles } = buildRoles(normalizeConfig({ id: "t", label: "t", brand: "#16824f" }), "light");
  expect(roles["brand-fill"]).toBe("#16824f");
});

test("status hue moves away from a same-hue brand", () => {
  const cfg = normalizeConfig({ id: "t", label: "t", brand: "#16a34a" });
  const { roles } = buildRoles(cfg, "light");
  expect(deltaEOK(parseColor(roles["brand-fill"])!, parseColor(roles["success-fill"])!)).toBeGreaterThanOrEqual(0.08);
});

test("status fills stay distinct from typical brands without warnings", () => {
  for (const brand of ["#16824F", "#34434B", "#2FC4A0", "#E2553A", "#3B5BDB", "#16a34a", "#dc2626", "#2563eb", "#f59e0b"])
    for (const contrast of ["standard", "high"] as const)
      for (const mode of ["light", "dark"] as const) {
        const { roles, warnings } = buildRoles(normalizeConfig(cfg({ brand, contrast })), mode);
        expect(warnings, `${brand} ${contrast} ${mode}`).toEqual([]);
        for (const status of ["info", "success", "warning", "danger"] as const)
          expect(deltaEOK(parseColor(roles["brand-fill"])!, parseColor(roles[`${status}-fill`])!)).toBeGreaterThanOrEqual(0.08);
      }
});

test("an unresolved status collision is kept and reported in warnings", () => {
  // nenhuma semente real deixa colisão sem solução; uma distância mínima impossível força o caminho do aviso
  const config = normalizeConfig(cfg({ brand: "#16a34a" }));
  const surfaces = [parseColor("#ffffff")!, parseColor("#f8f8f8")!];
  const { intents, warnings } = buildIntents(config, "light", surfaces, 1);
  expect(warnings).toHaveLength(4);
  expect(warnings.join("\n")).toMatch(/success-fill is too close to brand-fill in light mode \(ΔE 0\.\d+ < 1\)/);
  expect(intents.success.fill).toBeDefined();
});

const chromaOf = (hex: string) => parseColor(hex)!.c;
const hueDistance = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

test("vibrance 0 keeps structure closer to neutral than vibrance 1", () => {
  for (const mode of ["light", "dark"] as const) {
    const low = buildRoles(normalizeConfig(cfg({ vibrance: 0 })), mode).roles;
    const high = buildRoles(normalizeConfig(cfg({ vibrance: 1 })), mode).roles;
    expect(chromaOf(high.structure)).toBeGreaterThan(chromaOf(low.structure));
    expect(chromaOf(high.selected)).toBeGreaterThan(chromaOf(low.selected));
  }
});

test("neutral temperature shifts neutral hue", () => {
  const brand = "#c2185b"; // matiz ~ 0°, longe dos dois alvos
  const hueOf = (neutral: "cool" | "warm") =>
    parseColor(buildRoles(normalizeConfig(cfg({ brand, neutral, vibrance: 1 })), "light").roles.canvas)!.h;
  expect(hueDistance(hueOf("cool"), 250)).toBeLessThan(hueDistance(hueOf("warm"), 250));
  expect(hueDistance(hueOf("warm"), 70)).toBeLessThan(hueDistance(hueOf("cool"), 70));
});

test("achromatic brand yields untinted neutrals and no NaN", () => {
  for (const brand of ["#808080", "#000000", "#ffffff"])
    for (const mode of ["light", "dark"] as const) {
      const { roles } = buildRoles(normalizeConfig(cfg({ brand, neutral: "warm" })), mode);
      for (const role of ["canvas", "surface", "structure", "fg"] as const) expect(chromaOf(roles[role])).toBeLessThan(0.002);
      expect(JSON.stringify(roles)).not.toMatch(/nan/i);
    }
});

test("emphasis roles mirror the brand roles", () => {
  const { roles } = buildRoles(normalizeConfig(cfg()), "dark");
  for (const suffix of ["fill", "fill-hover", "fill-pressed", "subtle", "text", "border"] as const)
    expect(roles[`emphasis-${suffix}`]).toBe(roles[`brand-${suffix}`]);
  expect(roles["on-emphasis"]).toBe(roles["on-brand"]);
});

test("missing accent is derived 150 degrees away from the brand", () => {
  const n = normalizeConfig(cfg());
  expect(hueDistance(n.accent.h, n.brand.h)).toBeCloseTo(150, 5);
  const explicit = buildRoles(normalizeConfig(cfg({ accent: "#b4501c" })), "light").roles;
  expect(explicit["accent-fill"]).toBe("#b4501c");
});

test("fill states step in lightness with the mode", () => {
  const light = buildRoles(normalizeConfig(cfg()), "light").roles;
  expect(L(light["brand-fill-hover"])).toBeLessThan(L(light["brand-fill"]));
  expect(L(light["brand-fill-pressed"])).toBeLessThan(L(light["brand-fill-hover"]));
  const dark = buildRoles(normalizeConfig(cfg()), "dark").roles;
  expect(L(dark["brand-fill-hover"])).toBeGreaterThan(L(dark["brand-fill"]));
  expect(L(dark["brand-fill-pressed"])).toBeGreaterThan(L(dark["brand-fill-hover"]));
});

test("hover and pressed always differ from the fill and from each other", () => {
  for (const brand of edge)
    for (const contrast of ["standard", "high"] as const)
      for (const mode of ["light", "dark"] as const) {
        const { roles } = buildRoles(normalizeConfig(cfg({ brand, contrast })), mode);
        for (const x of FILL_INTENTS) {
          const where = `${brand} ${contrast} ${mode} ${x}`;
          const [f, h, p] = (["fill", "fill-hover", "fill-pressed"] as const).map((s) => L(roles[`${x}-${s}`]));
          expect(Math.abs(h! - f!), where).toBeGreaterThanOrEqual(0.03);
          expect(Math.abs(p! - f!), where).toBeGreaterThanOrEqual(0.03);
          expect(Math.abs(p! - h!), where).toBeGreaterThanOrEqual(0.03);
          const [fc, hc, pc] = (["fill", "fill-hover", "fill-pressed"] as const).map((s) => hex(roles[`${x}-${s}`]));
          expect(wcagContrast(hc!, fc!), where).toBeGreaterThanOrEqual(1.12);
          expect(wcagContrast(pc!, fc!), where).toBeGreaterThanOrEqual(1.12);
          expect(wcagContrast(pc!, hc!), where).toBeGreaterThanOrEqual(1.12);
        }
      }
});

test.each([
  ["#000000", "light"],
  ["#0a0a0a", "light"],
  ["#000000", "dark"],
] as const)("near-black brand %s in %s mode has visibly distinct states", (brand, mode) => {
  for (const contrast of ["standard", "high"] as const) {
    const { roles } = buildRoles(normalizeConfig(cfg({ brand, contrast })), mode);
    const [f, h, p] = (["fill", "fill-hover", "fill-pressed"] as const).map((s) => hex(roles[`brand-${s}`]));
    expect(wcagContrast(h!, f!)).toBeGreaterThanOrEqual(1.12);
    expect(wcagContrast(p!, h!)).toBeGreaterThanOrEqual(1.12);
    expect(contrastReport(roles, contrast).filter((r) => !r.pass)).toEqual([]);
  }
});

test("white and black brands produce fills distinct from the surfaces", () => {
  for (const brand of ["#ffffff", "#000000"])
    for (const mode of ["light", "dark"] as const) {
      const { roles } = buildRoles(normalizeConfig(cfg({ brand })), mode);
      for (const surface of ["canvas", "surface"] as const)
        expect(deltaEOK(hex(roles["brand-fill"]), hex(roles[surface])), `${brand} ${mode}`).toBeGreaterThanOrEqual(0.08);
      expect(roles["brand-fill-hover"]).not.toBe(roles["brand-fill"]);
      expect(roles["brand-fill-pressed"]).not.toBe(roles["brand-fill-hover"]);
    }
});

test("light fills that fail are darkened toward the light on-color", () => {
  const { roles } = buildRoles(normalizeConfig(cfg({ brand: "#f59e0b", contrast: "high" })), "light");
  expect(L(roles["brand-fill"])).toBeLessThan(L("#f59e0b"));
  expect(L(roles["on-brand"])).toBeGreaterThan(0.9);
});

test("warning keeps its light floor with a dark on-color", () => {
  // as sementes aleatórias são cobertas no teste de propriedade de hierarquia
  for (const brand of edge)
    for (const contrast of ["standard", "high"] as const) {
      const { roles } = buildRoles(normalizeConfig(cfg({ brand, contrast })), "light");
      expect(L(roles["warning-fill"]), brand).toBeGreaterThanOrEqual(0.72 - 0.005);
      expect(L(roles["on-warning"])).toBeLessThan(0.3);
    }
});

test("warning stays vivid: fill chroma >= 0.13 for chromatic edge seeds and presets", () => {
  const chromaticEdge = edge.filter((b) => parseColor(b)!.c > 0.02);
  const configs = [...chromaticEdge.map((brand) => cfg({ brand })), ...Object.values(PRESETS)];
  for (const config of configs)
    for (const contrast of ["standard", "high"] as const)
      for (const mode of ["light", "dark"] as const) {
        const { roles } = buildRoles(normalizeConfig({ ...config, contrast }), mode);
        expect(hex(roles["warning-fill"]).c, `${config.id} ${String(config.brand)} ${contrast} ${mode}`).toBeGreaterThanOrEqual(0.13);
      }
});

test("contrastReport fails missing or unparseable roles instead of skipping them", () => {
  const { roles } = buildRoles(normalizeConfig(cfg()), "light");
  const { fg: _drop, ...rest } = roles;
  const missing = contrastReport({ ...rest, canvas: "teal" }, "standard").filter((r) => !r.pass);
  expect(missing.filter((r) => r.fg === "fg")).toHaveLength(5);
  expect(missing.filter((r) => r.bg === "canvas" && r.fg !== "fg").length).toBeGreaterThan(0);
  expect(missing.every((r) => r.ratio === 0)).toBe(true);
});

test("overlay alpha depends on the mode", () => {
  expect(buildRoles(normalizeConfig(cfg()), "light").roles.overlay).toMatch(/\/ 0\.48\)$/);
  expect(buildRoles(normalizeConfig(cfg()), "dark").roles.overlay).toMatch(/\/ 0\.62\)$/);
});

test("contrastReport flags a failing pair with its measured ratio", () => {
  const { roles } = buildRoles(normalizeConfig(cfg()), "light");
  const report = contrastReport({ ...roles, fg: "#999999" }, "standard");
  const failing = report.filter((r) => !r.pass);
  expect(failing.length).toBeGreaterThan(0);
  expect(failing.every((r) => r.fg === "fg" && r.kind === "text" && r.target === 7 && r.ratio < 7)).toBe(true);
});

test("high contrast also requires APCA Lc 90 for main text", () => {
  const { roles } = buildRoles(normalizeConfig(cfg()), "light");
  // #3b3b3b: WCAG >= 7 sobre as superfícies, mas APCA abaixo de 90
  const report = contrastReport({ ...roles, fg: "#3b3b3b" }, "high").filter((r) => r.fg === "fg");
  expect(report.every((r) => r.ratio >= 7)).toBe(true);
  expect(report.some((r) => !r.pass)).toBe(true);
});

test("contrast pairs only reference generated roles", () => {
  const names = new Set<string>(ROLE_NAMES);
  for (const pair of CONTRAST_PAIRS) {
    expect(names.has(pair.fg)).toBe(true);
    for (const bg of pair.bg) expect(names.has(bg)).toBe(true);
  }
});

test("contrast targets also hold across neutral temperature and vibrance extremes", () => {
  for (const brand of [...edge, ...seeds.slice(0, 40)])
    for (const neutral of ["cool", "warm"] as const)
      for (const vibrance of [0, 1])
        for (const contrast of ["standard", "high"] as const)
          for (const mode of ["light", "dark"] as const) {
            const { roles } = buildRoles(normalizeConfig(cfg({ brand, neutral, vibrance, contrast })), mode);
            const failing = contrastReport(roles, contrast).filter((r) => !r.pass);
            expect(failing, `${brand} ${neutral} ${vibrance} ${contrast} ${mode}`).toEqual([]);
          }
});
