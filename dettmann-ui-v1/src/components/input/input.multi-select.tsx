"use client";

import {
  useState,
  useRef,
  useCallback,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
} from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useRole,
  useInteractions,
  useListNavigation,
  FloatingPortal,
  FloatingFocusManager,
} from "@floating-ui/react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { inputValueAsArray, useInputContext } from "./input.context";
import { VirtualList } from "../../primitives/virtual-list";
import { Tag } from "../tag";
import type { ComboboxOption } from "./input.combobox";
import type { InputRootOwnedNativeProps } from "./input.owned-props";

const searchVariants = defineRecipe({
  base: [
    "min-w-20 flex-1 bg-transparent text-fg text-sm",
    "placeholder:text-fg-subtle outline-none",
    "disabled:cursor-not-allowed",
  ].join(" "),
});

const panelVariants = defineRecipe({
  base: [
    "z-50 w-full rounded-xl",
    "bg-raised border border-border shadow-xl",
    "outline-none overflow-hidden",
  ].join(" "),
});

const optionVariants = defineRecipe({
  base: "flex items-center px-3 py-2 text-sm cursor-pointer transition-colors duration-fast",
  variants: {
    active: {
      true: "bg-secondary-subtle",
      false: "hover:bg-hover",
    },
    selected: {
      true: "text-secondary-text font-medium",
      false: "text-fg",
    },
    disabled: {
      true: "text-fg-muted cursor-not-allowed text-fg-subtle",
      false: "",
    },
  },
});

interface InputMultiSelectProps
  extends Omit<ComponentPropsWithoutRef<"input">, InputRootOwnedNativeProps> {
  options: ComboboxOption[];
  placeholder?: string;
  emptyMessage?: string;
  virtualThreshold?: number;
  itemHeight?: number;
  maxHeight?: number;
}

const defaultFilter = (option: ComboboxOption, query: string) =>
  option.label.toLowerCase().includes(query.toLowerCase());

/**
 * Input.MultiSelect is a searchable multi-value miolo. `value` on Root is `string[]`.
 *
 * @example
 * ```tsx
 * <Input.Root name="tags" value={tags} onChange={setTags}>
 *   <Input.Box>
 *     <Input.MultiSelect options={options} />
 *   </Input.Box>
 * </Input.Root>
 * ```
 */
export function InputMultiSelect({
  options,
  placeholder = "Select…",
  emptyMessage = "No options found",
  virtualThreshold = 50,
  itemHeight = 36,
  maxHeight = 240,
  className,
  onFocus,
  onBlur,
  ...props
}: InputMultiSelectProps) {
  const { id, name, disabled, value, onChange, setIsFocused } =
    useInputContext("MultiSelect");
  const selected = inputValueAsArray(value);

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listRef = useRef<(HTMLDivElement | null)[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "bottom-start",
    middleware: [offset(4), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context, { keyboardHandlers: false });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "listbox" });
  const listNavigation = useListNavigation(context, {
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
    virtual: true,
    loop: true,
  });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
    role,
    listNavigation,
  ]);

  const filteredOptions = searchQuery
    ? options.filter((opt) => defaultFilter(opt, searchQuery))
    : options;

  const toggle = useCallback(
    (option: ComboboxOption) => {
      if (option.disabled) return;
      const next = selected.includes(option.value)
        ? selected.filter((item) => item !== option.value)
        : [...selected, option.value];
      onChange(next);
      setSearchQuery("");
      inputRef.current?.focus();
    },
    [onChange, selected]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !searchQuery && selected.length > 0) {
      onChange(selected.slice(0, -1));
    } else if (e.key === "Enter" && activeIndex !== null) {
      e.preventDefault();
      const option = filteredOptions[activeIndex];
      if (option) toggle(option);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    } else if (e.key === "ArrowDown" && !isOpen) {
      setIsOpen(true);
    }
  };

  const useVirtual = filteredOptions.length > virtualThreshold;

  const renderOption = (option: ComboboxOption, index: number) => {
    const isActive = activeIndex === index;
    const isSelected = selected.includes(option.value);
    return (
      <div
        ref={(node) => {
          listRef.current[index] = node;
        }}
        role="option"
        aria-selected={isSelected}
        aria-disabled={option.disabled}
        className={optionVariants({
          active: isActive,
          selected: isSelected,
          disabled: option.disabled,
        })}
        onClick={() => toggle(option)}
        onMouseEnter={() => setActiveIndex(index)}
      >
        {option.label}
      </div>
    );
  };

  return (
    <div
      ref={refs.setReference}
      className="flex w-full flex-wrap items-center gap-1.5"
      {...getReferenceProps()}
    >
      {name ? (
        <input type="hidden" name={name} value={selected.join(",")} disabled={disabled} />
      ) : null}
      {selected.map((item) => {
        const option = options.find((opt) => opt.value === item);
        return (
          <Tag
            key={item}
            value={item}
            size="sm"
            onRemove={(removed) => onChange(selected.filter((v) => v !== removed))}
          >
            {option?.label ?? item}
          </Tag>
        );
      })}
      <input
        {...props}
        ref={inputRef}
        id={id}
        type="text"
        aria-multiselectable="true"
        disabled={disabled}
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value);
          if (!isOpen) setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          if (!isOpen) setIsFocused(false);
          onBlur?.(e);
        }}
        placeholder={selected.length === 0 ? placeholder : undefined}
        className={cn(searchVariants(), className)}
        autoComplete="off"
      />

      {isOpen && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
            <div
              ref={refs.setFloating}
              style={{
                ...floatingStyles,
                width: refs.reference.current
                  ? refs.reference.current.getBoundingClientRect().width
                  : undefined,
              }}
              className={panelVariants()}
              {...getFloatingProps()}
            >
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-fg-muted">{emptyMessage}</div>
              ) : useVirtual ? (
                <VirtualList
                  items={filteredOptions}
                  itemHeight={itemHeight}
                  maxHeight={maxHeight}
                  overscan={5}
                  getItemKey={(opt) => opt.value}
                  renderItem={renderOption}
                />
              ) : (
                <div style={{ maxHeight }} className="overflow-auto">
                  {filteredOptions.map((option, index) => (
                    <div key={option.value}>{renderOption(option, index)}</div>
                  ))}
                </div>
              )}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </div>
  );
}
