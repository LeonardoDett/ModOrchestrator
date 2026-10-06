import type { ResolvedTheme } from "./create-theme";

const decls = (...maps: Record<string, string>[]) =>
  maps.map((m) => Object.entries(m).map(([k, v]) => `--ui-${k}:${v};`).join("")).join("");

/**
 * Serializa o tema em duas regras (claro e escuro), uma por linha. Com `root`, o tema
 * também vale como padrão do documento: `:root` entra antes do seletor claro e `.dark`
 * antes do seletor escuro.
 */
export function toCSS(theme: ResolvedTheme, opts: { root?: boolean } = {}): string {
  const t = `[data-theme="${theme.id}"]`;
  const light = `${opts.root ? ":root," : ""}${t}`;
  const dark = [
    `${opts.root ? ".dark," : ""}.dark ${t}`,
    `.dark${t}`,
    `${t}[data-ui-mode="dark"]`,
    `[data-ui-mode="dark"] ${t}`,
  ].join(",");
  return `${light}{${decls(theme.shared, theme.light)}}\n${dark}{${decls(theme.dark)}}\n`;
}
