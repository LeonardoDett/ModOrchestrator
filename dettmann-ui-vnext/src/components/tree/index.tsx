"use client";

import {
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { cn } from "../../utils/cn";

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
  className,
  ...props
}: TreeProps<T>) {
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
      aria-multiselectable={false}
      className={cn("select-none py-1", className)}
      {...props}
    >
      {visibleNodes.map((current, index) => {
        const { node, depth, position, setSize } = current;
        const hasChildren = Boolean(node.children?.length);
        const open = expanded.has(node.id);
        const selected = node.id === selectedId;
        const icon =
          node.icon ??
          renderIcon?.(node, open) ??
          (hasChildren ? open ? <FolderOpen /> : <Folder /> : <File />);

        return (
          <div
            key={node.id}
            role="treeitem"
            aria-expanded={hasChildren ? open : undefined}
            aria-selected={selected}
            aria-level={depth + 1}
            aria-posinset={position}
            aria-setsize={setSize}
          >
            <div
              className={cn(
                "group flex min-h-9 items-center gap-1 rounded-md px-2",
                selected
                  ? "bg-primary-subtle text-primary-text"
                  : "text-fg hover:bg-hover",
                node.disabled && "opacity-50",
              )}
              style={{ paddingLeft: depth * indent + 8 }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  aria-label={open ? "Collapse" : "Expand"}
                  aria-expanded={open}
                  disabled={node.disabled}
                  onClick={() => toggle(node.id)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-hover"
                >
                  <ChevronRight
                    aria-hidden="true"
                    className={cn(
                      "h-4 w-4 transition-transform",
                      open && "rotate-90",
                    )}
                  />
                </button>
              ) : (
                <span aria-hidden="true" className="h-7 w-7 shrink-0" />
              )}
              <button
                ref={(element) => {
                  itemRefs.current[node.id] = element;
                }}
                type="button"
                disabled={node.disabled}
                onClick={() => onSelect?.(node)}
                onKeyDown={(event) => handleItemKeyDown(event, current, index)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded py-1 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span aria-hidden="true" className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">
                  {icon}
                </span>
                <span className="truncate">{node.label}</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
