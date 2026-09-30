import { useMemo, useState } from "react";
import { DataTable, DataTableColumnPicker, type DataTableColumn, type DataTableSort } from "dettmann-ui";
import type { Operation } from "../../bridge/types";
import { useSettings } from "../../app/settings-context";
import { useI18n } from "../../i18n/i18n";
import { OperationStatusBadge, operationDuration, operationKindLabel, operationStepLabel } from "./operation-labels";

interface OperationsTableProps {
  operations: readonly Operation[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Shows the column picker above the table. */
  columnPicker?: boolean;
  className?: string;
}

const SORTABLE: Record<string, (op: Operation) => string> = {
  started: (op) => op.startedAt ?? op.createdAt,
  status: (op) => op.status,
  operation: (op) => op.kind,
};

/** Recent operations as a DataTable (Dashboard, Diagnostics › Operations). */
export function OperationsTable({ operations, selectedId, onSelect, columnPicker = false, className }: OperationsTableProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const { density } = useSettings();
  const [sort, setSort] = useState<DataTableSort | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);

  const columns = useMemo<DataTableColumn<Operation>[]>(
    () => [
      { id: "operation", label: t("operations.column.operation"), cell: (op) => operationKindLabel(i18n, op.kind), width: 200, grow: true, sortable: true },
      { id: "status", label: t("operations.column.status"), cell: (op) => <OperationStatusBadge status={op.status} />, width: 150, sortable: true },
      {
        id: "step",
        label: t("operations.column.step"),
        cell: (op) => {
          const step = op.currentStep ?? op.error?.step;
          return step ? operationStepLabel(i18n, step) : t("common.empty");
        },
        width: 160,
      },
      { id: "started", label: t("operations.column.started"), cell: (op) => i18n.formatDateTime(op.startedAt ?? op.createdAt), width: 190, sortable: true, numeric: true },
      { id: "duration", label: t("operations.column.duration"), cell: (op) => operationDuration(i18n, op.startedAt, op.finishedAt), width: 110, numeric: true },
    ],
    [i18n, t],
  );

  // Presentation-only ordering of rows the backend already returned.
  const rows = useMemo(() => {
    if (!sort) return operations;
    const key = SORTABLE[sort.columnId];
    if (!key) return operations;
    const sorted = [...operations].sort((a, b) => key(a).localeCompare(key(b)));
    return sort.direction === "desc" ? sorted.reverse() : sorted;
  }, [operations, sort]);

  return (
    <div className={className ?? "flex min-h-0 flex-col gap-2"}>
      {columnPicker ? (
        <div className="flex justify-end">
          <DataTableColumnPicker label={t("table.columns")} columns={columns} hiddenColumns={hidden} onHiddenColumnsChange={setHidden} />
        </div>
      ) : null}
      <DataTable
        aria-label={t("operations.title")}
        className="min-h-0 flex-1"
        columns={columns}
        rows={rows}
        getRowId={(op) => op.id}
        hiddenColumns={hidden}
        sort={sort}
        onSortChange={setSort}
        density={density}
        selectionMode={onSelect ? "single" : "none"}
        selectedIds={selectedId ? new Set([selectedId]) : new Set()}
        onSelectedIdsChange={(ids) => onSelect?.(ids.values().next().value ?? null)}
        labels={{ resizeColumn: t("table.resizeColumn"), loading: t("common.loading") }}
      />
    </div>
  );
}
