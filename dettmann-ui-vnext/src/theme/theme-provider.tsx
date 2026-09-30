"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ThemeContext } from "./theme-context";
import type { ThemeMode, ResolvedTheme, ThemeRegistry } from "./theme-definitions";
import { THEME_NAME_STORAGE_KEY, THEME_STORAGE_KEY } from "./get-theme-script";
import { applyInputs, resetInputs, type ThemeInputs } from "./theme-inputs";
import { THEME_REGISTRY } from "./theme-definitions";

export interface ThemeProviderProps {
  children: ReactNode;
  defaultMode?: ThemeMode;
  defaultTheme?: string;
  theme?: string;
  storageKey?: string;
  themeStorageKey?: string;
  targetSelector?: string;
  disableTransitionOnChange?: boolean;
  /** Add product-specific recipes without changing the library source. */
  themes?: ThemeRegistry;
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === "system" ? getSystemTheme() : mode;
}
function readStored(key: string): string | null {
  try { return typeof window === "undefined" ? null : localStorage.getItem(key); } catch { return null; }
}
function writeStored(key: string, value: string): void {
  try { if (typeof window !== "undefined") localStorage.setItem(key, value); } catch { /* storage is optional */ }
}
function isMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function ThemeProvider({
  children,
  defaultMode = "system",
  defaultTheme = "forest",
  theme: themeProp,
  storageKey = THEME_STORAGE_KEY,
  themeStorageKey = THEME_NAME_STORAGE_KEY,
  targetSelector,
  disableTransitionOnChange = false,
  themes = THEME_REGISTRY,
}: ThemeProviderProps) {
  const initialTheme = themeProp ?? defaultTheme;
  const [mode, setModeState] = useState<ThemeMode>(defaultMode);
  const [resolvedMode, setResolvedMode] = useState<ResolvedTheme>(defaultMode === "dark" ? "dark" : "light");
  const [theme, setThemeState] = useState(initialTheme);
  const [inputs, setInputsState] = useState<ThemeInputs>({});
  const [mounted, setMounted] = useState(false);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    writeStored(storageKey, newMode);
  }, [storageKey]);
  const setTheme = useCallback((next: string) => {
    setThemeState(next);
    writeStored(themeStorageKey, next);
  }, [themeStorageKey]);
  const setInputs = useCallback((partial: ThemeInputs) => {
    setInputsState((current) => ({ light: { ...current.light, ...partial.light }, dark: { ...current.dark, ...partial.dark } }));
  }, []);
  const clearOverrides = useCallback(() => setInputsState({}), []);

  useEffect(() => {
    const storedMode = readStored(storageKey);
    const storedTheme = readStored(themeStorageKey);
    const nextMode = isMode(storedMode) ? storedMode : defaultMode;
    setModeState(nextMode);
    setResolvedMode(resolveTheme(nextMode));
    setThemeState(storedTheme || initialTheme);
    setMounted(true);
  }, [storageKey, themeStorageKey, defaultMode, initialTheme]);

  useEffect(() => { if (mounted) setResolvedMode(resolveTheme(mode)); }, [mode, mounted]);

  useEffect(() => {
    if (!mounted || mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handle = () => setResolvedMode(getSystemTheme());
    media.addEventListener("change", handle);
    return () => media.removeEventListener("change", handle);
  }, [mode, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const target = targetSelector ? document.querySelector(targetSelector) : document.documentElement;
    if (!(target instanceof HTMLElement)) return;
    const apply = () => {
      target.classList.toggle("dark", resolvedMode === "dark");
      target.classList.toggle("light", resolvedMode === "light");
      const knownTheme = themes[theme];
      if (theme && theme !== "default" && knownTheme) target.setAttribute("data-theme", theme);
      else if (theme && theme !== "default") target.setAttribute("data-theme", theme);
      else target.removeAttribute("data-theme");
      resetInputs(target);
      target.style.colorScheme = resolvedMode;
    };
    if (!disableTransitionOnChange) { apply(); return; }
    const style = document.createElement("style");
    style.textContent = "*,*::before,*::after{transition:none!important}";
    document.head.appendChild(style);
    apply();
    requestAnimationFrame(() => requestAnimationFrame(() => style.remove()));
  }, [mounted, resolvedMode, theme, targetSelector, disableTransitionOnChange, themes]);

  useEffect(() => {
    if (!mounted) return;
    const target = targetSelector ? document.querySelector(targetSelector) : document.documentElement;
    if (!(target instanceof HTMLElement)) return;
    applyInputs(inputs, target, resolvedMode);
  }, [mounted, inputs, targetSelector, resolvedMode]);

  const value = useMemo(() => ({ mode, resolvedTheme: resolvedMode, resolvedMode, setMode, theme, setTheme, setInputs, resetInputs: clearOverrides }), [mode, resolvedMode, setMode, theme, setTheme, setInputs, clearOverrides]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
