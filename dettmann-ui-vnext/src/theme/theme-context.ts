import { createContext } from "react";
import type { Mode, ResolvedTheme, ThemeConfig } from "./engine";

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

/** Tema mais próximo (provider ou `ThemeScope`) e o registro do consumidor, para escopos aninhados. */
export interface ThemeScopeContextValue {
  theme: ResolvedTheme;
  registry: Record<string, ThemeConfig>;
}

export const ThemeScopeContext = createContext<ThemeScopeContextValue | null>(null);

export const EMPTY_REGISTRY: Record<string, ThemeConfig> = Object.freeze({}) as Record<string, ThemeConfig>;

/** Chave estável de uma entrada de tema (id ou config inline) para memoização. */
export const themeInputKey = (input: string | ThemeConfig | undefined): string =>
  input === undefined ? "" : typeof input === "string" ? `id:${input}` : `config:${JSON.stringify(input)}`;
