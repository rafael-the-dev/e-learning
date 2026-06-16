"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/data/data-table";
import { Badge } from "@/shared/components/ui/badge";
import { INSTALLMENT_STATUS_LABELS } from "@/modules/finance/types";
import type { CollectionsRow } from "@/modules/reports/finance/types";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  OVERDUE: "destructive",
  PARTIALLY_PAID: "secondary",
  PENDING: "outline",
  PAID: "default",
};

const columns: ColumnDef<CollectionsRow>[] = [
  {
    accessorKey: "studentName",
    header: "Aluno",
    cell: ({ row }) =>
      row.original.studentId ? (
        <Link href={`/students/${row.original.studentId}`} className="hover:underline font-medium text-sm">
          {row.original.studentName ?? "—"}
        </Link>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "courseName",
    header: "Curso",
    cell: ({ row }) => (
      <span className="text-xs">{row.original.courseName ?? <span className="text-muted-foreground">—</span>}</span>
    ),
  },
  {
    accessorKey: "invoiceNumber",
    header: "Nº Fatura",
    cell: ({ row }) => (
      <Link href={`/invoices/${row.original.invoiceId}`} className="font-mono text-xs hover:underline">
        {row.original.invoiceNumber}
      </Link>
    ),
  },
  {
    accessorKey: "paymentPlanName",
    header: "Plano",
    cell: ({ row }) => <span className="text-xs">{row.original.paymentPlanName}</span>,
  },
  {
    accessorKey: "installmentNumber",
    header: "Prestação",
    cell: ({ row }) => (
      <span className="text-sm font-mono">#{row.original.installmentNumber}</span>
    ),
  },
  {
    accessorKey: "dueDate",
    header: "Vencimento",
    cell: ({ row }) => (
      <span className="text-xs">{new Date(row.original.dueDate).toLocaleDateString("pt-PT")}</span>
    ),
  },
  {
    accessorKey: "amount",
    header: "Valor",
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.amount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN
      </span>
    ),
  },
  {
    accessorKey: "balanceAmount",
    header: "Saldo",
    cell: ({ row }) => (
      <span className="font-mono text-sm font-semibold text-orange-600">
        {row.original.balanceAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN
      </span>
    ),
  },
  {
    accessorKey: "daysOverdue",
    header: "Dias em Atraso",
    cell: ({ row }) =>
      row.original.daysOverdue > 0 ? (
        <Badge
          variant={row.original.daysOverdue > 90 ? "destructive" : row.original.daysOverdue > 30 ? "secondary" : "outline"}
          className="text-[10px]"
        >
          {row.original.daysOverdue}d
        </Badge>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      ),
  },
  {
    accessorKey: "status",
    header: "Estado",
    cell: ({ row }) => (
      <Badge variant={STATUS_VARIANT[row.original.status] ?? "outline"} className="text-[10px]">
        {INSTALLMENT_STATUS_LABELS[row.original.status] ?? row.original.status}
      </Badge>
    ),
  },
];

interface Props {
  queryString: string;
}

export function CollectionsTable({ queryString }: Props) {
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
    queryKey: ["report-collections", queryString, pagination],
    queryFn: async () => {
      const params = new URLSearchParams(queryString);
      params.set("page", String(pagination.pageIndex + 1));
      params.set("pageSize", String(pagination.pageSize));
      const res = await fetch(`/api/reports/finance/collections?${params}`);
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
