import { createTheme, toCSS, ThemeConfigError, type ResolvedTheme, type ThemeConfig } from "./engine";
import { DEFAULT_PRESET, PRESETS } from "./presets";
import { isDev } from "../dev/env";

const isPresetId = (id: string) => Object.prototype.hasOwnProperty.call(PRESETS, id);

/**
 * Injeta o CSS de um tema de runtime em um único `<style data-dettmann-theme="<id>">`,
 * substituído a cada chamada. Presets embutidos já estão no CSS gerado e nunca são
 * injetados. Sem `document` (SSR) é no-op.
 */
export function injectTheme(theme: ResolvedTheme, doc: Document | undefined = typeof document === "undefined" ? undefined : document): void {
  if (!doc || isPresetId(theme.id)) return;
  let style = [...doc.head.querySelectorAll<HTMLStyleElement>("style[data-dettmann-theme]")].find(
    (s) => s.getAttribute("data-dettmann-theme") === theme.id,
  );
  if (!style) {
    style = doc.createElement("style");
    style.setAttribute("data-dettmann-theme", theme.id);
    doc.head.appendChild(style);
  }
  const css = toCSS(theme);
  if (style.textContent !== css) style.textContent = css;
}

/** Id válido: preset embutido ou chave própria do registro do consumidor. */
export function isKnownThemeId(id: string, registry: Record<string, ThemeConfig>): boolean {
  return isPresetId(id) || Object.prototype.hasOwnProperty.call(registry, id);
}

/** Mensagens já reportadas em produção: cada erro aparece uma vez por sessão. */
const reported = new Set<string>();

const cache = new Map<string, ResolvedTheme>();
const CACHE_LIMIT = 64;

function build(config: ThemeConfig, mode: "dev" | "prod"): ResolvedTheme {
  const key = `${mode}:${JSON.stringify(config)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const theme = createTheme(config, { mode });
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, theme);
  return theme;
}

/**
 * Resolve um id (preset embutido ou chave de `registry`) ou uma config inline.
 * Ids embutidos têm precedência sobre o registro. Id desconhecido ou config inválida:
 * em dev lança `ThemeConfigError`; em produção faz `console.error` (uma vez por mensagem)
 * e usa o preset padrão.
 */
export function resolveThemeInput(input: string | ThemeConfig, registry: Record<string, ThemeConfig>): ResolvedTheme {
  const mode = isDev() ? "dev" : "prod";
  try {
    if (typeof input !== "string") return build(input, mode);
    if (!isKnownThemeId(input, registry))
      throw new ThemeConfigError("theme", input, "a preset id or a key of `themes`");
    return build(isPresetId(input) ? PRESETS[input as keyof typeof PRESETS] : registry[input]!, mode);
  } catch (err) {
    if (mode === "dev" || !(err instanceof ThemeConfigError)) throw err;
    if (!reported.has(err.message)) {
      reported.add(err.message);
      console.error(err.message);
    }
    return build(PRESETS[DEFAULT_PRESET], mode);
  }
}
