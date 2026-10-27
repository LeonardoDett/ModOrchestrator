"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
} from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  size,
  useDismiss,
  useInteractions,
  FloatingPortal,
} from "@floating-ui/react";
import { CheckIcon } from "../../icons/glyphs/check";
import { ChevronDownIcon } from "../../icons/glyphs/chevron-down";
import { OverlayScope } from "../../primitives/portal";
import { Presence } from "../../motion/presence";
import type { MotionValues } from "../../motion/read-motion";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { rowRecipe } from "../../core/styles/row";
import { inputValueAsArray, inputValueAsString, useInputContext } from "./input.context";
import { SelectTags } from "./input.select.tags";
import type { InputRootOwnedNativeProps } from "./input.owned-props";
import {
  firstEnabled,
  flattenOptions,
  isSelectGroup,
  lastEnabled,
  matchTypeahead,
  stepEnabled,
  type SelectItem,
  type SelectOption,
} from "./select.items";

export type { SelectGroup, SelectItem, SelectOption } from "./select.items";

const TYPEAHEAD_RESET_MS = 500;

const selectTriggerVariants = defineRecipe({
  base: [
    "flex w-full flex-1 min-w-0 items-center gap-2",
    "bg-transparent text-left text-fg text-sm",
    "focus-bare cursor-pointer",
    "disabled:cursor-not-allowed disabled:text-fg-subtle",
  ].join(" "),
});

const selectPanelVariants = defineRecipe({
  base: [
    // Respiro vertical entre as opções: fundos de seleção vizinhos não encostam.
    "z-popover flex flex-col gap-0.5 overflow-y-auto overscroll-contain p-1",
    "rounded-card bg-raised border border-border shadow-overlay",
    "focus-bare",
  ].join(" "),
});

/** Expansão vertical a partir do campo (MD3), escalada pela amplitude do nível de movimento. */
const menuEnter = (m: MotionValues): Keyframe[] => [
  { opacity: 0, transform: `scaleY(${Math.max(0.8, 1 - 0.08 * m.amp)})` },
  { opacity: 1, transform: "scaleY(1)" },
];
const menuExit = (m: MotionValues): Keyframe[] => [...menuEnter(m)].reverse();

interface InputSelectProps
  extends Omit<
    ComponentPropsWithoutRef<"button">,
    InputRootOwnedNativeProps | "children" | "type" | "onSelect"
  > {
  /** Options and/or groups of options. `icon` and `description` are optional per option. */
  options: SelectItem[];
  /** Text shown when no option is selected */
  placeholder?: string;
  /** Max height of the menu in px (default 320) */
  maxHeight?: number;
  /**
   * Multiple selection: `Input.Root` holds a `string[]` (in option order), choosing an
   * option toggles it and keeps the menu open, and the trigger shows the selection as tags.
   */
  multiple?: boolean;
  /** Only with `multiple`: replaces the tags with a summary (e.g. "3 selected"). */
  selectedText?: (count: number) => string;
  /** Only with `multiple`: once reached, unchecked options are disabled. */
  maxSelected?: number;
  /** Only with `multiple`: accessible name of the "+N" counter of tags that do not fit. */
  moreLabel?: (hidden: number) => string;
}

const defaultMoreLabel = (hidden: number) => `${hidden} more`;

/**
 * Input.Select is a custom select with Material Design 3 behaviour, inside the Input family.
 * `value`/`onChange` live on `Input.Root` only — this miolo reads them from context and
 * forwards a plain string. A hidden input keeps native form submission (`name`).
 *
 * Keyboard: closed — Space/Enter/↑/↓ open, typing selects by typeahead (like a native
 * select); open — ↑/↓/Home/End move, typing jumps, Enter/Space commit, Esc/Tab close
 * without changing the value. Disabled options are skipped.
 *
 * @example
 * ```tsx
 * <Input.Root name="category" value={category} onChange={setCategory}>
 *   <Input.Label floating>Categoria</Input.Label>
 *   <Input.Box>
 *     <Input.Select
 *       placeholder="Escolha…"
 *       options={[
 *         { value: "tex", label: "Texturas", description: "Retexturas e upscales" },
 *         { label: "Gameplay", options: [{ value: "combat", label: "Combate" }] },
 *       ]}
 *     />
 *   </Input.Box>
 * </Input.Root>
 * ```
 */
