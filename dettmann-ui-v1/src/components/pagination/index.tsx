"use client";

import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Icon } from "../../primitives/icon";
import { createStrictContext } from "../../utils/create-strict-context";

interface PaginationContextValue {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const [PaginationProvider, usePaginationContext] =
  createStrictContext<PaginationContextValue>("Pagination");

const rootVariants = defineRecipe({
  base: "flex items-center gap-1 text-sm",
});

const itemVariants = defineRecipe({
  base: [
    "inline-flex items-center justify-center",
    "h-9 min-w-9 px-3 rounded-lg",
    "text-sm font-medium transition-colors duration-fast",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-page",
    "disabled:pointer-events-none disabled:bg-muted disabled:text-fg-subtle",
  ].join(" "),
  variants: {
    current: {
      true: "text-secondary-text",
      false: "text-fg-muted hover:text-fg hover:bg-hover",
    },
  },
  defaultVariants: {
    current: false,
  },
});

interface PaginationRootProps extends ComponentPropsWithoutRef<"nav"> {
  children: ReactNode;
  /** Current page (1-indexed) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Called with the next page index */
  onPageChange: (page: number) => void;
}

/**
 * Pagination.Root provides page state to items and prev/next controls.
 */
function PaginationRoot({
  children,
  currentPage,
  totalPages,
  onPageChange,
  className,
  ...props
}: PaginationRootProps) {
  return (
    <PaginationProvider value={{ currentPage, totalPages, onPageChange }}>
      <nav
        role="navigation"
        aria-label="Pagination"
        className={cn(rootVariants(), className)}
        {...props}
      >
        {children}
      </nav>
    </PaginationProvider>
  );
}

interface PaginationItemProps
  extends Omit<ComponentPropsWithoutRef<"button">, "type" | "onClick"> {
  /** 1-indexed page this item represents */
  page: number;
}

/**
 * Pagination.Item is a page number button.
 */
function PaginationItem({ page, className, ...props }: PaginationItemProps) {
  const { currentPage, onPageChange } = usePaginationContext("Item");
  const current = currentPage === page;

  return (
    <button
      type="button"
      onClick={() => onPageChange(page)}
      className={cn(itemVariants({ current }), className)}
      aria-label={`Go to page ${page}`}
      aria-current={current ? "page" : undefined}
      {...props}
    >
      {page}
    </button>
  );
}

function PaginationEllipsis({
  className,
  ...props
}: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={cn(
        "inline-flex h-9 min-w-9 items-center justify-center text-sm text-fg-muted",
        className
      )}
      {...props}
    >
      ...
    </span>
  );
}

function PaginationPrevious({
  className,
  ...props
}: Omit<ComponentPropsWithoutRef<"button">, "type" | "onClick">) {
  const { currentPage, onPageChange } = usePaginationContext("Previous");
  const disabled = currentPage <= 1;

  return (
    <button
      type="button"
      onClick={() => onPageChange(currentPage - 1)}
      disabled={disabled}
      className={cn(itemVariants({ current: false }), className)}
      aria-label="Go to previous page"
      {...props}
    >
      <Icon icon={ChevronLeft} size="sm" />
    </button>
  );
}

function PaginationNext({
  className,
  ...props
}: Omit<ComponentPropsWithoutRef<"button">, "type" | "onClick">) {
  const { currentPage, totalPages, onPageChange } = usePaginationContext("Next");
  const disabled = currentPage >= totalPages;

  return (
    <button
      type="button"
      onClick={() => onPageChange(currentPage + 1)}
      disabled={disabled}
      className={cn(itemVariants({ current: false }), className)}
      aria-label="Go to next page"
      {...props}
    >
      <Icon icon={ChevronRight} size="sm" />
    </button>
  );
}

function PaginationFirst({
  className,
  ...props
}: Omit<ComponentPropsWithoutRef<"button">, "type" | "onClick">) {
  const { currentPage, onPageChange } = usePaginationContext("First");
  const disabled = currentPage <= 1;

  return (
    <button
      type="button"
      onClick={() => onPageChange(1)}
      disabled={disabled}
      className={cn(itemVariants({ current: false }), className)}
      aria-label="Go to first page"
      {...props}
    >
      <Icon icon={ChevronFirst} size="sm" />
    </button>
  );
}

