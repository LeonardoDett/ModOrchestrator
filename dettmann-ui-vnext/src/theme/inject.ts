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

/** Mensagens já reportadas (erros em produção, avisos em dev): cada uma aparece uma vez por sessão. */
const reported = new Set<string>();

function reportOnce(key: string, log: () => void): void {
  if (reported.has(key)) return;
  reported.add(key);
  log();
}

const cache = new Map<string, ResolvedTheme>();
const CACHE_LIMIT = 64;

function build(config: ThemeConfig, mode: "dev" | "prod"): ResolvedTheme {
  const key = `${mode}:${JSON.stringify(config)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const theme = createTheme(config, { mode });
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, theme);
  // Spec 11: override que viola meta de contraste avisa em dev (uma vez por tema) e é respeitado.
  if (mode === "dev")
    for (const w of theme.warnings)
      reportOnce(`warn\u0000${key}\u0000${w}`, () => console.warn(`[dettmann-ui] theme "${theme.id}": ${w}`));
  return theme;
}

/** Em dev, avisa (uma vez por id) quando o registro do consumidor usa o id de um preset embutido, que vence. */
export function warnShadowedRegistryIds(registry: Record<string, ThemeConfig>): void {
  if (!isDev()) return;
  for (const id of Object.keys(registry))
    if (isPresetId(id))
      reportOnce(`shadow\u0000${id}`, () =>
        console.warn(`[dettmann-ui] themes["${id}"] is ignored: "${id}" is a built-in preset id, which takes precedence. Use another id.`),
      );
}

/**
 * Resolve um id (preset embutido ou chave de `registry`) ou uma config inline.
 * Ids embutidos têm precedência sobre o registro. Id desconhecido ou config inválida
 * (inclusive entrada mal tipada, como `null`): em dev lança; em produção faz
 * `console.error` (uma vez por mensagem) e usa o preset padrão.
 */
export function resolveThemeInput(input: string | ThemeConfig, registry: Record<string, ThemeConfig>): ResolvedTheme {
  const mode = isDev() ? "dev" : "prod";
  try {
    if (typeof input !== "string") return build(input, mode);
    if (!isKnownThemeId(input, registry))
      throw new ThemeConfigError("theme", input, "a preset id or a key of `themes`");
    return build(isPresetId(input) ? PRESETS[input as keyof typeof PRESETS] : registry[input]!, mode);
  } catch (err) {
    if (mode === "dev") throw err;
    const message =
      err instanceof ThemeConfigError
        ? err.message
        : `[dettmann-ui] invalid theme input (${err instanceof Error ? err.message : String(err)}); using "${DEFAULT_PRESET}".`;
    reportOnce(message, () => console.error(message));
    return build(PRESETS[DEFAULT_PRESET], mode);
  }
}
