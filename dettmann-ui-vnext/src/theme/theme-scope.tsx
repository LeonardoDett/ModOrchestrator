import { useContext, useInsertionEffect, useMemo, type ReactNode } from "react";
import { MOTION_LEVELS, type Mode, type MotionLevel, type ThemeConfig } from "./engine";
import { DEFAULT_PRESET } from "./presets";
import { injectTheme, resolveThemeInput } from "./inject";
import { EMPTY_REGISTRY, ThemeScopeContext, themeInputKey } from "./theme-context";

export interface ThemeScopeProps {
  /** Id (preset ou registro do provider) ou config inline; sem ele, herda o tema mais próximo. */
  theme?: string | ThemeConfig;
  /** Força o modo na subárvore (`data-ui-mode`); sem ele, reemite o modo forçado herdado. */
  mode?: Mode;
  density?: ThemeConfig["density"];
  /** Nível pedido; limitado pelo teto de movimento do tema. Padrão `"calm"`. */
  motion?: MotionLevel;
  className?: string;
  children: ReactNode;
}

function clampMotion(level: MotionLevel, ceiling: MotionLevel): MotionLevel {
  return MOTION_LEVELS[Math.min(MOTION_LEVELS.indexOf(level), MOTION_LEVELS.indexOf(ceiling))]!;
}

/**
 * Subárvore com outro tema, modo, densidade ou movimento. Sempre emite `data-theme`
 * (o próprio ou o herdado) e `data-motion`. `data-ui-mode` sai quando este escopo ou um
 * ancestral força um modo (o próprio vence): um escopo aninhado numa ilha clara sob
 * `.dark` continua claro. `data-density` só quando definido. Configs não-preset são
 * injetadas como `<style>`.
 */
export function ThemeScope({ theme: themeProp, mode, density, motion, className, children }: ThemeScopeProps) {
  const parent = useContext(ThemeScopeContext);
  const registry = parent?.registry ?? EMPTY_REGISTRY;
  const key = themeInputKey(themeProp);
  const theme = useMemo(
    () =>
      themeProp !== undefined
        ? resolveThemeInput(themeProp, registry)
        : (parent?.theme ?? resolveThemeInput(DEFAULT_PRESET, registry)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, parent?.theme, registry],
  );

  useInsertionEffect(() => {
    if (themeProp !== undefined) injectTheme(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  const forcedMode = mode ?? parent?.forcedMode;
  const scope = useMemo(() => ({ theme, registry, forcedMode }), [theme, registry, forcedMode]);
  return (
    <ThemeScopeContext.Provider value={scope}>
      <div
        data-theme={theme.id}
        data-ui-mode={forcedMode}
        data-density={density}
        data-motion={clampMotion(motion ?? "calm", theme.config.motion.ceiling)}
        className={className}
      >
        {children}
      </div>
    </ThemeScopeContext.Provider>
  );
}
