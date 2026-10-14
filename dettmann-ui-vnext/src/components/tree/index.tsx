"use client";

import {
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronRightIcon } from "../../icons/glyphs/chevron-right";
import { FileIcon } from "../../icons/glyphs/file";
import { FolderIcon } from "../../icons/glyphs/folder";
import { FolderOpenIcon } from "../../icons/glyphs/folder-open";
import { cn } from "../../utils/cn";
import { Checkbox } from "../checkbox";
import { toggleTreeCheck, treeCheckState } from "./tree.model";

export { toggleTreeCheck, treeCheckState, treeLeafIds } from "./tree.model";
export type { CheckableNode, TreeCheckState } from "./tree.model";

export interface TreeNode<T = unknown> {
  id: string;
  label: ReactNode;
  children?: readonly TreeNode<T>[];
  data?: T;
  icon?: ReactNode;
  disabled?: boolean;
}

interface VisibleTreeNode<T> {
  node: TreeNode<T>;
  depth: number;
  parentId?: string;
  position: number;
  setSize: number;
}

export interface TreeProps<T = unknown>
  extends Omit<ComponentPropsWithoutRef<"div">, "onSelect"> {
  nodes: readonly TreeNode<T>[];
  expanded?: ReadonlySet<string>;
  defaultExpanded?: ReadonlySet<string>;
  onExpandedChange?: (next: Set<string>) => void;
  selectedId?: string;
  onSelect?: (node: TreeNode<T>) => void;
  indent?: number;
  renderIcon?: (node: TreeNode<T>, expanded: boolean) => ReactNode;
  /**
   * Batch selection: leaf ids that are checked. When set, every node shows
   * a checkbox; a branch checks or clears all of its leaves (Space toggles
   * the focused node).
   */
  checkedIds?: ReadonlySet<string>;
  onCheckedIdsChange?: (next: Set<string>) => void;
  /** Extra column at the end of each row (e.g. a select per node). */
  renderEnd?: (node: TreeNode<T>) => ReactNode;
  /**
   * `list` (default): rounded rows that float on the surface. `rows`: a
   * table of 34 px rows edge to edge, with a line between them and 24 px
   * side padding, for a tree with columns (`renderEnd`) under a header.
   */
  variant?: "list" | "rows";
  labels?: TreeLabels;
}

export interface TreeLabels {
  expand?: string;
  collapse?: string;
  /** Accessible name of a node's checkbox. */
  check?: (node: TreeNode<unknown>) => string;
}

