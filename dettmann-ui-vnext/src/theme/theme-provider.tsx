"use client";

import { useCallback, useEffect, useInsertionEffect, useMemo, useState, type ReactNode } from "react";
import type { Mode, ThemeConfig } from "./engine";
import { DEFAULT_PRESET } from "./presets";
import { THEME_NAME_STORAGE_KEY, THEME_STORAGE_KEY } from "./get-theme-script";
import { injectTheme, isKnownThemeId, resolveThemeInput } from "./inject";
import { EMPTY_REGISTRY, ThemeContext, ThemeScopeContext, themeInputKey, type ThemeMode } from "./theme-context";

export interface ThemeProviderProps {
  children: ReactNode;
  /** Tema controlado: id de preset, chave de `themes` ou config inline. Vence o valor salvo. */
  theme?: string | ThemeConfig;
  /** Id usado quando não há `theme` nem valor salvo válido. Padrão `"forest"`. */
  defaultTheme?: string;
  /** Registro do consumidor (id → config); seus temas são resolvidos e injetados em runtime. */
  themes?: Record<string, ThemeConfig>;
  defaultMode?: ThemeMode;
  storageKey?: string;
  themeStorageKey?: string;
  targetSelector?: string;
  disableTransitionOnChange?: boolean;
}

function getSystemMode(): Mode {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}
const resolveMode = (mode: ThemeMode): Mode => (mode === "system" ? getSystemMode() : mode);

function readStored(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStored(key: string, value: string): void {
  try {
    if (typeof window !== "undefined") localStorage.setItem(key, value);
  } catch {
    /* storage is optional */
  }
}
const isMode = (value: string | null): value is ThemeMode => value === "light" || value === "dark" || value === "system";

export function ThemeProvider({
  children,
  theme: themeProp,
  defaultTheme = DEFAULT_PRESET,
  themes = EMPTY_REGISTRY,
  defaultMode = "system",
  storageKey = THEME_STORAGE_KEY,
  themeStorageKey = THEME_NAME_STORAGE_KEY,
  targetSelector,
  disableTransitionOnChange = false,
}: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(defaultMode);
  const [resolvedMode, setResolvedMode] = useState<Mode>(defaultMode === "dark" ? "dark" : "light");
  const [selected, setSelected] = useState<string | ThemeConfig>(themeProp ?? defaultTheme);
  const [mounted, setMounted] = useState(false);

  // Tema controlado: uma mudança da prop substitui a seleção atual.
  const propKey = themeInputKey(themeProp);
  const [prevPropKey, setPrevPropKey] = useState(propKey);
  if (propKey !== prevPropKey) {
    setPrevPropKey(propKey);
    if (themeProp !== undefined) setSelected(themeProp);
  }

  const setMode = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      writeStored(storageKey, next);
    },
    [storageKey],
  );
  const setTheme = useCallback(
    (next: string | ThemeConfig) => {
      setSelected(next);
      if (typeof next === "string") writeStored(themeStorageKey, next);
    },
    [themeStorageKey],
  );

  useEffect(() => {
    const storedMode = readStored(storageKey);
    const nextMode = isMode(storedMode) ? storedMode : defaultMode;
    setModeState(nextMode);
    setResolvedMode(resolveMode(nextMode));
    if (themeProp === undefined) {
      const storedTheme = readStored(themeStorageKey);
      setSelected(storedTheme && isKnownThemeId(storedTheme, themes) ? storedTheme : defaultTheme);
    }
    setMounted(true);
    // Leitura do armazenamento só na montagem (e se as chaves mudarem).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, themeStorageKey]);

  useEffect(() => {
    if (mounted) setResolvedMode(resolveMode(mode));
  }, [mode, mounted]);

  useEffect(() => {
    if (!mounted || mode !== "system" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handle = () => setResolvedMode(getSystemMode());
    media.addEventListener("change", handle);
    return () => media.removeEventListener("change", handle);
  }, [mode, mounted]);

  const selectedKey = themeInputKey(selected);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = useMemo(() => resolveThemeInput(selected, themes), [selectedKey, themes]);

  useInsertionEffect(() => injectTheme(theme), [theme]);

  useEffect(() => {
    if (!mounted) return;
    const target = targetSelector ? document.querySelector(targetSelector) : document.documentElement;
    if (!(target instanceof HTMLElement)) return;
    const apply = () => {
      target.classList.toggle("dark", resolvedMode === "dark");
      target.classList.toggle("light", resolvedMode === "light");
      target.setAttribute("data-theme", theme.id);
      target.style.colorScheme = resolvedMode;
    };
    if (!disableTransitionOnChange) {
      apply();
      return;
    }
    const style = document.createElement("style");
    style.textContent = "*,*::before,*::after{transition:none!important}";
    document.head.appendChild(style);
    apply();
    requestAnimationFrame(() => requestAnimationFrame(() => style.remove()));
  }, [mounted, resolvedMode, theme, targetSelector, disableTransitionOnChange]);

  const value = useMemo(
    () => ({ mode, resolvedMode, setMode, theme, setTheme }),
    [mode, resolvedMode, setMode, theme, setTheme],
  );
  const scope = useMemo(() => ({ theme, registry: themes }), [theme, themes]);
  return (
    <ThemeContext.Provider value={value}>
      <ThemeScopeContext.Provider value={scope}>{children}</ThemeScopeContext.Provider>
    </ThemeContext.Provider>
  );
}
