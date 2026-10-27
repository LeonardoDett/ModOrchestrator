import type { ResolvedTheme } from "./create-theme";

const decls = (...maps: Record<string, string>[]) =>
  maps.map((m) => Object.entries(m).map(([k, v]) => `--ui-${k}:${v};`).join("")).join("");

/**
 * Serializa o tema em regras (claro, escuro e claro forçado), uma por linha. Com `root`, o tema
 * também vale como padrão do documento: `:where(:root)` entra antes do seletor claro e
 * `:where(.dark, [data-ui-mode="dark"])` antes do escuro (especificidade zero: outro
 * `data-theme` sempre vence, em qualquer ordem). O escuro também cobre ilhas
 * `[data-ui-mode="dark"]` dentro de um escopo do tema. Uma terceira regra, depois do
 * escuro, força o claro em `[data-theme="id"][data-ui-mode="light"]` (só papéis por modo),
 * para que um escopo claro dentro de `.dark` volte ao claro.
 */
export function toCSS(theme: ResolvedTheme, opts: { root?: boolean } = {}): string {
  const t = `[data-theme="${theme.id}"]`;
  const light = `${opts.root ? ":where(:root)," : ""}${t}`;
  const dark = [
    `${opts.root ? ':where(.dark, [data-ui-mode="dark"]),' : ""}.dark ${t}`,
    `.dark${t}`,
    `${t}[data-ui-mode="dark"]`,
    `[data-ui-mode="dark"] ${t}`,
    `${t} [data-ui-mode="dark"]`,
  ].join(",");
  const forcedLight = `${t}[data-ui-mode="light"]`;
  return `${light}{${decls(theme.shared, theme.light)}}\n${dark}{${decls(theme.dark)}}\n${forcedLight}{${decls(theme.light)}}\n`;
}
