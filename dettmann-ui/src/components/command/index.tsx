"use client";

import { useEffect, useId, useMemo, useState, type ComponentPropsWithoutRef, type KeyboardEvent, type ReactNode } from "react";
import { SearchIcon } from "../../icons/glyphs/search";
import { cn } from "../../utils/cn";
import { rowRecipe } from "../../core/styles/row";
import { Input } from "../input";
import { Loader } from "../loader";

export interface CommandItem<T = unknown> {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  value: T;
  disabled?: boolean;
  icon?: ReactNode;
}

export interface CommandProps<T = unknown> extends Omit<ComponentPropsWithoutRef<"div">, "onChange"> {
  items: readonly CommandItem<T>[];
  value?: string;
  onValueChange?: (item: CommandItem<T>) => void;
  placeholder?: string;
  emptyMessage?: ReactNode;
  /** Items are still being fetched: the list gives way to a loader. */
  loading?: boolean;
  /** Accessible name of the loader (localize it). */
  loadingLabel?: string;
}

/** Next enabled index from `from` in `step` direction, wrapping; -1 when every item is disabled. */
function stepEnabled(items: readonly { disabled?: boolean }[], from: number, step: 1 | -1): number {
  for (let offset = 1; offset <= items.length; offset += 1) {
    const index = (from + step * offset + items.length * offset) % items.length;
    if (!items[index]?.disabled) return index;
  }
  return -1;
}

/**
 * Command is a filterable list of actions (command palette body). The focus stays on
 * the field; arrows, Home and End move the active option and Enter chooses it.
 *
 * @example
 * ```tsx
 * <Command items={items} placeholder="Type a command" onValueChange={(item) => run(item.value)} />
 * ```
 */
export function Command<T>({
  items,
  onValueChange,
  placeholder = "Search",
  emptyMessage = "No results",
  loading = false,
  loadingLabel = "Loading",
  className,
  ...props
}: CommandProps<T>) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...items];
    return items.filter((i) => [i.label, i.description, ...(i.keywords ?? [])].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [items, query]);

  const firstEnabled = filtered.findIndex((item) => !item.disabled);
  const [active, setActive] = useState(firstEnabled);
  useEffect(() => setActive(firstEnabled), [query, firstEnabled]);

  const current = !loading && active >= 0 && active < filtered.length && !filtered[active]?.disabled ? active : -1;
  const optionId = (index: number) => `${listId}-opt-${index}`;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (loading || firstEnabled < 0) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive(stepEnabled(filtered, current, 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive(stepEnabled(filtered, current < 0 ? 0 : current, -1));
        break;
      case "Home":
        event.preventDefault();
        setActive(firstEnabled);
        break;
      case "End":
        event.preventDefault();
        setActive(stepEnabled(filtered, 0, -1));
        break;
      case "Enter": {
        event.preventDefault();
        const item = filtered[current];
        if (item) onValueChange?.(item);
        break;
      }
    }
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      className={cn("flex min-h-0 flex-col rounded-card border border-border bg-surface shadow-overlay", className)}
      {...props}
    >
      <div className="border-b border-border p-2">
        <Input.Root value={query} onChange={(value: string) => setQuery(value)}>
          <Input.Box>
            <SearchIcon size="sm" className="mr-2 text-fg-muted" />
            <Input.Field
              aria-label={placeholder}
              aria-controls={listId}
              aria-activedescendant={current >= 0 ? optionId(current) : undefined}
              placeholder={placeholder}
            />
          </Input.Box>
        </Input.Root>
      </div>
      <div id={listId} role="listbox" aria-busy={loading || undefined} className="flex max-h-80 flex-col gap-0.5 overflow-auto p-1">
        {loading ? (
          <div className="flex justify-center p-6">
            <Loader label={loadingLabel} />
          </div>
        ) : filtered.length ? (
          filtered.map((item, index) => (
            <div
              key={item.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === current}
              aria-disabled={item.disabled || undefined}
              // O foco fica no campo (aria-activedescendant).
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => !item.disabled && setActive(index)}
              onClick={() => !item.disabled && onValueChange?.(item)}
              className={cn(
                rowRecipe({ active: index === current, disabled: item.disabled, multiline: Boolean(item.description) }),
                "shrink-0 rounded-chip",
              )}
            >
              {item.icon ? (
                <span aria-hidden className="flex shrink-0 text-fg-muted">
                  {item.icon}
                </span>
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.label}</span>
                {item.description ? <span className="block truncate text-caption text-fg-muted">{item.description}</span> : null}
              </span>
            </div>
          ))
        ) : (
          <div role="status" className="p-6 text-center text-sm text-fg-muted">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
