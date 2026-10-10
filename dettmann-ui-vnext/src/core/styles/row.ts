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
}

const SHARED = "relative flex gap-2 px-3 text-sm motion-transition focus-ring-inset";
const SINGLE = "items-center h-control-sm";
const MULTI = "items-start min-h-control-sm py-1.5";

const INDICATOR = {
  start: "before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-pill before:bg-brand-fill",
  bottom: "before:absolute before:inset-x-0 before:bottom-0 before:h-0.5 before:rounded-pill before:bg-brand-fill",
  none: "",
} as const;

/**
 * Linha selecionável compacta (D-033): tabelas, árvores, listas e itens de menu
 * compartilham altura, camada de estado, indicador de seleção e anel interno.
 */
export function rowRecipe({ selected = false, active = false, disabled = false, indicator = "start", multiline = false }: RowRecipeOptions = {}): string {
  const BASE = cn(SHARED, multiline ? MULTI : SINGLE);
  if (disabled) return cn(BASE, "text-fg-subtle cursor-not-allowed");
  return cn(
    BASE,
    "cursor-pointer text-fg",
    // Repouso opaco (selecionado): a camada de estado compõe por cima; repouso transparente: substitui.
    selected && cn("bg-selected font-medium", INDICATOR[indicator]),
    selected && active && "state-layer-hover",
    !selected && active && "bg-state-hover",
    !selected && !active && "hover:bg-state-hover active:bg-state-pressed",
  );
}
