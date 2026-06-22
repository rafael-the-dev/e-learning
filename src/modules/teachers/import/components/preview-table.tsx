"use client";

import * as React from "react";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/data/data-table";
import { Badge } from "@/shared/components/ui/badge";
import { IMPORT_ROW_STATE_LABELS } from "@/modules/teachers/import/types";
import type { ImportRowResult, ImportRowState } from "@/modules/teachers/import/types";

const STATE_BADGE_VARIANT: Record<ImportRowState, "success" | "warning" | "destructive"> = {
  VALID: "success",
  WARNING: "warning",
  ERROR: "destructive",
};

const columns: ColumnDef<ImportRowResult>[] = [
  { accessorKey: "rowNumber", header: "Linha" },
  {
    id: "name",
    header: "Nome",
    cell: ({ row }) => `${row.original.data.firstName} ${row.original.data.lastName ?? ""}`.trim(),
  },
  {
    id: "email",
    header: "Email",
    cell: ({ row }) => row.original.data.email || "—",
  },
  {
    id: "phone",
    header: "Telefone",
    cell: ({ row }) => row.original.data.phone || "—",
  },
  {
    id: "documentNumber",
    header: "Documento",
    cell: ({ row }) => row.original.data.documentNumber || "—",
  },
  {
    id: "specialization",
    header: "Especialização",
    cell: ({ row }) => row.original.data.specialization || "—",
  },
  {
    id: "state",
    header: "Estado",
    cell: ({ row }) => (
      <Badge variant={STATE_BADGE_VARIANT[row.original.state]}>
        {IMPORT_ROW_STATE_LABELS[row.original.state]}
      </Badge>
    ),
  },
  {
    id: "messages",
    header: "Mensagens",
    cell: ({ row }) =>
      row.original.messages.length > 0 ? (
        <span className="text-xs text-muted-foreground">{row.original.messages.join("; ")}</span>
      ) : (
        "—"
      ),
  },
];

interface PreviewTableProps {
  rows: ImportRowResult[];
}

export function PreviewTable({ rows }: PreviewTableProps) {
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });

  const pageRows = React.useMemo(() => {
    const start = pagination.pageIndex * pagination.pageSize;
    return rows.slice(start, start + pagination.pageSize);
  }, [rows, pagination]);

  return (
    <DataTable
      columns={columns}
      data={pageRows}
      totalRows={rows.length}
      pagination={pagination}
      onPaginationChange={setPagination}
    />
  );
}
