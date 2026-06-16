"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/data/data-table";
import { Badge } from "@/shared/components/ui/badge";
import { PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/modules/finance/types";
import type { PaymentsReportRow } from "@/modules/reports/finance/types";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  CONFIRMED: "default",
  PARTIALLY_REFUNDED: "secondary",
  REFUNDED: "destructive",
  CANCELLED: "destructive",
};

const columns: ColumnDef<PaymentsReportRow>[] = [
  {
    accessorKey: "paymentNumber",
    header: "Nº Pagamento",
    cell: ({ row }) => (
      <Link href={`/payments/${row.original.paymentId}`} className="font-mono text-xs hover:underline text-primary">
        {row.original.paymentNumber}
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
    accessorKey: "invoiceNumber",
    header: "Nº Fatura",
    cell: ({ row }) =>
      row.original.invoiceId ? (
        <Link href={`/invoices/${row.original.invoiceId}`} className="font-mono text-xs hover:underline">
          {row.original.invoiceNumber ?? "—"}
        </Link>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "branchName",
    header: "Filial",
    cell: ({ row }) => row.original.branchName ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: "totalAmount",
    header: "Valor Bruto",
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.original.totalAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN</span>
    ),
  },
  {
    accessorKey: "refundedAmount",
    header: "Reembolsado",
    cell: ({ row }) =>
      row.original.refundedAmount > 0 ? (
        <span className="font-mono text-sm text-red-600">-{row.original.refundedAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "netAmount",
    header: "Valor Líquido",
    cell: ({ row }) => (
      <span className="font-mono text-sm font-semibold text-emerald-600">{row.original.netAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN</span>
    ),
  },
  {
    accessorKey: "paymentMethods",
    header: "Métodos",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.paymentMethods.map((m) => (
          <Badge key={m} variant="outline" className="text-[10px]">
            {PAYMENT_METHOD_LABELS[m] ?? m}
          </Badge>
        ))}
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "Estado",
    cell: ({ row }) => (
      <Badge variant={STATUS_VARIANT[row.original.status] ?? "outline"}>
        {PAYMENT_STATUS_LABELS[row.original.status] ?? row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: "paymentDate",
    header: "Data",
    cell: ({ row }) => new Date(row.original.paymentDate).toLocaleDateString("pt-PT"),
  },
];

interface Props {
  queryString: string;
}

export function PaymentsReportTable({ queryString }: Props) {
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
    queryKey: ["report-payments", queryString, pagination],
    queryFn: async () => {
      const params = new URLSearchParams(queryString);
      params.set("page", String(pagination.pageIndex + 1));
      params.set("pageSize", String(pagination.pageSize));
      const res = await fetch(`/api/reports/finance/payments?${params}`);
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
