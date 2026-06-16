"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/data/data-table";
import { Badge } from "@/shared/components/ui/badge";
import { WALLET_TRANSACTION_TYPE_LABELS } from "@/modules/finance/types";
import type { WalletActivityRow } from "@/modules/reports/finance/types";

function fmt(v: number) {
  return v.toLocaleString("pt-PT", { minimumFractionDigits: 2 }) + " MZN";
}

const columns: ColumnDef<WalletActivityRow>[] = [
  {
    accessorKey: "studentName",
    header: "Aluno",
    cell: ({ row }) => (
      <Link href={`/students/${row.original.studentId}`} className="hover:underline font-medium">
        {row.original.studentName}
        {row.original.studentCode && (
          <span className="ml-1 text-xs text-muted-foreground font-mono">#{row.original.studentCode}</span>
        )}
      </Link>
    ),
  },
  {
    accessorKey: "currentBalance",
    header: "Saldo Actual",
    cell: ({ row }) => (
      <span className={`font-mono text-sm font-semibold ${row.original.currentBalance > 0 ? "text-emerald-600" : row.original.currentBalance < 0 ? "text-red-600" : "text-muted-foreground"}`}>
        {fmt(row.original.currentBalance)}
      </span>
    ),
  },
  {
    accessorKey: "totalCredits",
    header: "Total Créditos",
    cell: ({ row }) => (
      <span className="font-mono text-sm text-emerald-600">{fmt(row.original.totalCredits)}</span>
    ),
  },
  {
    accessorKey: "totalDebits",
    header: "Total Débitos",
    cell: ({ row }) => (
      <span className="font-mono text-sm text-red-600">{fmt(row.original.totalDebits)}</span>
    ),
  },
  {
    accessorKey: "transactionCount",
    header: "Transacções",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">{row.original.transactionCount.toLocaleString("pt-PT")}</span>
    ),
  },
  {
    accessorKey: "lastTransactionDate",
    header: "Última Transacção",
    cell: ({ row }) =>
      row.original.lastTransactionDate ? (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.lastTransactionDate).toLocaleDateString("pt-PT")}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "lastTransactionType",
    header: "Tipo",
    cell: ({ row }) =>
      row.original.lastTransactionType ? (
        <Badge variant="secondary" className="text-xs">
          {WALLET_TRANSACTION_TYPE_LABELS[row.original.lastTransactionType] ?? row.original.lastTransactionType}
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

interface Props {
  queryString: string;
}

export function WalletActivityTable({ queryString }: Props) {
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
    queryKey: ["report-wallets", queryString, pagination],
    queryFn: async () => {
      const params = new URLSearchParams(queryString);
      params.set("page", String(pagination.pageIndex + 1));
      params.set("pageSize", String(pagination.pageSize));
      const res = await fetch(`/api/reports/finance/wallets?${params}`);
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
