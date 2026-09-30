"use client";

import type { ReactNode } from "react";
import { Columns3 } from "lucide-react";
import { Button } from "../button";
import { Checkbox } from "../checkbox";
import { Popover } from "../popover";

export interface DataTableColumnPickerColumn {
  id: string;
  label: string;
  hideable?: boolean;
}

export interface DataTableColumnPickerProps {
  columns: readonly DataTableColumnPickerColumn[];
  hiddenColumns: readonly string[];
  onHiddenColumnsChange: (hidden: string[]) => void;
  /** Trigger label (localize it). */
  label: string;
  /** Optional custom trigger content; defaults to an icon + `label` button. */
  trigger?: ReactNode;
}

/**
 * DataTableColumnPicker shows/hides DataTable columns. Columns with
 * `hideable: false` stay visible, and the last visible column cannot be
 * hidden. It is a sibling of the table (toolbar slot), sharing
 * `hiddenColumns` state owned by the consumer.
 */
export function DataTableColumnPicker({
  columns,
  hiddenColumns,
  onHiddenColumnsChange,
  label,
  trigger,
}: DataTableColumnPickerProps) {
  const hidden = new Set(hiddenColumns);
  const visibleCount = columns.filter((column) => !hidden.has(column.id)).length;

  const toggle = (id: string, visible: boolean) => {
    onHiddenColumnsChange(visible ? hiddenColumns.filter((c) => c !== id) : [...hiddenColumns, id]);
  };

  return (
    <Popover.Root placement="bottom-end">
      <Popover.Trigger>
        {trigger ? (
          <span className="inline-flex">{trigger}</span>
        ) : (
          <Button variant="ghost" size="sm" startIcon={<Columns3 aria-hidden="true" className="h-4 w-4" />}>
            {label}
          </Button>
        )}
      </Popover.Trigger>
      <Popover.Content aria-label={label} className="min-w-48 p-2">
        <div role="group" aria-label={label} className="flex flex-col gap-1">
          {columns.map((column) => {
            const visible = !hidden.has(column.id);
            const locked = column.hideable === false || (visible && visibleCount <= 1);
            return (
              <Checkbox
                key={column.id}
                label={column.label}
                checked={visible}
                disabled={locked}
                onCheckedChange={(checked) => toggle(column.id, checked)}
                className="rounded-md px-2 py-1 hover:bg-hover"
              />
            );
          })}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}
