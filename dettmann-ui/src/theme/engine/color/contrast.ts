import type { Oklch } from "../types";
import { oklchToOklab, oklchToRgb } from "./convert";

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

function srgbClamped(c: Oklch): [number, number, number] {
  return oklchToRgb(c).map((v) => clamp01(v)) as [number, number, number];
}

/** Luminância relativa WCAG 2.x. */
function wcagLuminance(c: Oklch): number {
  const [r = 0, g = 0, b = 0] = srgbClamped(c).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function wcagContrast(a: Oklch, b: Oklch): number {
  const la = wcagLuminance(a);
  const lb = wcagLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Luminância APCA (estimativa de tela sRGB, expoente 2.4). */
function apcaY(c: Oklch): number {
  const [r, g, b] = srgbClamped(c);
  const y = 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.072175 * b ** 2.4;
  return y < 0.022 ? y + (0.022 - y) ** 1.414 : y;
}

/** |Lc| APCA 0.0.98G-4g (texto sobre fundo). */
export function apcaContrast(text: Oklch, bg: Oklch): number {
  const yTxt = apcaY(text);
  const yBg = apcaY(bg);
  if (Math.abs(yBg - yTxt) < 0.0005) return 0;
  let sapc: number;
  let out: number;
  if (yBg > yTxt) {
    sapc = (yBg ** 0.56 - yTxt ** 0.57) * 1.14;
    out = sapc < 0.1 ? 0 : sapc - 0.027;
  } else {
    sapc = (yBg ** 0.65 - yTxt ** 0.62) * 1.14;
    out = sapc > -0.1 ? 0 : sapc + 0.027;
  }
  return Math.abs(out) * 100;
}

/** Distância euclidiana em OKLab. */
export function deltaEOK(a: Oklch, b: Oklch): number {
  const [l1, a1, b1] = oklchToOklab(a);
  const [l2, a2, b2] = oklchToOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
