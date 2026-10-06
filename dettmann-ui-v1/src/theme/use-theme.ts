import { useCallback, useContext, useMemo } from "react";
import { ThemeContext } from "./theme-context";
export type { ThemeMode, ResolvedTheme } from "./theme-definitions";

export interface UseThemeReturn {
  mode: import("./theme-definitions").ThemeMode;
  resolvedMode: import("./theme-definitions").ResolvedTheme;
  resolvedTheme: import("./theme-definitions").ResolvedTheme;
  isDark: boolean;
  setMode: (mode: import("./theme-definitions").ThemeMode) => void;
  toggle: () => void;
  theme: string;
  setTheme: (theme: string) => void;
  setInputs: (partial: import("./theme-inputs").ThemeInputs) => void;
  resetInputs: () => void;
}

export function useTheme(): UseThemeReturn {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider.");
  const { mode, resolvedMode, setMode, theme, setTheme, setInputs, resetInputs } = context;
  const isDark = resolvedMode === "dark";
  const toggle = useCallback(() => setMode(isDark ? "light" : "dark"), [isDark, setMode]);
  return useMemo(() => ({ mode, resolvedMode, resolvedTheme: resolvedMode, isDark, setMode, toggle, theme, setTheme, setInputs, resetInputs }), [mode, resolvedMode, isDark, setMode, toggle, theme, setTheme, setInputs, resetInputs]);
}
