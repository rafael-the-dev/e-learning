"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/data/data-table";
import { Badge } from "@/shared/components/ui/badge";
import type { StudentDebtRow } from "@/modules/reports/finance/types";

const columns: ColumnDef<StudentDebtRow>[] = [
  {
    accessorKey: "studentName",
    header: "Aluno",
    cell: ({ row }) => (
      <Link href={`/students/${row.original.studentId}`} className="hover:underline font-medium">
        {row.original.studentName}
        {row.original.studentCode && (
          <span className="text-muted-foreground text-xs font-normal ml-1">({row.original.studentCode})</span>
        )}
      </Link>
    ),
  },
  {
    accessorKey: "courseNames",
    header: "Cursos",
    cell: ({ row }) =>
      row.original.courseNames.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {row.original.courseNames.map((c) => (
            <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
          ))}
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "totalInvoiced",
    header: "Total Faturado",
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.totalInvoiced.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN
      </span>
    ),
  },
  {
    accessorKey: "totalPaid",
    header: "Total Pago",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-emerald-600">
        {row.original.totalPaid.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN
      </span>
    ),
  },
  {
    accessorKey: "outstandingBalance",
    header: "Saldo em Aberto",
    cell: ({ row }) => (
      <span className="font-mono text-sm font-semibold text-orange-600">
        {row.original.outstandingBalance.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN
      </span>
    ),
  },
  {
    accessorKey: "overdueBalance",
    header: "Saldo Vencido",
    cell: ({ row }) =>
      row.original.overdueBalance > 0 ? (
        <span className="font-mono text-sm font-semibold text-red-600">
          {row.original.overdueBalance.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      ),
  },
  {
    accessorKey: "invoiceCount",
    header: "Faturas",
    cell: ({ row }) => <span className="text-sm">{row.original.invoiceCount}</span>,
  },
  {
    accessorKey: "longestOverdueDays",
    header: "Máx. Dias em Atraso",
    cell: ({ row }) =>
      row.original.longestOverdueDays > 0 ? (
        <Badge variant={row.original.longestOverdueDays > 90 ? "destructive" : "secondary"} className="text-[10px]">
          {row.original.longestOverdueDays}d
        </Badge>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      ),
  },
];

interface Props {
  queryString: string;
}

export function StudentDebtTable({ queryString }: Props) {
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
    queryKey: ["report-student-debt", queryString, pagination],
    queryFn: async () => {
      const params = new URLSearchParams(queryString);
      params.set("page", String(pagination.pageIndex + 1));
      params.set("pageSize", String(pagination.pageSize));
      const res = await fetch(`/api/reports/finance/student-debt?${params}`);
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
