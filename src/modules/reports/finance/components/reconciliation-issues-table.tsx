"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/data/data-table";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { INTEGRITY_SEVERITY_LABELS } from "@/modules/finance/types";
import { RECONCILIATION_ISSUE_LABELS } from "@/modules/reports/finance/types";
import type { ReconciliationIssueType, ReconciliationRow } from "@/modules/reports/finance/types";

const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  CRITICAL: "destructive",
  HIGH: "destructive",
  MEDIUM: "secondary",
  LOW: "outline",
};

const COUNT_BASED_ISSUE_TYPES = new Set<ReconciliationIssueType>(["DUPLICATE_LEDGER_ENTRY"]);

function formatValue(issueType: ReconciliationIssueType, value: number): string {
  if (COUNT_BASED_ISSUE_TYPES.has(issueType)) {
    return value.toLocaleString("pt-PT");
  }
  return `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`;
}

function buildEntityActionHref(entityType: string, entityId: string, entityReference: string): string | null {
  switch (entityType) {
    case "Invoice":
      return `/invoices/${entityId}`;
    case "Receipt":
      return `/receipts/${entityId}`;
    case "Payment":
      return `/payments?search=${encodeURIComponent(entityReference)}`;
    case "Refund":
      return `/reports/finance/refunds?search=${encodeURIComponent(entityReference)}`;
    default:
      return null;
  }
}

interface Props {
  queryKey: string;
  queryString: string;
  lockedIssueTypes?: ReconciliationIssueType[];
  pageSize?: number;
}

export function ReconciliationIssuesTable({ queryKey, queryString, lockedIssueTypes, pageSize = 20 }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize });

  const { data, isLoading } = useQuery({
    queryKey: ["report-reconciliation", queryKey, queryString, lockedIssueTypes, pagination],
    queryFn: async () => {
      const params = new URLSearchParams(queryString);
      if (lockedIssueTypes && lockedIssueTypes.length > 0) {
        params.delete("issueType");
        for (const t of lockedIssueTypes) params.append("issueTypes", t);
      }
      params.set("page", String(pagination.pageIndex + 1));
      params.set("pageSize", String(pagination.pageSize));
      const res = await fetch(`/api/reports/finance/reconciliation?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar relatório");
      return res.json();
    },
  });

  function handlePaginationChange(next: PaginationState) {
    setPagination(next);
    if (queryKey === "main") {
      const params = new URLSearchParams(queryString);
      params.set("page", String(next.pageIndex + 1));
      params.set("pageSize", String(next.pageSize));
      router.push(`${pathname}?${params.toString()}`);
    }
  }

  const columns: ColumnDef<ReconciliationRow>[] = [
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
      accessorKey: "entityType",
      header: "Tipo de Entidade",
      cell: ({ row }) => <span className="text-xs font-medium">{row.original.entityType}</span>,
    },
    {
      accessorKey: "entityReference",
      header: "Referência",
      cell: ({ row }) => <span className="text-xs font-mono">{row.original.entityReference}</span>,
    },
    {
      accessorKey: "expectedAmount",
      header: "Esperado",
      cell: ({ row }) => (
        <span className="text-xs">{formatValue(row.original.issueType, row.original.expectedAmount)}</span>
      ),
    },
    {
      accessorKey: "actualAmount",
      header: "Real",
      cell: ({ row }) => (
        <span className="text-xs">{formatValue(row.original.issueType, row.original.actualAmount)}</span>
      ),
    },
    {
      accessorKey: "difference",
      header: "Diferença",
      cell: ({ row }) => (
        <span className="text-xs font-medium text-destructive">
          {formatValue(row.original.issueType, row.original.difference)}
        </span>
      ),
    },
    {
      accessorKey: "issueType",
      header: "Problema",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground max-w-64 block leading-tight">
          {RECONCILIATION_ISSUE_LABELS[row.original.issueType] ?? row.original.issueType}
        </span>
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
      id: "actions",
      header: "Acções",
      cell: ({ row }) => {
        const href = buildEntityActionHref(row.original.entityType, row.original.entityId, row.original.entityReference);
        if (!href) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <Button asChild variant="outline" size="sm" className="h-6 text-[10px]">
            <Link href={href}>Ver</Link>
          </Button>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data?.rows ?? []}
      totalRows={data?.total ?? 0}
      pagination={pagination}
      onPaginationChange={handlePaginationChange}
      isLoading={isLoading}
    />
  );
}
