"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/data/data-table";
import { Badge } from "@/shared/components/ui/badge";
import { REFUND_METHOD_LABELS, REFUND_STATUS_LABELS } from "@/modules/finance/types";
import type { RefundsReportRow } from "@/modules/reports/finance/types";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  REQUESTED: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
  COMPLETED: "outline",
};

const columns: ColumnDef<RefundsReportRow>[] = [
  {
    accessorKey: "refundNumber",
    header: "Nº Reembolso",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.refundNumber}</span>
    ),
  },
  {
    accessorKey: "studentName",
    header: "Aluno",
    cell: ({ row }) =>
      row.original.studentId ? (
        <Link href={`/students/${row.original.studentId}`} className="hover:underline">
          {row.original.studentName ?? "—"}
        </Link>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "paymentNumber",
    header: "Nº Pagamento",
    cell: ({ row }) => (
      <Link href={`/payments/${row.original.paymentId}`} className="font-mono text-xs hover:underline">
        {row.original.paymentNumber ?? "—"}
      </Link>
    ),
  },
  {
    accessorKey: "receiptNumber",
    header: "Nº Recibo",
    cell: ({ row }) =>
      row.original.receiptNumber ? (
        <span className="font-mono text-xs">{row.original.receiptNumber}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "amount",
    header: "Valor",
    cell: ({ row }) => (
      <span className="font-mono text-sm font-semibold">{row.original.amount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN</span>
    ),
  },
  {
    accessorKey: "refundMethod",
    header: "Método",
    cell: ({ row }) => (
      <Badge variant="outline">{REFUND_METHOD_LABELS[row.original.refundMethod] ?? row.original.refundMethod}</Badge>
    ),
  },
  {
    accessorKey: "status",
    header: "Estado",
    cell: ({ row }) => (
      <Badge variant={STATUS_VARIANT[row.original.status] ?? "outline"}>
        {REFUND_STATUS_LABELS[row.original.status] ?? row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: "reason",
    header: "Motivo",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground truncate max-w-[180px] block">
        {row.original.reason ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "requestedAt",
    header: "Solicitado Em",
    cell: ({ row }) => new Date(row.original.requestedAt).toLocaleDateString("pt-PT"),
  },
  {
    accessorKey: "completedAt",
    header: "Concluído Em",
    cell: ({ row }) =>
      row.original.completedAt
        ? new Date(row.original.completedAt).toLocaleDateString("pt-PT")
        : <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: "branchName",
    header: "Filial",
    cell: ({ row }) => row.original.branchName ?? <span className="text-muted-foreground">—</span>,
  },
];

interface Props {
  queryString: string;
}

export function RefundsReportTable({ queryString }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);

  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: page - 1,
    pageSize,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["report-refunds", queryString, pagination],
    queryFn: async () => {
      const params = new URLSearchParams(queryString);
      params.set("page", String(pagination.pageIndex + 1));
      params.set("pageSize", String(pagination.pageSize));
      const res = await fetch(`/api/reports/finance/refunds?${params}`);
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
