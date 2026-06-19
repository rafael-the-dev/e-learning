"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/data/data-table";
import { Badge } from "@/shared/components/ui/badge";
import type { RefundAnalysisRow } from "@/modules/reports/finance/types";
import { REFUND_STATUS_LABELS } from "@/modules/finance/types";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  REQUESTED: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
  COMPLETED: "outline",
};

function fmt(value: number): string {
  return `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`;
}

function fmtDate(value: Date | string | null): React.ReactNode {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return new Date(value).toLocaleDateString("pt-PT");
}

interface Props {
  queryString: string;
  pageSize?: number;
}

export function RefundAnalysisTable({ queryString, pageSize = 20 }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize });

  const { data, isLoading } = useQuery({
    queryKey: ["report-refund-analysis", queryString, pagination],
    queryFn: async () => {
      const params = new URLSearchParams(queryString);
      params.set("page", String(pagination.pageIndex + 1));
      params.set("pageSize", String(pagination.pageSize));
      const res = await fetch(`/api/reports/finance/refund-analysis?${params}`);
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

  const columns: ColumnDef<RefundAnalysisRow>[] = [
    { accessorKey: "refundNumber", header: "Reembolso", cell: ({ row }) => <span className="text-xs font-medium">{row.original.refundNumber}</span> },
    {
      accessorKey: "studentName",
      header: "Aluno",
      cell: ({ row }) =>
        row.original.studentId ? (
          <Link href={`/students/${row.original.studentId}`} className="text-xs hover:underline">
            {row.original.studentName ?? "—"}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    { accessorKey: "branchName", header: "Filial", cell: ({ row }) => <span className="text-xs">{row.original.branchName ?? "—"}</span> },
    { accessorKey: "courseName", header: "Curso", cell: ({ row }) => <span className="text-xs">{row.original.courseName ?? "—"}</span> },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status] ?? "outline"} className="text-[10px]">
          {REFUND_STATUS_LABELS[row.original.status] ?? row.original.status}
        </Badge>
      ),
    },
    { accessorKey: "amount", header: "Valor", cell: ({ row }) => <span className="text-xs font-medium">{fmt(row.original.amount)}</span> },
    { accessorKey: "createdAt", header: "Criado Em", cell: ({ row }) => <span className="text-xs">{fmtDate(row.original.createdAt)}</span> },
    { accessorKey: "approvedAt", header: "Aprovado Em", cell: ({ row }) => <span className="text-xs">{fmtDate(row.original.approvedAt)}</span> },
    { accessorKey: "completedAt", header: "Concluído Em", cell: ({ row }) => <span className="text-xs">{fmtDate(row.original.completedAt)}</span> },
    {
      accessorKey: "processingDays",
      header: "Dias de Processamento",
      cell: ({ row }) => (
        <span className="text-xs">{row.original.processingDays != null ? `${row.original.processingDays}d` : "—"}</span>
      ),
    },
    {
      accessorKey: "paymentNumber",
      header: "Pagamento",
      cell: ({ row }) => (
        <Link href={`/payments/${row.original.paymentId}`} className="text-xs font-mono hover:underline">
          {row.original.paymentNumber ?? "—"}
        </Link>
      ),
    },
    {
      id: "actions",
      header: "Acções",
      cell: ({ row }) => (
        <Link
          href={`/reports/finance/refunds?search=${encodeURIComponent(row.original.refundNumber)}`}
          className="text-xs text-primary hover:underline whitespace-nowrap"
        >
          Abrir
        </Link>
      ),
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
