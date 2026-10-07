import { useContext, useMemo } from "react";
import { resolveMotionSpecs, type MotionLevel, type MotionSpec, type MotionTune } from "../theme/engine";
import { MotionContext, ThemeContext, ThemeScopeContext, type MotionContextValue } from "../theme/theme-context";

export interface MotionEnvironment {
  /** Teto do tema mais próximo (`ThemeScope`, senão `ThemeProvider`); sem tema, `"expressive"`. */
  ceiling: MotionLevel;
  /** `motion.tune` do tema mais próximo. */
  themeTune: MotionTune;
  /** Contexto de movimento herdado (`MotionScope`/`ThemeScope`), se houver. */
  parent: MotionContextValue | null;
}

const NO_TUNE: MotionTune = Object.freeze({}) as MotionTune;

/** Tema mais próximo e contexto de movimento herdado; uso interno das primitivas. */
export function useMotionEnvironment(): MotionEnvironment {
  const scope = useContext(ThemeScopeContext);
  const provider = useContext(ThemeContext);
  const parent = useContext(MotionContext);
  const theme = scope?.theme ?? provider?.theme;
  return {
    ceiling: theme?.config.motion.ceiling ?? "expressive",
    themeTune: theme?.config.motion.tune ?? NO_TUNE,
    parent,
  };
}

/** Spec efetiva de `level`: padrões ← `tune` do tema ← `tune` do escopo, limitada pelo teto. */
export function effectiveSpec(
  ceiling: MotionLevel,
  themeTune: MotionTune,
  level: MotionLevel,
  scopeTune: Partial<MotionSpec> | undefined,
): MotionSpec {
  const tune: MotionTune = scopeTune ? { ...themeTune, [level]: { ...themeTune[level], ...scopeTune } } : themeTune;
  return resolveMotionSpecs(ceiling, tune)[level];
}

/**
 * Nível efetivo (do `MotionScope`/`ThemeScope` mais próximo, já limitado pelo teto; na raiz,
 * `"calm"`) e a spec correspondente, com os ajustes do tema e do escopo.
 */
export function useMotion(): { level: MotionLevel; spec: MotionSpec } {
  const { ceiling, themeTune, parent } = useMotionEnvironment();
  const level = parent?.level ?? "calm";
  const tune = parent?.tune;
  return useMemo(
    () => ({ level, spec: effectiveSpec(ceiling, themeTune, level, tune) }),
    [ceiling, themeTune, level, tune],
  );
}
