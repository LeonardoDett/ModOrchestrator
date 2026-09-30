"use client";

import { useMemo, type ComponentPropsWithoutRef, type KeyboardEvent, type ReactNode } from "react";
import { File, Folder, MoreHorizontal } from "lucide-react";
import { cn } from "../../utils/cn";
import { Checkbox } from "../checkbox";
import { Badge } from "../badge";

export interface FileListItem {
  id: string;
  name: string;
  kind?: "file" | "folder";
  path?: string;
  size?: number;
  status?: ReactNode;
  metadata?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
}

export interface FileListProps
  extends Omit<ComponentPropsWithoutRef<"div">, "onChange"> {
  items: readonly FileListItem[];
  selection?: "none" | "single" | "multiple";
  selectedIds?: ReadonlySet<string>;
  onSelectedIdsChange?: (ids: Set<string>) => void;
  onOpen?: (item: FileListItem) => void;
  renderStatus?: (item: FileListItem) => ReactNode;
  empty?: ReactNode;
  rowActions?: (item: FileListItem) => ReactNode;
}

function formatBytes(size?: number) {
  if (size == null) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function FileList({
  items,
  selection = "multiple",
  selectedIds,
  onSelectedIdsChange,
  onOpen,
  renderStatus,
  empty = "No files",
  rowActions,
  className,
  ...props
}: FileListProps) {
  const ids = useMemo(
    () => selectedIds ?? new Set(items.filter((item) => item.selected).map((item) => item.id)),
    [items, selectedIds],
  );

  const toggle = (id: string) => {
    const next = new Set(ids);
    if (next.has(id)) next.delete(id);
    else if (selection === "single") {
      next.clear();
      next.add(id);
    } else next.add(id);
    onSelectedIdsChange?.(next);
  };

  const all = useMemo(
    () =>
      items.length > 0 &&
      items.every((item) => ids.has(item.id) || item.disabled),
    [items, ids],
  );

  const handleItemKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    item: FileListItem,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onOpen?.(item);
    } else if (event.key === " " && selection !== "none") {
      event.preventDefault();
      toggle(item.id);
    }
  };

  return (
    <div
      className={cn("overflow-hidden rounded-xl border border-border bg-surface", className)}
      {...props}
    >
      {selection === "multiple" && items.length ? (
        <div className="flex h-10 items-center gap-3 border-b border-border px-3">
          <Checkbox
            aria-label="Select all"
            size="sm"
            checked={all}
            onCheckedChange={() => {
              const next = new Set(ids);
              if (all) items.forEach((item) => next.delete(item.id));
              else items.forEach((item) => !item.disabled && next.add(item.id));
              onSelectedIdsChange?.(next);
            }}
          />
          <span className="text-xs font-medium text-fg-muted">
            {ids.size} selected
          </span>
        </div>
      ) : null}

      <div role="list" aria-label="Files" className="divide-y divide-border">
        {items.length ? (
          items.map((item) => {
            const selected = ids.has(item.id);
            return (
              <div
                key={item.id}
                role="listitem"
                aria-selected={selection !== "none" ? selected : undefined}
                className={cn(
                  "group flex min-h-14 items-center gap-3 px-3 py-2",
                  selected ? "bg-primary-subtle" : "hover:bg-hover",
                  item.disabled && "opacity-50",
                )}
              >
                {selection !== "none" ? (
                  <Checkbox
                    aria-label={`Select ${item.name}`}
                    size="sm"
                    checked={selected}
                    disabled={item.disabled}
                    onCheckedChange={() => toggle(item.id)}
                  />
                ) : null}

                <button
                  type="button"
                  disabled={item.disabled}
                  onClick={() => selection !== "none" && toggle(item.id)}
                  onDoubleClick={() => onOpen?.(item)}
                  onKeyDown={(event) => handleItemKeyDown(event, item)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sunken text-fg-muted">
                    {item.kind === "folder" ? <Folder aria-hidden="true" /> : <File aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">
                      {item.name}
                    </span>
                    {item.path ? (
                      <span className="block truncate text-xs text-fg-muted">
                        {item.path}
                      </span>
                    ) : null}
                  </span>
                  {item.metadata ??
                    (item.size != null ? (
                      <span className="shrink-0 text-xs text-fg-muted">
                        {formatBytes(item.size)}
                      </span>
                    ) : null)}
                </button>

                {renderStatus?.(item) ??
                  (item.status ? (
                    <Badge size="sm" variant="soft">
                      {item.status}
                    </Badge>
                  ) : null)}

                {rowActions?.(item) ? (
                  <div className="shrink-0">{rowActions(item)}</div>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className="p-10 text-center text-sm text-fg-muted">{empty}</div>
        )}
      </div>
    </div>
  );
}
