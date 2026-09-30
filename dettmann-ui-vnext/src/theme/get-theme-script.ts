/** Default localStorage key for the color mode. */
export const THEME_STORAGE_KEY = "ui-theme-mode";

/** Default localStorage key for the preset name (`data-theme`). */
export const THEME_NAME_STORAGE_KEY = "ui-theme";

export interface GetThemeScriptOptions {
  /** Storage key — must match ThemeProvider `storageKey`. */
  storageKey?: string;
  /** Storage key for the preset name. */
  themeStorageKey?: string;
  /** Fallback when storage is empty or invalid. */
  defaultMode?: "light" | "dark" | "system";
  /** Preset applied before paint. `default` leaves data-theme unset. */
  defaultTheme?: string;
}

/**
 * Blocking inline script: reads mode and preset and applies `.dark` plus
 * `data-theme` on `<html>` before first paint.
 */
export function getThemeScript(options: GetThemeScriptOptions = {}): string {
  const storageKey = options.storageKey ?? THEME_STORAGE_KEY;
  const themeKey = options.themeStorageKey ?? THEME_NAME_STORAGE_KEY;
  const defaultMode = options.defaultMode ?? "system";
  const defaultTheme = options.defaultTheme ?? "forest";

  return `(function(){try{var mk=${JSON.stringify(storageKey)};var tk=${JSON.stringify(themeKey)};var d=${JSON.stringify(defaultMode)};var dt=${JSON.stringify(defaultTheme)};var s=localStorage.getItem(mk);var m=(s==="light"||s==="dark"||s==="system")?s:d;var mode=m==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):m;var theme=localStorage.getItem(tk)||dt;var e=document.documentElement;e.classList.remove("light");e.classList.toggle("dark",mode==="dark");if(theme&&theme!=="default")e.setAttribute("data-theme",theme);else e.removeAttribute("data-theme");e.style.colorScheme=mode;}catch(e){}})();`;
}