export function InputSelect({
  options: items,
  placeholder,
  maxHeight = 320,
  multiple = false,
  selectedText,
  maxSelected,
  moreLabel = defaultMoreLabel,
  className,
  onFocus,
  onBlur,
  onKeyDown,
  onClick,
  ...props
}: InputSelectProps) {
  const { id, name, disabled, value, onChange, setIsFocused, hasFloatingLabel, hasValue, isFocused } =
    useInputContext("Select");
  const stringValue = inputValueAsString(value);
  const listId = useId();

  const options = useMemo(() => flattenOptions(items), [items]);
  // Múltiplo: valor = string[]; um valor string vindo do Root conta como vazio.
  const values = multiple ? inputValueAsArray(value) : [];
  const isChecked = (option: SelectOption) => values.includes(option.value);
  const checkedOptions = multiple ? options.filter(isChecked) : [];
  const atLimit = multiple && maxSelected !== undefined && checkedOptions.length >= maxSelected;
  /** Desabilitada pela própria opção ou pelo limite (as marcadas continuam desmarcáveis). */
  const isDisabled = (option: SelectOption) => Boolean(option.disabled) || (atLimit && !isChecked(option));

  const selectedIndex = multiple
    ? options.findIndex((o) => isChecked(o) && !o.disabled)
    : options.findIndex((o) => o.value === stringValue);
  const selected = !multiple && selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<(HTMLElement | null)[]>([]);
  const typeahead = useRef({ query: "", timer: 0 as ReturnType<typeof setTimeout> | 0 });

  const { refs, floatingStyles, context, placement } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "bottom-start",
    // Posiciona por left/top: o `transform` fica livre para a animação de entrada (scaleY).
    transform: false,
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ rects, availableHeight, elements }) {
          elements.floating.style.minWidth = `${rects.reference.width}px`;
          elements.floating.style.maxHeight = `${Math.min(maxHeight, availableHeight)}px`;
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });
  const dismiss = useDismiss(context, { escapeKey: false });
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

  const optionId = (index: number) => `${listId}-opt-${index}`;
  /** Opções com o desabilitado efetivo (inclui o limite de `maxSelected`), para a navegação por teclado. */
  const navigable = multiple ? options.map((o) => (isDisabled(o) ? { ...o, disabled: true } : o)) : options;

  const open = (prefer: "first" | "last" = "first") => {
    if (disabled) return;
    const fallback = prefer === "last" ? lastEnabled(navigable) : firstEnabled(navigable);
    setActiveIndex(selectedIndex >= 0 && !navigable[selectedIndex]?.disabled ? selectedIndex : fallback);
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const commit = (index: number) => {
    const option = options[index];
    if (!option) return;
    if (multiple) {
      if (isDisabled(option)) return;
      // Ordem das opções; valores sem opção correspondente (órfãos) são preservados ao fim.
      const next = options.filter((o) => (o === option ? !isChecked(o) : isChecked(o))).map((o) => o.value);
      const known = new Set(options.map((o) => o.value));
      onChange([...next, ...values.filter((v) => !known.has(v))]);
      return;
    }
    if (option.disabled) return;
    if (option.value !== stringValue) onChange(option.value);
    close();
  };

  // Mantém a opção ativa visível (abertura e navegação).
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [isOpen, activeIndex]);

  useEffect(() => () => {
    if (typeahead.current.timer) clearTimeout(typeahead.current.timer);
  }, []);

  const runTypeahead = (char: string) => {
    const state = typeahead.current;
    if (state.timer) clearTimeout(state.timer);
    state.query += char;
    state.timer = setTimeout(() => {
      state.query = "";
      state.timer = 0;
    }, TYPEAHEAD_RESET_MS);
    const from = isOpen ? activeIndex : selectedIndex;
    const match = matchTypeahead(options, state.query, from);
    if (match < 0) return;
    if (isOpen) setActiveIndex(match);
    else if (!multiple && options[match]!.value !== stringValue) onChange(options[match]!.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || disabled) return;
    const typing = typeahead.current.query !== "";

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key !== " " || typing)) {
      e.preventDefault();
      runTypeahead(e.key);
      return;
    }

    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open("first");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        open("last");
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => stepEnabled(navigable, i, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => stepEnabled(navigable, i, -1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(firstEnabled(navigable));
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(lastEnabled(navigable));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        setIsOpen(false);
        break;
    }
  };

  const showPlaceholder = !selected && !(hasFloatingLabel && !hasValue && !isFocused && !isOpen);
  const fromTop = !placement.startsWith("top");

  let optionIndex = -1;
  const renderOption = (option: SelectOption) => {
    const index = ++optionIndex;
    const isSelected = multiple ? isChecked(option) : index === selectedIndex;
    const optionDisabled = multiple ? isDisabled(option) : Boolean(option.disabled);
    return (
      <div
        key={`${option.value}-${index}`}
        ref={(node) => {
          optionRefs.current[index] = node;
        }}
        id={optionId(index)}
        role="option"
        aria-selected={isSelected}
        aria-disabled={optionDisabled || undefined}
        className={cn(
          rowRecipe({
            selected: isSelected,
            active: index === activeIndex,
            disabled: optionDisabled,
            multiline: Boolean(option.description),
            indicator: multiple ? "none" : "start",
          }),
          "rounded-chip select-none",
        )}
        // O foco fica no gatilho (aria-activedescendant).
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={() => !optionDisabled && setActiveIndex(index)}
        onClick={() => commit(index)}
      >
        {multiple && (
          <span
            aria-hidden
            data-slot="check"
            data-state={isSelected ? "checked" : "unchecked"}
            data-intent="brand"
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded-chip border motion-transition",
              option.description && "mt-0.5",
              optionDisabled
                ? "border-border bg-sunken text-fg-subtle"
                : isSelected
                  ? "border-intent-fill bg-intent-fill text-on-intent"
                  : "border-border-strong bg-surface",
            )}
          >
            {isSelected && <CheckIcon size="xs" strokeWidth={3} trigger="none" />}
          </span>
        )}
        {option.icon && (
          <span aria-hidden className="mt-0.5 flex shrink-0 text-fg-muted [&>svg]:size-4">
            {option.icon}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">{option.label}</span>
          {option.description && (
            <span className="text-caption text-fg-muted">{option.description}</span>
          )}
        </span>
        {isSelected && !multiple && <CheckIcon size="sm" className="mt-0.5 text-emphasis-text" />}
      </div>
    );
  };

  return (
    <>
      {multiple ? (
        values.map((v) => <input key={v} type="hidden" name={name} value={v} disabled={disabled} />)
      ) : (
        <input type="hidden" name={name} value={stringValue} disabled={disabled} />
      )}
      <button
        {...props}
        {...getReferenceProps()}
        ref={(node) => {
          triggerRef.current = node;
          refs.setReference(node);
        }}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        disabled={disabled}
        data-layer="low"
        className={cn(selectTriggerVariants(), className)}
        onClick={(e) => {
          onClick?.(e);
          if (e.defaultPrevented) return;
          if (isOpen) setIsOpen(false);
          else open("first");
        }}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          setIsOpen(false);
          onBlur?.(e);
        }}
      >
        {selected?.icon && (
          <span aria-hidden className="flex shrink-0 text-fg-muted [&>svg]:size-4">
            {selected.icon}
          </span>
        )}
        {multiple && checkedOptions.length > 0 ? (
          selectedText ? (
            <span className="min-w-0 flex-1 truncate">{selectedText(checkedOptions.length)}</span>
          ) : (
            <SelectTags selected={checkedOptions} disabled={disabled} moreLabel={moreLabel} />
          )
        ) : (
          <span className={cn("min-w-0 flex-1 truncate", !selected && "text-fg-subtle")}>
            {selected ? selected.label : showPlaceholder ? placeholder : " "}
          </span>
        )}
        <ChevronDownIcon
          size="sm"
          className={cn(
            "text-fg-muted",
            "transition-transform duration-(--motion-duration) ease-(--motion-ease)",
            isOpen && "rotate-180",
          )}
        />
      </button>

      <FloatingPortal>
        <OverlayScope>
          <Presence show={isOpen} enter={menuEnter} exit={menuExit}>
            <div
              {...getFloatingProps()}
              ref={refs.setFloating}
              id={listId}
              role="listbox"
              aria-multiselectable={multiple || undefined}
              aria-labelledby={id}
              data-motion="responsive"
              style={{ ...floatingStyles, transformOrigin: fromTop ? "top" : "bottom" }}
              className={selectPanelVariants()}
              // O foco fica no gatilho: nenhum clique no painel (opção desabilitada, rótulo de grupo, respiro) o tira de lá.
              onMouseDown={(e) => e.preventDefault()}
            >
              {items.map((item, g) =>
                isSelectGroup(item) ? (
                  <div key={`group-${g}`} role="group" aria-labelledby={`${listId}-group-${g}`} className="flex flex-col gap-0.5">
                    <div
                      id={`${listId}-group-${g}`}
                      className="px-3 pb-1 pt-2 text-caption font-medium text-fg-muted"
                    >
                      {item.label}
                    </div>
                    {item.options.map(renderOption)}
                  </div>
                ) : (
                  renderOption(item)
                ),
              )}
            </div>
          </Presence>
        </OverlayScope>
      </FloatingPortal>
    </>
  );
}