export function Tree<T>({
  nodes,
  expanded: controlledExpanded,
  defaultExpanded,
  onExpandedChange,
  selectedId,
  onSelect,
  indent = 16,
  renderIcon,
  checkedIds,
  onCheckedIdsChange,
  renderEnd,
  variant = "list",
  labels,
  className,
  ...props
}: TreeProps<T>) {
  const rows = variant === "rows";
  const checkable = checkedIds !== undefined;
  const toggleCheck = (node: TreeNode<T>) => {
    if (!checkedIds || node.disabled) return;
    onCheckedIdsChange?.(toggleTreeCheck(node, checkedIds));
  };
  const [internal, setInternal] = useState<Set<string>>(
    new Set(defaultExpanded),
  );
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const expanded = controlledExpanded ?? internal;

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setInternal(next);
    onExpandedChange?.(next);
  };

  const visibleNodes = useMemo<VisibleTreeNode<T>[]>(() => {
    const output: VisibleTreeNode<T>[] = [];

    const visit = (
      items: readonly TreeNode<T>[],
      depth: number,
      parentId?: string,
    ) => {
      items.forEach((node, index) => {
        output.push({
          node,
          depth,
          parentId,
          position: index + 1,
          setSize: items.length,
        });
        if (expanded.has(node.id) && node.children?.length) {
          visit(node.children, depth + 1, node.id);
        }
      });
    };

    visit(nodes, 0);
    return output;
  }, [expanded, nodes]);

  const focusVisibleNode = (index: number) => {
    const item = visibleNodes[index];
    if (!item || item.node.disabled) return;
    itemRefs.current[item.node.id]?.focus();
  };

  const handleItemKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    current: VisibleTreeNode<T>,
    index: number,
  ) => {
    const hasChildren = Boolean(current.node.children?.length);
    const isExpanded = expanded.has(current.node.id);

    if (event.key === " " && checkable) {
      event.preventDefault();
      toggleCheck(current.node);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      for (let next = index + 1; next < visibleNodes.length; next += 1) {
        if (!visibleNodes[next]?.node.disabled) {
          focusVisibleNode(next);
          break;
        }
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      for (let previous = index - 1; previous >= 0; previous -= 1) {
        if (!visibleNodes[previous]?.node.disabled) {
          focusVisibleNode(previous);
          break;
        }
      }
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (hasChildren && !isExpanded) {
        toggle(current.node.id);
      } else if (hasChildren) {
        focusVisibleNode(index + 1);
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (hasChildren && isExpanded) {
        toggle(current.node.id);
        return;
      }
      if (current.parentId) {
        const parentIndex = visibleNodes.findIndex(
          (item) => item.node.id === current.parentId,
        );
        if (parentIndex >= 0) focusVisibleNode(parentIndex);
      }
    }
  };

  return (
    <div
      role="tree"
      aria-multiselectable={checkable}
      className={cn(rows ? "select-none" : "select-none py-1", className)}
      {...props}
    >
      {visibleNodes.map((current, index) => {
        const { node, depth, position, setSize } = current;
        const hasChildren = Boolean(node.children?.length);
        const open = expanded.has(node.id);
        const selected = node.id === selectedId;
        const check = checkedIds ? treeCheckState(node, checkedIds) : undefined;
        const icon =
          node.icon ??
          renderIcon?.(node, open) ??
          (hasChildren ? open ? <FolderOpenIcon size="lg" /> : <FolderIcon size="lg" /> : <FileIcon size="lg" />);

        return (
          <div
            key={node.id}
            role="treeitem"
            aria-expanded={hasChildren ? open : undefined}
            aria-selected={selected}
            aria-level={depth + 1}
            aria-posinset={position}
            aria-setsize={setSize}
            aria-checked={check === undefined ? undefined : check === "indeterminate" ? "mixed" : check === "checked"}
          >
            <div
              className={cn(
                rows
                  ? "group relative flex h-8.5 items-center gap-1 border-b border-border-subtle pr-6 motion-transition"
                  : "group relative flex min-h-control-sm items-center gap-1 rounded-chip px-2 motion-transition",
                // Uma cor de texto e um fundo por estado (o `cn` não resolve conflito).
                node.disabled ? "text-fg-subtle" : "text-fg",
                selected
                  ? "bg-selected before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-pill before:bg-brand-fill"
                  : !node.disabled && "hover:bg-state-hover",
              )}
              style={{ paddingLeft: depth * indent + (rows ? 24 : 8) }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  aria-label={open ? (labels?.collapse ?? "Collapse") : (labels?.expand ?? "Expand")}
                  aria-expanded={open}
                  disabled={node.disabled}
                  onClick={() => toggle(node.id)}
                  className="flex size-6 shrink-0 items-center justify-center rounded-chip motion-transition hover:bg-state-hover focus-ring-inset"
                >
                  <ChevronRightIcon
                    size="sm"
                    className={cn(
                      "transition-transform duration-(--motion-duration) ease-(--motion-ease)",
                      open && "rotate-90",
                    )}
                  />
                </button>
              ) : (
                <span aria-hidden="true" className="size-6 shrink-0" />
              )}
              {checkable ? (
                <Checkbox
                  size="sm"
                  tabIndex={-1}
                  className="mr-1"
                  aria-label={labels?.check?.(node as TreeNode<unknown>) ?? (typeof node.label === "string" ? node.label : node.id)}
                  disabled={node.disabled}
                  checked={check === "checked"}
                  indeterminate={check === "indeterminate"}
                  onCheckedChange={() => toggleCheck(node)}
                />
              ) : null}
              <button
                ref={(element) => {
                  itemRefs.current[node.id] = element;
                }}
                type="button"
                disabled={node.disabled}
                onClick={() => onSelect?.(node)}
                onKeyDown={(event) => handleItemKeyDown(event, current, index)}
                className="flex min-w-0 flex-1 items-center gap-2 self-stretch rounded-chip text-left text-sm focus-ring-inset"
              >
                <span aria-hidden="true" className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">
                  {icon}
                </span>
                <span className="truncate">{node.label}</span>
              </button>
              {renderEnd ? <div className={cn("flex shrink-0 items-center", rows ? "gap-3" : "gap-2")}>{renderEnd(node)}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
