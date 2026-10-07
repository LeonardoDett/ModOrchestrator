import { useMemo, type CSSProperties, type ReactNode } from "react";
import { isDev } from "../dev/env";
import { clampMotion, springToLinear, validateMotionSpec, type MotionLevel, type MotionSpec } from "../theme/engine";
import { MotionContext } from "../theme/theme-context";
import { effectiveSpec, useMotionEnvironment } from "./use-motion";

export interface MotionScopeProps {
  /** Nível pedido; limitado pelo teto do tema mais próximo. Sem ele, herda o nível do escopo de fora (ou `"calm"`). */
  level?: MotionLevel;
  /**
   * Ajuste fino do nível efetivo nesta subárvore (validado: lança em dev, limita em produção).
   * Emitido como as `--motion-*` de contexto, que `readMotion` e os utilitários CSS leem.
   */
  tune?: Partial<MotionSpec>;
  children: ReactNode;
}

/**
 * Define o nível de movimento de uma subárvore. Renderiza um `div` com `display: contents`
 * e `data-motion` = `min(level, teto do tema)`; com `tune`, também as seis `--motion-*`
 * recalculadas (curva da mola via `springToLinear`) e as `--ui-motion-<nível>-*` do nível
 * efetivo, para que descendentes com `data-motion` desse nível herdem o ajuste. Um `MotionScope` aninhado no mesmo
 * nível herda o `tune` do de fora.
 */
export function MotionScope({ level: levelProp, tune: tuneProp, children }: MotionScopeProps) {
  const { ceiling, themeTune, parent } = useMotionEnvironment();
  const level = clampMotion(levelProp ?? parent?.level ?? "calm", ceiling);
  const tuneKey = tuneProp ? JSON.stringify(tuneProp) : "";
  const inherited = parent?.level === level ? parent.tune : undefined;

  const tune = useMemo(() => {
    const own = tuneProp ? validateMotionSpec(tuneProp, isDev() ? "dev" : "prod") : undefined;
    return own || inherited ? { ...inherited, ...own } : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tuneKey, inherited]);

  const style = useMemo<CSSProperties>(() => {
    const base: Record<string, string> = { display: "contents" };
    if (!tune) return base as CSSProperties;
    const spec = effectiveSpec(ceiling, themeTune, level, tune);
    const spring = springToLinear(spec);
    const values: Record<string, string> = {
      ease: spring.easing,
      "spring-duration": `${spring.duration}ms`,
      duration: `${spec.duration}ms`,
      amp: String(spec.amplitude),
      press: String(spec.pressScale),
      stagger: `${spec.stagger}ms`,
    };
    for (const [name, value] of Object.entries(values)) {
      // Contexto (lido por readMotion e pelos utilitários CSS) e a fonte por nível, para que
      // descendentes com `data-motion` do mesmo nível mantenham o ajuste do escopo.
      base[`--motion-${name}`] = value;
      base[`--ui-motion-${level}-${name}`] = value;
    }
    return base as CSSProperties;
  }, [ceiling, themeTune, level, tune]);

  const value = useMemo(() => ({ level, tune }), [level, tune]);
  return (
    <MotionContext.Provider value={value}>
      <div data-motion={level} style={style}>
        {children}
      </div>
    </MotionContext.Provider>
  );
}
