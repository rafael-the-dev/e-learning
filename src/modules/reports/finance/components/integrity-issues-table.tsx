"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/data/data-table";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  INTEGRITY_SEVERITY_LABELS,
  INTEGRITY_CATEGORY_LABELS,
  INTEGRITY_STATUS_LABELS,
} from "@/modules/finance/types";
import { ResolveIntegrityIssueDialog } from "./resolve-integrity-issue-dialog";
import type { IntegrityReportRow } from "@/modules/reports/finance/types";

const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  CRITICAL: "destructive",
  HIGH: "destructive",
  MEDIUM: "secondary",
  LOW: "outline",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  OPEN: "destructive",
  ACKNOWLEDGED: "secondary",
  RESOLVED: "default",
  SUPPRESSED: "outline",
};

interface Props {
  queryString: string;
  canResolve: boolean;
}

export function IntegrityIssuesTable({ queryString, canResolve }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);

  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: page - 1,
    pageSize,
  });

  const [resolveDialog, setResolveDialog] = React.useState<{
    open: boolean;
    issueId: string;
    checkName: string;
  }>({ open: false, issueId: "", checkName: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["report-integrity", queryString, pagination],
    queryFn: async () => {
      const params = new URLSearchParams(queryString);
      params.set("page", String(pagination.pageIndex + 1));
      params.set("pageSize", String(pagination.pageSize));
      const res = await fetch(`/api/reports/finance/integrity?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar relatório");
      return res.json();
    },
  });

  function handlePaginationChange(next: PaginationState) {
    setPagination(next);
    const params = new URLSearchParams(queryString);
    params.set("page", String(next.pageIndex + 1));
    params.set("pageSize", String(next.pageSize));
    router.push(`${pathname}?${params.toString()}`);
  }

  const columns: ColumnDef<IntegrityReportRow>[] = [
    {
      accessorKey: "severity",
      header: "Severidade",
      cell: ({ row }) => (
        <Badge variant={SEVERITY_VARIANT[row.original.severity] ?? "outline"} className="text-[10px]">
          {INTEGRITY_SEVERITY_LABELS[row.original.severity] ?? row.original.severity}
        </Badge>
      ),
    },
    {
      accessorKey: "category",
      header: "Categoria",
      cell: ({ row }) => (
        <span className="text-xs">{INTEGRITY_CATEGORY_LABELS[row.original.category] ?? row.original.category}</span>
      ),
    },
    {
      accessorKey: "entityType",
      header: "Entidade",
      cell: ({ row }) => (
        <div className="text-xs">
          <span className="font-medium">{row.original.entityType}</span>
          <span className="text-muted-foreground ml-1 font-mono text-[10px] truncate max-w-24 block">
            {row.original.entityId}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "description",
      header: "Descrição",
      cell: ({ row }) => (
        <div className="max-w-72 text-xs text-muted-foreground leading-tight">
          <p className="font-medium text-foreground mb-0.5">{row.original.checkName}</p>
          <p>{row.original.description}</p>
          {row.original.expectedValue && (
            <p className="mt-1">
              <span className="text-muted-foreground">Esperado:</span>{" "}
              <span className="font-mono">{row.original.expectedValue}</span>
              {row.original.actualValue && (
                <>
                  {" / "}
                  <span className="text-muted-foreground">Real:</span>{" "}
                  <span className="font-mono text-destructive">{row.original.actualValue}</span>
                </>
              )}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "detectedAt",
      header: "Detectado Em",
      cell: ({ row }) => (
        <span className="text-xs">{new Date(row.original.detectedAt).toLocaleDateString("pt-PT")}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status] ?? "outline"} className="text-[10px]">
          {INTEGRITY_STATUS_LABELS[row.original.status] ?? row.original.status}
        </Badge>
      ),
    },
    ...(canResolve
      ? [
          {
            id: "actions",
            header: "Acções",
            cell: ({ row }: { row: { original: IntegrityReportRow } }) => {
              const isTerminal = row.original.status === "RESOLVED" || row.original.status === "SUPPRESSED";
              if (isTerminal) return <span className="text-xs text-muted-foreground">—</span>;
              return (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() =>
                    setResolveDialog({
                      open: true,
                      issueId: row.original.id,
                      checkName: row.original.checkName,
                    })
                  }
                >
                  Actualizar
                </Button>
              );
            },
          } as ColumnDef<IntegrityReportRow>,
        ]
      : []),
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        totalRows={data?.total ?? 0}
        pagination={pagination}
        onPaginationChange={handlePaginationChange}
        isLoading={isLoading}
      />
      <ResolveIntegrityIssueDialog
        open={resolveDialog.open}
        onOpenChange={(open) => setResolveDialog((prev) => ({ ...prev, open }))}
        issueId={resolveDialog.issueId}
        checkName={resolveDialog.checkName}
        onResolved={() => {
          queryClient.invalidateQueries({ queryKey: ["report-integrity"] });
        }}
      />
    </>
  );
}
