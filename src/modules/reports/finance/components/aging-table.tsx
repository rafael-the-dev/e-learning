"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/data/data-table";
import { Badge } from "@/shared/components/ui/badge";
import { AGING_BUCKET_LABELS } from "@/modules/reports/finance/types";
import type { AgingRow } from "@/modules/reports/finance/types";

const BUCKET_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  current: "outline",
  "1-30": "secondary",
  "31-60": "default",
  "61-90": "destructive",
  "90+": "destructive",
};

const columns: ColumnDef<AgingRow>[] = [
  {
    accessorKey: "invoiceNumber",
    header: "Nº Fatura",
    cell: ({ row }) => (
      <Link href={`/invoices/${row.original.invoiceId}`} className="font-mono text-xs hover:underline text-primary">
        {row.original.invoiceNumber}
      </Link>
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
    accessorKey: "courseName",
    header: "Curso",
    cell: ({ row }) => row.original.courseName ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: "branchName",
    header: "Filial",
    cell: ({ row }) => row.original.branchName ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: "dueDate",
    header: "Vencimento",
    cell: ({ row }) =>
      row.original.dueDate
        ? new Date(row.original.dueDate).toLocaleDateString("pt-PT")
        : <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: "balanceAmount",
    header: "Saldo",
    cell: ({ row }) => (
      <span className="font-mono text-sm font-semibold text-red-600">
        {row.original.balanceAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN
      </span>
    ),
  },
  {
    accessorKey: "daysOverdue",
    header: "Dias em Atraso",
    cell: ({ row }) => (
      <span className={row.original.daysOverdue > 0 ? "text-red-600 font-medium" : "text-muted-foreground"}>
        {row.original.daysOverdue > 0 ? `${row.original.daysOverdue}d` : "—"}
      </span>
    ),
  },
  {
    accessorKey: "agingBucket",
    header: "Escalão",
    cell: ({ row }) => (
      <Badge variant={BUCKET_VARIANT[row.original.agingBucket] ?? "outline"}>
        {AGING_BUCKET_LABELS[row.original.agingBucket] ?? row.original.agingBucket}
      </Badge>
    ),
  },
];

interface Props {
  queryString: string;
}

export function AgingTable({ queryString }: Props) {
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
    queryKey: ["report-aging", queryString, pagination],
    queryFn: async () => {
      const params = new URLSearchParams(queryString);
      params.set("page", String(pagination.pageIndex + 1));
      params.set("pageSize", String(pagination.pageSize));
      const res = await fetch(`/api/reports/finance/aging?${params}`);
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