function PaginationLast({
  className,
  ...props
}: Omit<ComponentPropsWithoutRef<"button">, "type" | "onClick">) {
  const { currentPage, totalPages, onPageChange } = usePaginationContext("Last");
  const disabled = currentPage >= totalPages;

  return (
    <button
      type="button"
      onClick={() => onPageChange(totalPages)}
      disabled={disabled}
      className={cn(itemVariants({ current: false }), className)}
      aria-label="Go to last page"
      {...props}
    >
      <Icon icon={ChevronLast} size="sm" />
    </button>
  );
}

type PaginationButtonVariants = VariantProps<typeof itemVariants>;

interface PaginationProps extends ComponentPropsWithoutRef<"nav"> {
  /** Current page (1-indexed) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Callback when page changes */
  onPageChange: (page: number) => void;
  /** Number of page buttons to show around current page */
  siblingCount?: number;
  /** Show first/last buttons */
  showFirstLast?: boolean;
  /** Show previous/next buttons */
  showPrevNext?: boolean;
}

function generatePageNumbers(
  currentPage: number,
  totalPages: number,
  siblingCount: number
): (number | "ellipsis")[] {
  const totalNumbers = siblingCount * 2 + 3;
  const totalBlocks = totalNumbers + 2;

  if (totalPages <= totalBlocks) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
  const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

  const shouldShowLeftEllipsis = leftSiblingIndex > 2;
  const shouldShowRightEllipsis = rightSiblingIndex < totalPages - 1;

  if (!shouldShowLeftEllipsis && shouldShowRightEllipsis) {
    const leftItemCount = 3 + 2 * siblingCount;
    const leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
    return [...leftRange, "ellipsis", totalPages];
  }

  if (shouldShowLeftEllipsis && !shouldShowRightEllipsis) {
    const rightItemCount = 3 + 2 * siblingCount;
    const rightRange = Array.from(
      { length: rightItemCount },
      (_, i) => totalPages - rightItemCount + i + 1
    );
    return [1, "ellipsis", ...rightRange];
  }

  if (shouldShowLeftEllipsis && shouldShowRightEllipsis) {
    const middleRange = Array.from(
      { length: rightSiblingIndex - leftSiblingIndex + 1 },
      (_, i) => leftSiblingIndex + i
    );
    return [1, "ellipsis", ...middleRange, "ellipsis", totalPages];
  }

  return [];
}

/**
 * Pagination navigates a page range.
 * Use the shorthand props API, or compose Root + Item + Previous/Next.
 *
 * @example
 * ```tsx
 * <Pagination currentPage={1} totalPages={10} onPageChange={setPage} />
 *
 * <Pagination.Root currentPage={page} totalPages={10} onPageChange={setPage}>
 *   <Pagination.Previous />
 *   <Pagination.Item page={1} />
 *   <Pagination.Next />
 * </Pagination.Root>
 * ```
 */
function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1,
  showFirstLast = true,
  showPrevNext = true,
  className,
  ...props
}: PaginationProps) {
  const pageNumbers = generatePageNumbers(currentPage, totalPages, siblingCount);

  return (
    <PaginationRoot
      currentPage={currentPage}
      totalPages={totalPages}
      onPageChange={onPageChange}
      className={className}
      {...props}
    >
      {showFirstLast ? <PaginationFirst /> : null}
      {showPrevNext ? <PaginationPrevious /> : null}
      {pageNumbers.map((pageNumber, index) =>
        pageNumber === "ellipsis" ? (
          <PaginationEllipsis key={`ellipsis-${index}`} />
        ) : (
          <PaginationItem key={pageNumber} page={pageNumber} />
        )
      )}
      {showPrevNext ? <PaginationNext /> : null}
      {showFirstLast ? <PaginationLast /> : null}
    </PaginationRoot>
  );
}

const PaginationCompound = Object.assign(Pagination, {
  Root: PaginationRoot,
  Item: PaginationItem,
  Ellipsis: PaginationEllipsis,
  Previous: PaginationPrevious,
  Next: PaginationNext,
  First: PaginationFirst,
  Last: PaginationLast,
});

export { PaginationCompound as Pagination };
export type { PaginationProps, PaginationButtonVariants };
