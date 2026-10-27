import { toHex } from "./color/convert";
import { motionVars, resolveMotionSpecs } from "./motion";
import { neutralTone } from "./palette";
import type { Density, Mode, NormalizedConfig, Shape } from "./types";

const px = (n: number) => (n >= 999 ? "9999px" : `${n}px`);
/** Tipo, entrelinha e alturas de controle em rem (px / 16): acompanham a escala de fonte do app. */
const rem = (n: number) => `${n / 16}rem`;

/** Tabela 6.1: [precise, balanced, soft]. */
const RADIUS: Record<string, Record<Shape, number>> = {
  "radius-control": { precise: 6, balanced: 8, soft: 10 },
  "radius-chip": { precise: 4, balanced: 6, soft: 999 },
  "radius-card": { precise: 8, balanced: 12, soft: 16 },
  "radius-panel": { precise: 12, balanced: 16, soft: 20 },
  "radius-pill": { precise: 999, balanced: 999, soft: 999 },
};

/** Tabela 6.2 (px; emitidas em rem). */
const DENSITY_SCALE: Record<Density, number> = { compact: 0.875, comfortable: 1, spacious: 1.125 };
const CONTROL: Record<string, Record<Density, number>> = {
  "control-sm": { compact: 28, comfortable: 32, spacious: 36 },
  "control-md": { compact: 32, comfortable: 36, spacious: 40 },
  "control-lg": { compact: 36, comfortable: 40, spacious: 48 },
};

/** Seção 6.3: [tamanho, entrelinha] em px (emitidos em rem). */
const TYPE: Record<string, [number, number]> = {
  caption: [11, 16],
  label: [12, 16],
  body: [13, 20],
  "body-lg": [14, 22],
  "title-sm": [16, 24],
  title: [20, 28],
  display: [24, 32],
  "display-lg": [30, 38],
};

/** Geometrias [contato, difusa] e alpha por camada [light contato, light difusa, dark]. */
const SHADOWS: Record<string, { contact: string; diffuse: string; light: [number, number]; dark: number }> = {
  "shadow-raised": { contact: "0 1px 2px", diffuse: "0 1px 3px", light: [0.06, 0.04], dark: 0.3 },
  "shadow-overlay": { contact: "0 4px 12px", diffuse: "0 2px 4px", light: [0.1, 0.08], dark: 0.4 },
  "shadow-modal": { contact: "0 12px 32px", diffuse: "0 4px 8px", light: [0.14, 0.12], dark: 0.5 },
};

function shadowColor(config: NormalizedConfig): string {
  const { h, c } = neutralTone(config);
  const hex = toHex({ l: 0.2, c, h });
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
}

/** Primitivas L2 de um modo: `shared` (forma, densidade, tipo, movimento) e elevação do modo. */
export function buildPrimitives(config: NormalizedConfig, mode: Mode): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(RADIUS)) out[k] = px(v[config.shape]);
  out["density-scale"] = String(DENSITY_SCALE[config.density]);
  for (const [k, v] of Object.entries(CONTROL)) out[k] = rem(v[config.density]);
  out["font-sans"] = `"${config.font.sans}", ui-sans-serif, system-ui, sans-serif`;
  out["font-mono"] = `"${config.font.mono}", ui-monospace, SFMono-Regular, Consolas, monospace`;
  for (const [role, [size, leading]] of Object.entries(TYPE)) {
    out[`text-${role}`] = rem(size);
    out[`text-${role}-leading`] = rem(leading);
  }
  const rgb = shadowColor(config);
  out["shadow-flat"] = "none";
  for (const [k, s] of Object.entries(SHADOWS)) {
    const [a1, a2] = mode === "light" ? s.light : [s.dark, s.dark];
    out[k] = `${s.contact} rgb(${rgb} / ${a1}), ${s.diffuse} rgb(${rgb} / ${a2})`;
  }
  Object.assign(out, motionVars(resolveMotionSpecs(config.motion.ceiling, config.motion.tune)));
  return out;
}
