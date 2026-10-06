/** Default localStorage key for the color mode. */
export const THEME_STORAGE_KEY = "ui-theme-mode";

/** Default localStorage key for the theme id (`data-theme`). */
export const THEME_NAME_STORAGE_KEY = "ui-theme";

export interface GetThemeScriptOptions {
  /** Storage key — must match ThemeProvider `storageKey`. */
  storageKey?: string;
  /** Storage key for the theme id — must match ThemeProvider `themeStorageKey`. */
  themeStorageKey?: string;
  /** Fallback when storage is empty or invalid. */
  defaultMode?: "light" | "dark" | "system";
  /** Theme id applied before paint when storage is empty. Default `"forest"`. */
  defaultTheme?: string;
}

/**
 * Blocking inline script: reads mode and theme id and applies `.dark` plus
 * `data-theme` on `<html>` before first paint. Self-contained (no imports) so it can
 * be inlined; storage or `matchMedia` failures fall back to the defaults.
 */
export function getThemeScript(options: GetThemeScriptOptions = {}): string {
  const storageKey = options.storageKey ?? THEME_STORAGE_KEY;
  const themeKey = options.themeStorageKey ?? THEME_NAME_STORAGE_KEY;
  const defaultMode = options.defaultMode ?? "system";
  const defaultTheme = options.defaultTheme ?? "forest";

  return `(function(){var mk=${JSON.stringify(storageKey)},tk=${JSON.stringify(themeKey)},d=${JSON.stringify(defaultMode)},dt=${JSON.stringify(defaultTheme)};function g(k){try{return localStorage.getItem(k)}catch(e){return null}}var s=g(mk),m=(s==="light"||s==="dark"||s==="system")?s:d,mode=m;if(m==="system"){try{mode=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){mode="light"}}var e=document.documentElement;e.setAttribute("data-theme",g(tk)||dt);e.classList.remove("light");e.classList.toggle("dark",mode==="dark");e.style.colorScheme=mode;})();`;
}
