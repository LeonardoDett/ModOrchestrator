import { useCallback, useContext, useMemo } from "react";
import { ThemeContext, type ThemeMode } from "./theme-context";
import type { Mode, ResolvedTheme, ThemeConfig } from "./engine";
export type { ThemeMode } from "./theme-context";

export interface UseThemeReturn {
  mode: ThemeMode;
  resolvedMode: Mode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  theme: ResolvedTheme;
  setTheme: (next: string | ThemeConfig) => void;
}

export function useTheme(): UseThemeReturn {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider.");
  const { mode, resolvedMode, setMode, theme, setTheme } = context;
  const isDark = resolvedMode === "dark";
  const toggle = useCallback(() => setMode(isDark ? "light" : "dark"), [isDark, setMode]);
  return useMemo(
    () => ({ mode, resolvedMode, isDark, setMode, toggle, theme, setTheme }),
    [mode, resolvedMode, isDark, setMode, toggle, theme, setTheme],
  );
}
