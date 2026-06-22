"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { ExternalLink, History } from "lucide-react";
import { DataTable } from "@/shared/components/data/data-table";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  IMPORT_JOB_TYPE_LABELS,
  IMPORT_JOB_STATUS_LABELS,
} from "@/modules/import-jobs/types";
import type { ImportJobListItem, ImportJobStatus } from "@/modules/import-jobs/types";
import type { PaginatedResult } from "@/shared/types/common";

const STATUS_BADGE_VARIANT: Record<ImportJobStatus, "success" | "warning" | "info" | "destructive"> = {
  PENDING: "warning",
  VALIDATED: "info",
  PROCESSING: "info",
  COMPLETED: "success",
  FAILED: "destructive",
};

const columns: ColumnDef<ImportJobListItem>[] = [
  {
    id: "type",
    header: "Tipo",
    cell: ({ row }) => IMPORT_JOB_TYPE_LABELS[row.original.type] ?? row.original.type,
  },
  {
    id: "uploadedFileName",
    header: "Ficheiro",
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.uploadedFileName}</span>,
  },
  {
    id: "status",
    header: "Estado",
    cell: ({ row }) => (
      <Badge variant={STATUS_BADGE_VARIANT[row.original.status]}>
        {IMPORT_JOB_STATUS_LABELS[row.original.status]}
      </Badge>
    ),
  },
  {
    accessorKey: "totalRows",
    header: "Linhas",
  },
  {
    id: "successRows",
    header: "Sucesso",
    cell: ({ row }) => <span className="text-emerald-600 font-medium">{row.original.successRows}</span>,
  },
  {
    id: "failedRows",
    header: "Falhas",
    cell: ({ row }) => <span className="text-red-600 font-medium">{row.original.failedRows}</span>,
  },
  {
    id: "uploadedByName",
    header: "Importado Por",
    cell: ({ row }) => row.original.uploadedByName ?? "—",
  },
  {
    id: "createdAt",
    header: "Criado Em",
    cell: ({ row }) => row.original.createdAt.toLocaleString("pt-PT"),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <div className="flex justify-end">
        <Button asChild variant="ghost" size="icon" className="size-8">
          <Link href={`/settings/import-jobs/${row.original.id}`}>
            <ExternalLink className="size-4" />
          </Link>
        </Button>
      </div>
    ),
  },
];

interface ImportJobsTableProps {
  result: PaginatedResult<ImportJobListItem>;
}

export function ImportJobsTable({ result }: ImportJobsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function goToPage(pageIndex: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(pageIndex + 1));
    router.push(`?${params.toString()}`);
  }

  if (result.data.length === 0) {
    return (
      <EmptyState
        icon={<History className="size-8" />}
        title="Nenhuma importação encontrada"
        description="Ajuste os filtros ou realize a primeira importação."
      />
    );
  }

  return (
    <DataTable
      columns={columns}
      data={result.data}
      totalRows={result.total}
      pagination={{ pageIndex: result.page - 1, pageSize: result.pageSize }}
      onPaginationChange={(p) => goToPage(p.pageIndex)}
    />
  );
}
