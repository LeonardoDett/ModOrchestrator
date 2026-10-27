"use client";

import { useCallback, useEffect, useInsertionEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Mode, ThemeConfig } from "./engine";
import { DEFAULT_PRESET } from "./presets";
import { THEME_NAME_STORAGE_KEY, THEME_STORAGE_KEY } from "./get-theme-script";
import { injectTheme, isKnownThemeId, resolveThemeInput, warnShadowedRegistryIds } from "./inject";
import { isDev } from "../dev/env";
import { useBudgetGuard } from "../dev/budget";
import { useIsomorphicLayoutEffect } from "../utils/use-isomorphic-layout-effect";
import { EMPTY_REGISTRY, ThemeContext, ThemeScopeContext, themeInputKey, type ThemeMode } from "./theme-context";

export interface ThemeProviderProps {
  children: ReactNode;
  /** Tema controlado: id de preset, chave de `themes` ou config inline. Vence o valor salvo. */
  theme?: string | ThemeConfig;
  /** Id usado quando não há `theme` nem valor salvo válido. Padrão `"orchestrator"`. */
  defaultTheme?: string;
  /** Registro do consumidor (id → config); seus temas são resolvidos e injetados em runtime. */
  themes?: Record<string, ThemeConfig>;
  defaultMode?: ThemeMode;
  storageKey?: string;
  themeStorageKey?: string;
  targetSelector?: string;
  disableTransitionOnChange?: boolean;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemMedia(): MediaQueryList | null {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;
  } catch {
    return null;
  }
}

function subscribeSystemDark(onChange: () => void): () => void {
  const media = systemMedia();
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}
const getSystemDark = () => systemMedia()?.matches ?? false;
const getServerSystemDark = () => false;
const useSystemDark = () => useSyncExternalStore(subscribeSystemDark, getSystemDark, getServerSystemDark);

function subscribeStorage(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
const getServerStored = () => null;
function useStoredValue(key: string): string | null {
  const read = useCallback(() => readStored(key), [key]);
  return useSyncExternalStore(subscribeStorage, read, getServerStored);
}

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
  // Valores salvos lidos durante a renderização no cliente (o primeiro commit já usa o tema
  // salvo, sem quadro com o padrão); na hidratação vale o snapshot do servidor (`null`) e o
  // React re-renderiza com o do cliente. Mudanças em outras abas chegam pelo evento `storage`.
  const storedModeRaw = useStoredValue(storageKey);
  const storedThemeRaw = useStoredValue(themeStorageKey);
  const systemDark = useSystemDark();

  const [chosenMode, setChosenMode] = useState<ThemeMode | undefined>(undefined);
  const [chosenTheme, setChosenTheme] = useState<string | ThemeConfig | undefined>(undefined);
  const [mounted, setMounted] = useState(false);

  // Tema controlado: uma mudança da prop descarta a escolha feita por `setTheme`.
  const propKey = themeInputKey(themeProp);
  const [prevPropKey, setPrevPropKey] = useState(propKey);
  if (propKey !== prevPropKey) {
    setPrevPropKey(propKey);
    setChosenTheme(undefined);
  }

  const mode: ThemeMode = chosenMode ?? (isMode(storedModeRaw) ? storedModeRaw : defaultMode);
  const resolvedMode: Mode = mode === "system" ? (systemDark ? "dark" : "light") : mode;
  const selected: string | ThemeConfig =
    chosenTheme ??
    themeProp ??
    (storedThemeRaw && isKnownThemeId(storedThemeRaw, themes) ? storedThemeRaw : defaultTheme);

  const setMode = useCallback(
    (next: ThemeMode) => {
      setChosenMode(next);
      writeStored(storageKey, next);
    },
    [storageKey],
  );
  const setTheme = useCallback(
    (next: string | ThemeConfig) => {
      setChosenTheme(next);
      if (typeof next === "string") writeStored(themeStorageKey, next);
    },
    [themeStorageKey],
  );

  // O `<html>` só é tocado depois da montagem (antes do paint): na hidratação ele mantém
  // o que o script pré-paint aplicou até o estado do cliente estar resolvido.
  useIsomorphicLayoutEffect(() => setMounted(true), []);

  const selectedKey = themeInputKey(selected);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = useMemo(() => resolveThemeInput(selected, themes), [selectedKey, themes]);

  useInsertionEffect(() => injectTheme(theme), [theme]);
  useEffect(() => warnShadowedRegistryIds(themes), [themes]);

  useIsomorphicLayoutEffect(() => {
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

  useBudgetGuard(isDev());

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
