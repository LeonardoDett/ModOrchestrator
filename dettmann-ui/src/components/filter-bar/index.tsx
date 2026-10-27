import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { FilterIcon } from "../../icons/glyphs/filter";
import { SearchIcon } from "../../icons/glyphs/search";
import { cn } from "../../utils/cn";
import { Input } from "../input";
import { Badge } from "../badge";
import { Button } from "../button";

export interface FilterBarProps extends ComponentPropsWithoutRef<"div"> {
  query?: string;
  onQueryChange?: (value: string) => void;
  queryPlaceholder?: string;
  activeFilterCount?: number;
  onFiltersClick?: () => void;
  /** Label of the filters button (localize it). */
  filtersLabel?: string;
  filters?: ReactNode;
  actions?: ReactNode;
}

/**
 * FilterBar is the search-and-filter strip above a list or table: a structural
 * (`medium`) region with a query field, an optional filters button and slots.
 *
 * @example
 * ```tsx
 * <FilterBar query={query} onQueryChange={setQuery} queryPlaceholder="Search mods" actions={<Button>Add</Button>} />
 * ```
 */
export function FilterBar({
  query,
  onQueryChange,
  queryPlaceholder = "Search",
  activeFilterCount = 0,
  onFiltersClick,
  filtersLabel = "Filters",
  filters,
  actions,
  className,
  ...props
}: FilterBarProps) {
  return (
    <div
      data-layer="medium"
      data-budget-region="filter-bar"
      className={cn("flex flex-wrap items-center gap-2 border-b border-border bg-structure p-2", className)}
      {...props}
    >
      <div className="min-w-[16rem] flex-1">
        <Input.Root value={query ?? ""} onChange={(value: string) => onQueryChange?.(value)}>
          <Input.Box padding="sm">
            <SearchIcon size="sm" className="mr-2 text-fg-muted" />
            <Input.Field aria-label={queryPlaceholder} placeholder={queryPlaceholder} />
          </Input.Box>
        </Input.Root>
      </div>
      {onFiltersClick ? (
        <Button startIcon={<FilterIcon size="sm" />} onClick={onFiltersClick}>
          {filtersLabel}
          {activeFilterCount ? (
            <Badge size="sm" intent="brand">
              {activeFilterCount}
            </Badge>
          ) : null}
        </Button>
      ) : null}
      {filters}
      {actions}
    </div>
  );
}
