import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useTheme } from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { toUIError, type UIError } from "../bridge/errors";
import { useBackendQuery } from "../bridge/use-backend-query";
import type { Setting } from "../bridge/types";
import { I18nProvider, isLanguage, type Language } from "../i18n/i18n";

/** Presentation defaults used only while settings are unavailable (offline). */
const FALLBACK = { language: "en", mode: "dark", theme: "orchestrator", density: "comfortable" } as const;

export type Density = "comfortable" | "compact";

interface SettingsContextValue {
  status: "loading" | "unavailable" | "error" | "ready";
  error?: UIError;
  settings: readonly Setting[];
  get: (key: string) => Setting | undefined;
  /** Stores a value in the backend, then rereads; resolves with the error, if any. */
  set: (key: string, value: string) => Promise<UIError | null>;
  reset: (key: string) => Promise<UIError | null>;
  language: Language;
  density: Density;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * App settings come from the backend (state.db is their source of truth,
 * docs-ia/03). The provider applies the presentation ones: language, theme
 * and density.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const backend = useBackend();
  const query = useBackendQuery((b) => b.listAppSettings(), []);
  const settings = query.status === "ready" ? query.data : [];
  const { reload } = query;

  const get = useCallback((key: string) => settings.find((s) => s.key === key), [settings]);

  const mutate = useCallback(
    async (call: () => Promise<void>) => {
      try {
        await call();
        return null;
      } catch (error) {
        return toUIError(error);
      } finally {
        reload();
      }
    },
    [reload],
  );

  const relativeTimes = get("ui.relativeTimes")?.value === "true";
  const languageValue = get("ui.language")?.value;
  const language: Language = isLanguage(languageValue) ? languageValue : FALLBACK.language;
  const density: Density = get("theme.density")?.value === "compact" ? "compact" : FALLBACK.density;

  const value = useMemo<SettingsContextValue>(
    () => ({
      status: query.status,
      error: query.status === "error" ? query.error : undefined,
      settings,
      get,
      set: (key, v) => mutate(() => backend.setAppSetting(key, v)),
      reset: (key) => mutate(() => backend.resetAppSetting(key)),
      language,
      density,
    }),
    [query, settings, get, mutate, backend, language, density],
  );

  return (
    <SettingsContext.Provider value={value}>
      <ThemeSync mode={get("theme.mode")?.value ?? FALLBACK.mode} theme={get("theme.id")?.value ?? FALLBACK.theme} />
      <PresentationSync
        reduceMotion={get("ui.reduceMotion")?.value === "true"}
        compactHeaders={get("ui.compactHeaders")?.value === "true"}
        fontScale={Number(get("theme.fontScale")?.value ?? "100") || 100}
      />
      <I18nProvider language={language} relativeTimes={relativeTimes}>
        {children}
      </I18nProvider>
    </SettingsContext.Provider>
  );
}

function ThemeSync({ mode, theme }: { mode: string; theme: string }) {
  const { setMode, setTheme } = useTheme();
  useEffect(() => {
    if (mode === "dark" || mode === "light" || mode === "system") setMode(mode);
  }, [mode, setMode]);
  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);
  return null;
}

/**
 * Presentation settings of core/13 applied to the document: reduced motion
 * and compact headers as data attributes (styled in app.css), the font
 * scale as the root font size (every rem follows it).
 */
function PresentationSync({ reduceMotion, compactHeaders, fontScale }: { reduceMotion: boolean; compactHeaders: boolean; fontScale: number }) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.reduceMotion = String(reduceMotion);
    root.dataset.compactHeaders = String(compactHeaders);
    root.style.fontSize = fontScale === 100 ? "" : `${fontScale}%`;
  }, [reduceMotion, compactHeaders, fontScale]);
  return null;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside <SettingsProvider>");
  return value;
}
