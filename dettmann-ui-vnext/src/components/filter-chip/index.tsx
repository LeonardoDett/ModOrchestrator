"use client";

import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useControllableState } from "../../hooks/use-controllable-state";
import { getNextRovingIndex, isRovingKey } from "../../hooks/use-roving-tabindex";
import type { CategoryColor } from "../../theme/engine";

const chipVariants = defineRecipe({
  slots: {
    chip: [
      "inline-flex h-control-sm shrink-0 items-center gap-1.5 rounded-pill border px-2.5 text-xs font-medium",
      "motion-transition motion-press focus-ring",
      "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-fg-subtle disabled:border-transparent",
    ].join(" "),
    dot: "size-2 shrink-0 rounded-pill bg-intent-fill",
    count: "tabular-nums",
  },
  variants: {
    /** Pressionado: tinta da marca e borda; solto: superfície com borda neutra. Nunca só cor: a borda muda junto. */
    pressed: {
      true: { chip: "border-intent-border bg-intent-subtle text-intent-text hover:state-layer-hover", count: "text-intent-text" },
      false: { chip: "border-border bg-surface text-fg-muted hover:state-layer-hover", count: "text-fg-subtle" },
      /** D-040: pressed without the brand tint (a view filter in a panel header). */
      neutral: { chip: "border-border-strong bg-raised text-fg hover:state-layer-hover", count: "text-fg-muted" },
    },
    empty: {
      true: { chip: "text-fg-subtle" },
      false: {},
    },
  },
  defaultVariants: { pressed: false, empty: false },
});

interface GroupContextValue {
  type: "single" | "multiple";
  value: string[];
  toggle: (value: string) => void;
}

const GroupContext = createContext<GroupContextValue | null>(null);

export interface FilterChipProps extends Omit<ComponentPropsWithoutRef<"button">, "type" | "value" | "color"> {
  children: ReactNode;
  /** Controlado. Dentro de `FilterChip.Group`, o grupo decide. */
  pressed?: boolean;
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  /** Valor no grupo. */
  value?: string;
  /** Contagem de itens que o filtro deixa ver. Zero fica esmaecido, ainda focável. */
  count?: number;
  /** Ponto colorido da paleta categórica antes do texto. */
  color?: CategoryColor;
  /** D-040: `neutral` marca o pressionado sem a tinta da marca (filtro de visão num painel). */
  tone?: "brand" | "neutral";
}

/**
 * FilterChip is a toggle chip for filters: pressed state, optional count and color dot.
 * Unlike `SegmentedControl` it allows several choices and wraps; group several with
 * `FilterChip.Group` (arrow keys move focus).
 *
 * @example
 * ```tsx
 * <FilterChip.Group type="multiple" aria-label="Área" value={areas} onValueChange={setAreas}>
 *   <FilterChip value="deploy" count={3}>Implantação</FilterChip>
 *   <FilterChip value="plugins" count={0}>Plugins</FilterChip>
 * </FilterChip.Group>
 * <FilterChip color="violet" pressed={on} onPressedChange={setOn}>Gráficos</FilterChip>
 * ```
 */
const FilterChipRoot = forwardRef<HTMLButtonElement, FilterChipProps>(function FilterChip(
  { children, pressed: pressedProp, defaultPressed = false, onPressedChange, value, count, color, tone = "brand", className, onClick, ...props },
  ref,
) {
  const group = useContext(GroupContext);
  const [own, setOwn] = useControllableState({ value: pressedProp, defaultValue: defaultPressed, onChange: onPressedChange });
  const pressed = group && value !== undefined ? group.value.includes(value) : own;
  const s = chipVariants({ pressed: pressed && tone === "neutral" ? "neutral" : pressed, empty: count === 0 });
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={pressed}
      data-state={pressed ? "on" : "off"}
      data-filter-chip=""
      data-intent={pressed && tone === "brand" ? "brand" : undefined}
      className={cn(s.chip(), className)}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (group && value !== undefined) group.toggle(value);
        else setOwn(!pressed);
      }}
      {...props}
    >
      {color ? <span aria-hidden="true" data-category={color} className={s.dot()} /> : null}
      <span>{children}</span>
      {count !== undefined ? <span className={s.count()}>{count}</span> : null}
    </button>
  );
});

export interface FilterChipGroupProps extends Omit<ComponentPropsWithoutRef<"div">, "defaultValue" | "onChange"> {
  /** `single`: um ou nenhum; `multiple`: vários. */
  type?: "single" | "multiple";
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  /** Nome do grupo para leitores de tela. */
  "aria-label": string;
}

function FilterChipGroup({
  type = "multiple",
  value: valueProp,
  defaultValue = [],
  onValueChange,
  className,
  onKeyDown,
  children,
  ...props
}: FilterChipGroupProps) {
  const [value, setValue] = useControllableState({ value: valueProp, defaultValue, onChange: onValueChange });
  const toggle = (v: string) => {
    if (type === "single") setValue(value.includes(v) ? [] : [v]);
    else setValue(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (!isRovingKey(event.key, "horizontal")) return;
    const chips = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-filter-chip]:not(:disabled)")];
    const current = chips.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    const next = getNextRovingIndex(current, chips.length, event.key, { orientation: "horizontal", loop: true });
    if (next === null) return;
    event.preventDefault();
    chips[next]?.focus();
  };
  return (
    <GroupContext.Provider value={{ type, value, toggle }}>
      <div role="group" className={cn("flex flex-wrap items-center gap-1.5", className)} onKeyDown={handleKeyDown} {...props}>
        {children}
      </div>
    </GroupContext.Provider>
  );
}

export const FilterChip = Object.assign(FilterChipRoot, { Group: FilterChipGroup });
