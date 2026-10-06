import { createContext } from "react";
import type { ThemeInputs } from "./theme-inputs";
import type { ResolvedTheme, ThemeMode } from "./theme-definitions";

export interface ThemeContextValue {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  resolvedMode: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  theme: string;
  setTheme: (theme: string) => void;
  setInputs: (partial: ThemeInputs) => void;
  resetInputs: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
