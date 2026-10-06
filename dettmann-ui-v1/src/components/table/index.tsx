"use client";

import {
  createContext,
  useContext,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { VirtualList } from "../../primitives/virtual-list";

const VIRTUALIZE_THRESHOLD = 50;

type TableLayout = "table" | "virtual";

const TableLayoutContext = createContext<TableLayout>("table");

function useTableLayout() {
  return useContext(TableLayoutContext);
}

const rootVariants = defineRecipe({
  base: "overflow-auto rounded-xl border border-border bg-surface",
});

function TableRoot({ className, children, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn(rootVariants(), className)} {...props}>
      <table className="w-full caption-bottom text-sm">{children}</table>
    </div>
  );
}

function TableHeader({ className, ...props }: ComponentPropsWithoutRef<"thead">) {
  return (
    <thead
      className={cn("sticky top-0 z-10 bg-secondary-subtle [&_tr]:border-b [&_tr]:border-border", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: ComponentPropsWithoutRef<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

const rowVariants = defineRecipe({
  base: "border-b border-border text-sm transition-colors",
  variants: {
    selected: {
      true: "bg-secondary-subtle",
      false: "hover:bg-hover",
    },
    layout: {
      table: "",
      virtual: "flex h-full w-full items-center",
    },
  },
  defaultVariants: {
    selected: false,
    layout: "table",
  },
});

interface TableRowProps extends ComponentPropsWithoutRef<"tr"> {
  selected?: boolean;
}

function TableRow({ className, selected = false, ...props }: TableRowProps) {
  const layout = useTableLayout();
  const classes = cn(rowVariants({ selected, layout }), className);

  if (layout === "virtual") {
    return <div role="row" className={classes} {...(props as ComponentPropsWithoutRef<"div">)} />;
  }

  return <tr className={classes} {...props} />;
}

function TableHead({ className, ...props }: ComponentPropsWithoutRef<"th">) {
  return (
    <th
      className={cn(
        "h-11 px-4 text-left align-middle font-medium text-fg-muted",
        className
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: ComponentPropsWithoutRef<"td">) {
  const layout = useTableLayout();
  const classes = cn("px-4 py-3 align-middle text-fg", layout === "virtual" && "flex-1", className);

  if (layout === "virtual") {
    return (
      <div role="cell" className={classes} {...(props as ComponentPropsWithoutRef<"div">)} />
    );
  }

  return <td className={classes} {...props} />;
}

interface TableVirtualBodyProps<T> {
  items: T[];
  itemHeight?: number;
  maxHeight?: number;
  getItemKey?: (item: T, index: number) => string | number;
  renderRow: (item: T, index: number) => ReactNode;
  className?: string;
}

/**
 * Table.VirtualBody renders rows through VirtualList when the collection is large.
 * Uses the same opt-in as List (`virtualized`) plus a default threshold of 50 rows.
 */
function TableVirtualBody<T>({
  items,
  itemHeight = 48,
  maxHeight = 320,
  getItemKey,
  renderRow,
  className,
}: TableVirtualBodyProps<T>) {
  const virtualized = items.length > VIRTUALIZE_THRESHOLD;

  return (
    <tbody>
      <tr>
        <td colSpan={100} className={cn("p-0", className)}>
          <TableLayoutContext.Provider value="virtual">
            {virtualized ? (
              <VirtualList
                items={items}
                itemHeight={itemHeight}
                maxHeight={maxHeight}
                getItemKey={getItemKey}
                renderItem={(item, index) => renderRow(item, index)}
                className="border-0"
              />
            ) : (
              <div>
                {items.map((item, index) => (
                  <div key={getItemKey ? getItemKey(item, index) : index}>
                    {renderRow(item, index)}
                  </div>
                ))}
              </div>
            )}
          </TableLayoutContext.Provider>
        </td>
      </tr>
    </tbody>
  );
}

/**
 * Table is a SaaS data table: sticky header, rows, optional selection styling.
 *
 * @example
 * ```tsx
 * <Table.Root>
 *   <Table.Header>
 *     <Table.Row>
 *       <Table.Head>Name</Table.Head>
 *     </Table.Row>
 *   </Table.Header>
 *   <Table.Body>
 *     <Table.Row selected>
 *       <Table.Cell>Ada</Table.Cell>
 *     </Table.Row>
 *   </Table.Body>
 * </Table.Root>
 * ```
 */
export const Table = {
  Root: TableRoot,
  Header: TableHeader,
  Body: TableBody,
  Row: TableRow,
  Head: TableHead,
  Cell: TableCell,
  VirtualBody: TableVirtualBody,
};
