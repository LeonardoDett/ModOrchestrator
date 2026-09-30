import type { Translator } from "../i18n/i18n";

/**
 * A failure as the UI sees it (INV-OPS-05): a stable code, parameters for
 * the translated message and an optional technical detail for "Details".
 * The backend never sends user-facing text.
 */
export interface UIError {
  code: string;
  params: Record<string, string>;
  detail?: string;
}

export const OFFLINE_ERROR = "backend_offline";

/** Error thrown by the offline backend. */
export class CodedError extends Error {
  constructor(readonly ui: UIError) {
    super(JSON.stringify(ui));
  }
}

/**
 * Normalizes whatever a bridge call rejected with. Wails rejects with the
 * Go error string, which the bridge makes a JSON {code, params, detail}.
 */
export function toUIError(error: unknown): UIError {
  if (error instanceof CodedError) return error.ui;
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  try {
    const parsed = JSON.parse(raw) as Partial<UIError>;
    if (parsed && typeof parsed.code === "string") {
      return { code: parsed.code, params: parsed.params ?? {}, detail: parsed.detail };
    }
  } catch {
    // Not a coded error: fall through.
  }
  return { code: "internal", params: {}, detail: raw || undefined };
}

/** Translated, human message for an error code. */
export function errorMessage(i18n: Translator, error: UIError): string {
  const key = `error.${error.code}`;
  return i18n.has(key) ? i18n.t(key, error.params) : i18n.t("error.unknown", { code: error.code });
}
