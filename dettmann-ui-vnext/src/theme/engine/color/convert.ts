import type { Oklch } from "../types";

const GAMUT_EPS = 1e-4;
const ACHROMATIC_C = 1e-4;

const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.abs(v) ** (1 / 2.4) * Math.sign(v) - 0.055);

/** Linear sRGB -> OKLab (Björn Ottosson). */
function linearToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab -> linear sRGB. */
function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLab (l, a, b) de uma cor OKLCH. */
export function oklchToOklab(c: Oklch): [number, number, number] {
  const rad = (c.h * Math.PI) / 180;
  return [c.l, c.c * Math.cos(rad), c.c * Math.sin(rad)];
}

function rgbToOklch(r: number, g: number, b: number): Oklch {
  const [L, a, bb] = linearToOklab(toLinear(r), toLinear(g), toLinear(b));
  const chroma = Math.hypot(a, bb);
  if (chroma < ACHROMATIC_C) return { l: L, c: 0, h: 0 };
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  if (h >= 360) h -= 360;
  return { l: L, c: chroma, h };
}

/** sRGB gamma-codificado 0..1, sem clamp. */
export function oklchToRgb(c: Oklch): [number, number, number] {
  const [L, a, b] = oklchToOklab(c);
  const [r, g, bl] = oklabToLinear(L, a, b);
  return [fromLinear(r), fromLinear(g), fromLinear(bl)];
}

export function inGamut(c: Oklch): boolean {
  return oklchToRgb(c).every((v) => v >= -GAMUT_EPS && v <= 1 + GAMUT_EPS);
}

/** Reduz a croma por bissecção até caber no sRGB; mantém l e h. */
export function clampChroma(c: Oklch): Oklch {
  if (inGamut(c)) return c;
  let lo = 0;
  let hi = c.c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut({ l: c.l, c: mid, h: c.h })) lo = mid;
    else hi = mid;
  }
  return { l: c.l, c: lo, h: c.h };
}

export function toHex(c: Oklch): string {
  const rgb = oklchToRgb(clampChroma(c));
  return (
    "#" +
    rgb
      .map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** Número com unidade opcional: "50%" -> pct escalado por `scale`; "30deg" -> 30. */
function num(token: string, percentScale: number): number | null {
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|turn|rad|grad)?$/i.exec(token);
  if (!m) return null;
  const v = parseFloat(m[1] ?? "");
  switch (m[2]?.toLowerCase()) {
    case "%": return (v / 100) * percentScale;
    case "turn": return v * 360;
    case "rad": return (v * 180) / Math.PI;
    case "grad": return v * 0.9;
    default: return v;
  }
}

function parseFunction(input: string): Oklch | null {
  const m = /^(rgba?|hsla?|oklch)\(\s*([^)]*?)\s*\)$/i.exec(input);
  if (!m) return null;
  const fn = (m[1] ?? "").toLowerCase().replace("a", "");
  const parts = (m[2] ?? "").split(/\s*[,/]\s*|\s+/).filter(Boolean);
  if (parts.length !== 3 && parts.length !== 4) return null; // 4º = alpha, ignorado
  const [p1 = "", p2 = "", p3 = ""] = parts;
  if (fn === "rgb") {
    const rgb = [num(p1, 255), num(p2, 255), num(p3, 255)];
    if (rgb.some((v) => v === null)) return null;
    const [r = 0, g = 0, b = 0] = rgb.map((v) => Math.min(255, Math.max(0, v as number)) / 255);
    return rgbToOklch(r, g, b);
  }
  if (fn === "hsl") {
    const h = num(p1, 360), s = num(p2, 1), l = num(p3, 1);
    if (h === null || s === null || l === null) return null;
    // sem "%" o valor 0..100 é tratado como porcentagem, como no CSS
    const sat = /%$/.test(p2) ? s : s / 100;
    const lig = /%$/.test(p3) ? l : l / 100;
    const [r, g, b] = hslToRgb(((h % 360) + 360) % 360, Math.min(1, Math.max(0, sat)), Math.min(1, Math.max(0, lig)));
    return rgbToOklch(r, g, b);
  }
  // oklch
  const l = num(p1, 1), c = num(p2, 0.4), h = num(p3, 360);
  if (l === null || c === null || h === null || c < 0) return null;
  const hue = ((h % 360) + 360) % 360;
  if (c < ACHROMATIC_C) return { l: Math.min(1, Math.max(0, l)), c: 0, h: 0 };
  return { l: Math.min(1, Math.max(0, l)), c, h: hue };
}

function parseHex(input: string): Oklch | null {
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(input);
  if (!m) return null;
  let hex = m[1] ?? "";
  if (hex.length <= 4) hex = hex.replace(/./g, (ch) => ch + ch);
  const [r = 0, g = 0, b = 0] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return rgbToOklch(r, g, b);
}

/** Interpreta hex, rgb(), hsl() e oklch(); alpha é ignorado. Nomes CSS não são suportados. */
export function parseColor(input: string): Oklch | null {
  const s = input.trim();
  if (!s) return null;
  return s.startsWith("#") ? parseHex(s) : parseFunction(s);
}
