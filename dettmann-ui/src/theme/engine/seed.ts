import { parseColor } from "./color/convert";
import type { ThemeConfig } from "./types";

/**
 * Mesma configuração com outra semente de marca: o tema de uma área com cor própria (por
 * exemplo, o espaço de um jogo) sem perder forma, densidade, movimento e fontes do tema de
 * origem. O `accent` é derivado de novo da semente e `overrides` saem (eles fixavam papéis
 * da marca antiga). Semente ausente ou inválida devolve `config` sem mudança, nunca lança.
 *
 * @example
 * <ThemeScope theme={withSeed(PRESETS.orchestrator, game.color, `game-${game.id}`)}>…</ThemeScope>
 */
export function withSeed(config: ThemeConfig, seed: string | null | undefined, id: string): ThemeConfig {
  if (!seed || !parseColor(seed)) return config;
  const { accent: _accent, overrides: _overrides, ...rest } = config;
  return { ...rest, id, brand: seed };
}
