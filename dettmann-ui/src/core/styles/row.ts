import { cn } from "./cn";

export interface RowRecipeOptions {
  /** Linha selecionada: fundo `selected` + indicador da marca. Nunca bloco preenchido. */
  selected?: boolean;
  /** Item sob o teclado sem foco real (`aria-activedescendant`). */
  active?: boolean;
  disabled?: boolean;
  /** Borda que recebe o indicador de 2 px (padrão `start`; abas usam `bottom`). */
  indicator?: "start" | "bottom" | "none";
  /** Conteúdo de mais de uma linha (rótulo + descrição): altura mínima no lugar da fixa. */
  multiline?: boolean;
  /** `danger` para ação destrutiva (item de menu): troca a cor do texto e a camada de hover. */
  tone?: "default" | "danger";
}

const SHARED = "relative flex gap-2 px-3 text-sm motion-transition focus-ring-inset";
const SINGLE = "items-center h-control-sm";
const MULTI = "items-start min-h-control-sm py-1.5";

const INDICATOR = {
  start: "before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-pill before:bg-brand-fill",
  bottom: "before:absolute before:inset-x-0 before:bottom-0 before:h-0.5 before:rounded-pill before:bg-brand-fill",
  none: "",
} as const;

// Uma cor de texto e uma camada de estado por combinação: o `cn` não resolve conflito de classes.
const TONE = {
  default: { text: "text-fg", active: "bg-state-hover", rest: "hover:bg-state-hover active:bg-state-pressed" },
  danger: { text: "text-danger-text", active: "bg-danger-subtle", rest: "hover:bg-danger-subtle" },
} as const;

/**
 * Linha selecionável compacta (D-033): tabelas, árvores, listas e itens de menu
 * compartilham altura, camada de estado, indicador de seleção e anel interno.
 */
export function rowRecipe({
  selected = false,
  active = false,
  disabled = false,
  indicator = "start",
  multiline = false,
  tone = "default",
}: RowRecipeOptions = {}): string {
  const base = cn(SHARED, multiline ? MULTI : SINGLE);
  // Sem `pointer-events-none`: quem usa a linha decide o que o clique faz (ex.: não fechar o menu).
  if (disabled) return cn(base, "text-fg-subtle cursor-not-allowed");
  const t = TONE[tone];
  return cn(
    base,
    "cursor-pointer",
    t.text,
    // Repouso opaco (selecionado): a camada de estado compõe por cima; repouso transparente: substitui.
    selected && cn("bg-selected font-medium", INDICATOR[indicator]),
    selected && active && "state-layer-hover",
    !selected && active && t.active,
    !selected && !active && t.rest,
  );
}
