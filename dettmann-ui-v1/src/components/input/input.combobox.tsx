"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
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
import { inputValueAsString, useInputContext } from "./input.context";
import { VirtualList } from "../../primitives/virtual-list";
import type { InputRootOwnedNativeProps } from "./input.owned-props";

const comboboxInputVariants = defineRecipe({
  base: [
    "w-full flex-1",
    "bg-transparent",
    "text-fg text-sm",
    "placeholder:text-fg-subtle",
    "outline-none",
    "disabled:cursor-not-allowed",
  ].join(" "),
});

const comboboxPanelVariants = defineRecipe({
  base: [
    "z-50 w-full rounded-xl",
    "bg-raised border border-border shadow-xl",
    "outline-none",
    "overflow-hidden",
  ].join(" "),
});

const comboboxOptionVariants = defineRecipe({
  base: [
    "flex items-center px-3 py-2 text-sm",
    "cursor-pointer",
    "transition-colors duration-fast",
  ].join(" "),
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
  defaultVariants: {
    active: false,
    selected: false,
    disabled: false,
  },
});

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface InputComboboxProps
  extends Omit<ComponentPropsWithoutRef<"input">, InputRootOwnedNativeProps> {
  /** Array of options */
  options: ComboboxOption[];
  /** Placeholder text */
  placeholder?: string;
  /** Enable search/filter */
  searchable?: boolean;
  /** Custom filter function */
  filterFn?: (option: ComboboxOption, query: string) => boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Threshold for virtual list (default 50) */
  virtualThreshold?: number;
  /** Item height for virtual list */
  itemHeight?: number;
  /** Max height of dropdown panel */
  maxHeight?: number;
}

const defaultFilter = (option: ComboboxOption, query: string) =>
  option.label.toLowerCase().includes(query.toLowerCase());

/**
 * Input.Combobox is a searchable dropdown that works within Input.Root.
 * `value`/`onChange` live on `Input.Root` only — this miolo reads them from context
 * and forwards a plain string (never the DOM event).
 *
 * @example
 * ```tsx
 * <Input.Root name="country" fullWidth value={country} onChange={setCountry}>
 *   <Input.Label floating>Country</Input.Label>
 *   <Input.Box>
 *     <Input.Combobox
 *       options={countries}
 *       placeholder="Select country..."
 *       searchable
 *     />
 *   </Input.Box>
 *   <Input.Error />
 * </Input.Root>
 * ```
 */
export function InputCombobox({
  options,
  placeholder,
  searchable = true,
  filterFn = defaultFilter,
  emptyMessage = "No options found",
  virtualThreshold = 50,
  itemHeight = 36,
  maxHeight = 240,
  className,
  onFocus,
  onBlur,
  ...props
}: InputComboboxProps) {
  const {
    id,
    name,
    disabled,
    value,
    onChange,
    setIsFocused,
    hasFloatingLabel,
    hasValue,
    isFocused,
  } = useInputContext("Combobox");
  const stringValue = inputValueAsString(value);

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

  const filteredOptions = searchable && searchQuery
    ? options.filter((opt) => filterFn(opt, searchQuery))
    : options;

  const selectedOption = options.find((opt) => opt.value === stringValue);

  const handleSelect = useCallback(
    (option: ComboboxOption) => {
      if (option.disabled) return;
      onChange(option.value);
      setSearchQuery("");
      setIsOpen(false);
      inputRef.current?.focus();
    },
    [onChange]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (!isOpen) setIsOpen(true);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && activeIndex !== null) {
      e.preventDefault();
      const option = filteredOptions[activeIndex];
      if (option && !option.disabled) {
        handleSelect(option);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    } else if (e.key === "ArrowDown" && !isOpen) {
      setIsOpen(true);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!isOpen) {
      setIsFocused(false);
    }
    setSearchQuery("");
    onBlur?.(e);
  };

  // Keep label raised while dropdown is open or has search text
  useEffect(() => {
    if (isOpen || searchQuery) {
      setIsFocused(true);
    }
  }, [isOpen, searchQuery, setIsFocused]);

  // When dropdown closes, update focus state based on actual input focus
  useEffect(() => {
    if (!isOpen && document.activeElement !== inputRef.current) {
      setIsFocused(false);
    }
  }, [isOpen, setIsFocused]);

  const displayValue = searchQuery || (isOpen ? "" : selectedOption?.label ?? "");
  const showPlaceholder = !hasFloatingLabel || hasValue || isFocused || isOpen || !!searchQuery;

  const useVirtual = filteredOptions.length > virtualThreshold;

  const renderOption = (option: ComboboxOption, index: number) => {
    const isActive = activeIndex === index;
        const isSelected = option.value === stringValue;

    return (
      <div
        ref={(node) => {
          listRef.current[index] = node;
        }}
        role="option"
        aria-selected={isSelected}
        aria-disabled={option.disabled}
        className={comboboxOptionVariants({
          active: isActive,
          selected: isSelected,
          disabled: option.disabled,
        })}
        onClick={() => handleSelect(option)}
        onMouseEnter={() => setActiveIndex(index)}
      >
        {option.label}
      </div>
    );
  };

  return (
    <>
      <input
        {...props}
        {...getReferenceProps()}
        ref={(node) => {
          refs.setReference(node);
          (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
        }}
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-autocomplete={searchable ? "list" : "none"}
        disabled={disabled}
        value={displayValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={showPlaceholder ? placeholder : undefined}
        className={cn(comboboxInputVariants(), className)}
        autoComplete="off"
      />

      {/* Dropdown arrow */}
      <svg
        className={cn(
          "h-4 w-4 shrink-0 text-fg-muted transition-transform duration-fast pointer-events-none",
          isOpen && "rotate-180"
        )}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>

      {isOpen && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
            <div
              ref={refs.setFloating}
              style={{
                ...floatingStyles,
                width: refs.reference.current?.getBoundingClientRect().width,
              }}
              className={comboboxPanelVariants()}
              {...getFloatingProps()}
            >
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-fg-muted">
                  {emptyMessage}
                </div>
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
                    <div key={option.value}>
                      {renderOption(option, index)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}
