"use client";

import { useRef, type ComponentPropsWithoutRef, type KeyboardEvent, type ReactNode } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useControllableState } from "../../hooks/use-controllable-state";
import type { CategoryColor } from "../../theme/engine";

const swatchVariants = defineRecipe({
  base: [
    "inline-flex items-center justify-center rounded-control border",
    "motion-transition motion-press focus-ring",
    "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-fg-subtle",
  ].join(" "),
  variants: {
    /** Marcado: borda forte de 2 px e fundo de seleção (forma, não só cor). */
    checked: {
      true: "border-2",
      false: "border-border hover:state-layer-hover",
    },
    /** `square` 32 px; `sm`/`md` preenchem a coluna com 34/40 px de altura (pranchas de Organização). */
    size: {
      square: "size-8",
      sm: "h-8.5 w-full",
      md: "h-10 w-full gap-1.5 px-1 text-[0.6875rem] font-medium",
    },
    /** Pintada pela paleta categórica (`data-category` no botão). */
    tinted: { true: "bg-intent-subtle text-intent-text", false: "" },
  },
  compoundVariants: [
    { checked: true, tinted: false, class: "border-fg bg-selected" },
    { checked: true, tinted: true, class: "border-intent-fill" },
    { checked: false, tinted: false, class: "bg-surface" },
  ],
  defaultVariants: { checked: false, size: "square", tinted: false },
});

export interface SwatchOption {
  value: string;
  /** Nome lido pelo leitor de tela e mostrado como dica ("Azul", "Escudo"). */
  label: string;
  disabled?: boolean;
}

export interface SwatchPickerProps extends Omit<ComponentPropsWithoutRef<"div">, "defaultValue" | "onChange"> {
  options: readonly SwatchOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Desenha o conteúdo da amostra (um ponto de cor, um ícone). */
  renderSwatch: (option: SwatchOption, state: { checked: boolean }) => ReactNode;
  /** Colunas da grade (setas para cima e para baixo pulam uma linha). Padrão 8. */
  columns?: number;
  /** `square` (padrão): amostras de 32 px; `sm`/`md`: amostras que preenchem colunas iguais. */
  size?: "square" | "sm" | "md";
  /**
   * Pinta pela paleta categórica: `"self"` usa o valor de cada opção como cor (escolher a
   * cor), uma cor fixa pinta só a marcada (escolher o ícone na cor já escolhida).
   */
  tint?: "self" | CategoryColor;
  "aria-label": string;
}

/**
 * SwatchPicker is a grid radio group of small swatches: colors, icons. It only lays out
 * and selects; the consumer draws each swatch. Arrows move in two dimensions, Home/End
 * jump to the ends, Space/Enter select.
 *
 * @example
 * ```tsx
 * <SwatchPicker aria-label="Cor" columns={8} value={color} onValueChange={setColor}
 *   options={CATEGORY_COLORS.map((c) => ({ value: c, label: t(`color.${c}`) }))}
 *   renderSwatch={(o) => <span data-category={o.value} className="size-4 rounded-chip bg-intent-fill" />} />
 * ```
 */
export function SwatchPicker({
  options,
  value: valueProp,
  defaultValue,
  onValueChange,
  renderSwatch,
  columns = 8,
  size = "square",
  tint,
  className,
  style,
  ...props
}: SwatchPickerProps) {
  const [value, setValue] = useControllableState<string | undefined>({ value: valueProp, defaultValue, onChange: onValueChange as (v: string | undefined) => void });
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const checkedIndex = options.findIndex((o) => o.value === value);
  const tabStop = checkedIndex >= 0 && !options[checkedIndex]!.disabled ? checkedIndex : (enabled[0] ?? -1);

  const move = (from: number, event: KeyboardEvent) => {
    const last = options.length - 1;
    let to: number | null = null;
    if (event.key === "ArrowRight") to = from + 1;
    else if (event.key === "ArrowLeft") to = from - 1;
    else if (event.key === "ArrowDown") to = from + columns;
    else if (event.key === "ArrowUp") to = from - columns;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = last;
    if (to === null) return;
    event.preventDefault();
    const step = event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "End" ? -1 : 1;
    to = Math.min(last, Math.max(0, to));
    while (to >= 0 && to <= last && options[to]!.disabled) to += step;
    if (to < 0 || to > last) return;
    refs.current[to]?.focus();
    setValue(options[to]!.value);
  };

  return (
    <div
      role="radiogroup"
      className={cn("grid gap-1.5", className)}
      style={{ gridTemplateColumns: `repeat(${columns}, ${size === "square" ? "max-content" : "minmax(0, 1fr)"})`, ...style }}
      {...props}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        const color = tint === "self" ? option.value : checked ? tint : undefined;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.label}
            title={option.label}
            disabled={option.disabled}
            tabIndex={index === tabStop ? 0 : -1}
            data-state={checked ? "checked" : "unchecked"}
            data-category={color}
            className={swatchVariants({ checked, size, tinted: Boolean(color) })}
            onClick={() => setValue(option.value)}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                setValue(option.value);
                return;
              }
              move(index, event);
            }}
          >
            {renderSwatch(option, { checked })}
          </button>
        );
      })}
    </div>
  );
}
