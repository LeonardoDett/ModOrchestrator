import { createTheme, toCSS, type ThemeConfig } from "../engine";
import { ember } from "./ember";
import { forest } from "./forest";
import { graphite } from "./graphite";
import { ink } from "./ink";
import { orchestrator } from "./orchestrator";

export type PresetId = "forest" | "graphite" | "orchestrator" | "ember" | "ink";

/** Presets embarcados; a ordem é a ordem de emissão no CSS gerado. */
export const PRESETS: Record<PresetId, ThemeConfig> = { forest, graphite, orchestrator, ember, ink };

export const DEFAULT_PRESET: PresetId = "orchestrator";

export const GENERATED_CSS_HEADER = "/* gerado por scripts/theme/generate.ts — não editar */\n";

/** CSS de todos os presets: o padrão também vale para `:root`, os demais só por `data-theme`. */
export function renderPresetsCSS(): string {
  const ids = [DEFAULT_PRESET, ...(Object.keys(PRESETS) as PresetId[]).filter((id) => id !== DEFAULT_PRESET)];
  return GENERATED_CSS_HEADER + ids.map((id) => toCSS(createTheme(PRESETS[id]), { root: id === DEFAULT_PRESET })).join("");
}
