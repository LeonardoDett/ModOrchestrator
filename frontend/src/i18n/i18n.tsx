import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { en, type MessageKey } from "./catalog/en";
import { ptBR } from "./catalog/pt-BR";

/** Languages of V1 (D044), matching the ui.language setting options. */
export const LANGUAGES = ["en", "pt-BR"] as const;
export type Language = (typeof LANGUAGES)[number];

export const CATALOGS: Record<Language, Record<MessageKey, string>> = { en, "pt-BR": ptBR };

export type { MessageKey };
export type Params = Record<string, string | number>;

/** Base keys of plural messages ("x" for "x.one"/"x.other"). */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}.other` ? Base : never;
}[MessageKey];

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

function interpolate(template: string, params?: Params, language?: Language): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === "number" ? new Intl.NumberFormat(language).format(value) : value;
  });
}

export interface Translator {
  language: Language;
  /** Translates a catalog key. */
  t: (key: MessageKey, params?: Params) => string;
  /** Translates a plural message by count (Intl plural rules). */
  tp: (key: PluralKey, count: number, params?: Params) => string;
  /** Whether a dynamic key exists (open sets such as operation kinds). */
  has: (key: string) => key is MessageKey;
  formatDateTime: (iso: string | undefined) => string;
  /** Time of day only, for dense logs. */
  formatTime: (iso: string | undefined) => string;
  formatDuration: (ms: number) => string;
}

export function createTranslator(language: Language): Translator {
  const catalog = CATALOGS[language];
  const plural = new Intl.PluralRules(language);
  const dateTime = new Intl.DateTimeFormat(language, { dateStyle: "short", timeStyle: "medium" });
  const seconds = new Intl.NumberFormat(language, { style: "unit", unit: "second", unitDisplay: "narrow", maximumFractionDigits: 1 });
  const minutes = new Intl.NumberFormat(language, { style: "unit", unit: "minute", unitDisplay: "narrow", maximumFractionDigits: 1 });
  const time = new Intl.DateTimeFormat(language, { timeStyle: "medium" });
  const format = (formatter: Intl.DateTimeFormat, iso: string | undefined) => {
    const date = iso ? new Date(iso) : null;
    return !date || Number.isNaN(date.getTime()) ? catalog["common.empty"] : formatter.format(date);
  };
  const has = (key: string): key is MessageKey => Object.prototype.hasOwnProperty.call(catalog, key);
  const t = (key: MessageKey, params?: Params) => interpolate(catalog[key] ?? key, params, language);
  return {
    language,
    t,
    tp: (key, count, params) => {
      const form = `${key}.${plural.select(count)}`;
      const resolved = has(form) ? form : (`${key}.other` as MessageKey);
      return t(resolved, { count, ...params });
    },
    has,
    formatDateTime: (iso) => format(dateTime, iso),
    formatTime: (iso) => format(time, iso),
    formatDuration: (ms) => (ms < 60_000 ? seconds.format(ms / 1000) : minutes.format(ms / 60_000)),
  };
}

const I18nContext = createContext<Translator>(createTranslator("en"));

export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  const translator = useMemo(() => createTranslator(language), [language]);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return <I18nContext.Provider value={translator}>{children}</I18nContext.Provider>;
}

export function useI18n(): Translator {
  return useContext(I18nContext);
}
