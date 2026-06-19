"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/data/data-table";
import { Badge } from "@/shared/components/ui/badge";
import type { TaxReportRow } from "@/modules/reports/finance/types";
import { INVOICE_STATUS_LABELS } from "@/modules/finance/types";

function fmt(value: number): string {
  return `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`;
}

interface Props {
  queryString: string;
  pageSize?: number;
}

export function TaxTable({ queryString, pageSize = 20 }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize });

  const { data, isLoading } = useQuery({
    queryKey: ["report-taxes", queryString, pagination],
    queryFn: async () => {
      const params = new URLSearchParams(queryString);
      params.set("page", String(pagination.pageIndex + 1));
      params.set("pageSize", String(pagination.pageSize));
      const res = await fetch(`/api/reports/finance/taxes?${params}`);
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

  const columns: ColumnDef<TaxReportRow>[] = [
    { accessorKey: "invoiceNumber", header: "Nº Fatura", cell: ({ row }) => <span className="text-xs font-medium">{row.original.invoiceNumber}</span> },
    { accessorKey: "studentName", header: "Aluno", cell: ({ row }) => <span className="text-xs">{row.original.studentName ?? "—"}</span> },
    { accessorKey: "branchName", header: "Filial", cell: ({ row }) => <span className="text-xs">{row.original.branchName ?? "—"}</span> },
    { accessorKey: "taxRuleName", header: "Regra Fiscal", cell: ({ row }) => <span className="text-xs">{row.original.taxRuleName}</span> },
    { accessorKey: "taxRate", header: "Taxa", cell: ({ row }) => <span className="text-xs">{row.original.taxRate.toFixed(2)}%</span> },
    { accessorKey: "taxableBase", header: "Base Tributável", cell: ({ row }) => <span className="text-xs">{fmt(row.original.taxableBase)}</span> },
    { accessorKey: "taxAmount", header: "Valor de Imposto", cell: ({ row }) => <span className="text-xs font-medium">{fmt(row.original.taxAmount)}</span> },
    { accessorKey: "invoiceTotal", header: "Total da Fatura", cell: ({ row }) => <span className="text-xs">{fmt(row.original.invoiceTotal)}</span> },
    {
      accessorKey: "issueDate",
      header: "Data de Emissão",
      cell: ({ row }) => <span className="text-xs">{new Date(row.original.issueDate).toLocaleDateString("pt-PT")}</span>,
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <Badge variant="secondary" className="text-[10px]">{INVOICE_STATUS_LABELS[row.original.status] ?? row.original.status}</Badge>,
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
