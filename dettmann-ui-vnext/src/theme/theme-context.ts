import { createContext } from "react";
import type { Mode, MotionLevel, MotionSpec, ResolvedTheme, ThemeConfig } from "./engine";

/** Preferência de modo; `system` segue `prefers-color-scheme`. */
export type ThemeMode = "light" | "dark" | "system";

export interface ThemeContextValue {
  mode: ThemeMode;
  resolvedMode: Mode;
  setMode: (mode: ThemeMode) => void;
  theme: ResolvedTheme;
  setTheme: (next: string | ThemeConfig) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Tema mais próximo (provider ou `ThemeScope`), o registro do consumidor, o modo forçado e a
 * densidade do ancestral mais próximo que os define (se houver), para escopos aninhados e
 * overlays portados.
 */
export interface ThemeScopeContextValue {
  theme: ResolvedTheme;
  registry: Record<string, ThemeConfig>;
  forcedMode?: Mode;
  density?: ThemeConfig["density"];
}

export const ThemeScopeContext = createContext<ThemeScopeContextValue | null>(null);

/**
 * Contexto de movimento mais próximo (`MotionScope` ou `ThemeScope`): nível efetivo já
 * limitado pelo teto do tema e o ajuste fino do escopo para esse nível (se houver).
 */
export interface MotionContextValue {
  level: MotionLevel;
  tune?: Partial<MotionSpec>;
}

export const MotionContext = createContext<MotionContextValue | null>(null);

export const EMPTY_REGISTRY: Record<string, ThemeConfig> = Object.freeze({}) as Record<string, ThemeConfig>;

/** Chave estável de uma entrada de tema (id ou config inline) para memoização. */
export const themeInputKey = (input: string | ThemeConfig | undefined): string =>
  input === undefined ? "" : typeof input === "string" ? `id:${input}` : `config:${JSON.stringify(input)}`;
