"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/data/data-table";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import type { WalletLiabilityRow } from "@/modules/reports/finance/types";

function fmt(value: number): string {
  return `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`;
}

interface Props {
  queryString: string;
  pageSize?: number;
}

export function WalletLiabilityTable({ queryString, pageSize = 20 }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize });

  const { data, isLoading } = useQuery({
    queryKey: ["report-wallet-liability", queryString, pagination],
    queryFn: async () => {
      const params = new URLSearchParams(queryString);
      params.set("page", String(pagination.pageIndex + 1));
      params.set("pageSize", String(pagination.pageSize));
      const res = await fetch(`/api/reports/finance/wallet-liability?${params}`);
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

  const columns: ColumnDef<WalletLiabilityRow>[] = [
    {
      accessorKey: "studentName",
      header: "Aluno",
      cell: ({ row }) => (
        <div>
          <span className="text-xs font-medium">{row.original.studentName}</span>
          {row.original.studentCode && (
            <span className="text-[10px] text-muted-foreground ml-1">({row.original.studentCode})</span>
          )}
        </div>
      ),
    },
    { accessorKey: "branchName", header: "Filial", cell: ({ row }) => <span className="text-xs">{row.original.branchName}</span> },
    { accessorKey: "courseName", header: "Curso", cell: ({ row }) => <span className="text-xs">{row.original.courseName}</span> },
    {
      accessorKey: "currentBalance",
      header: "Saldo Actual",
      cell: ({ row }) => {
        const negative = row.original.currentBalance < 0;
        return (
          <div className="flex items-center gap-1.5">
            <span className={cn("text-xs font-medium", negative && "text-destructive")}>
              {fmt(row.original.currentBalance)}
            </span>
            {negative && <Badge variant="destructive" className="text-[10px]">Negativo</Badge>}
          </div>
        );
      },
    },
    { accessorKey: "creditsIssued", header: "Créditos Emitidos", cell: ({ row }) => <span className="text-xs">{fmt(row.original.creditsIssued)}</span> },
    { accessorKey: "creditsConsumed", header: "Créditos Consumidos", cell: ({ row }) => <span className="text-xs">{fmt(row.original.creditsConsumed)}</span> },
    { accessorKey: "netMovement", header: "Movimento Líquido", cell: ({ row }) => <span className="text-xs">{fmt(row.original.netMovement)}</span> },
    {
      accessorKey: "lastTransactionDate",
      header: "Última Transacção",
      cell: ({ row }) => (
        <span className="text-xs">
          {row.original.lastTransactionDate ? new Date(row.original.lastTransactionDate).toLocaleDateString("pt-PT") : "—"}
        </span>
      ),
    },
    {
      accessorKey: "daysDormant",
      header: "Dias Dormente",
      cell: ({ row }) => <span className="text-xs">{row.original.daysDormant ?? "—"}</span>,
    },
    { accessorKey: "transactionCount", header: "Nº Transacções", cell: ({ row }) => <span className="text-xs">{row.original.transactionCount}</span> },
    {
      id: "actions",
      header: "Acções",
      cell: ({ row }) => (
        <Button asChild variant="outline" size="sm" className="h-6 text-[10px]">
          <Link href={`/reports/finance/wallets?studentId=${row.original.studentId}`}>Ver Carteira</Link>
        </Button>
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
