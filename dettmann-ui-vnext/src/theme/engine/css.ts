import type { ResolvedTheme } from "./create-theme";

const decls = (...maps: Record<string, string>[]) =>
  maps.map((m) => Object.entries(m).map(([k, v]) => `--ui-${k}:${v};`).join("")).join("");

/**
 * Serializa o tema em duas regras (claro e escuro), uma por linha. Com `root`, o tema
 * também vale como padrão do documento: `:where(:root)` entra antes do seletor claro e
 * `:where(.dark, [data-ui-mode="dark"])` antes do escuro (especificidade zero: outro
 * `data-theme` sempre vence, em qualquer ordem). O escuro também cobre ilhas
 * `[data-ui-mode="dark"]` dentro de um escopo do tema.
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
  return `${light}{${decls(theme.shared, theme.light)}}\n${dark}{${decls(theme.dark)}}\n`;
}
