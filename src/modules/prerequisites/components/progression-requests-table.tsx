"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { type ColumnDef, type PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/data/data-table";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { ExternalLink } from "lucide-react";
import type { ProgressionRequestListItem } from "@/modules/prerequisites/repositories/level-progression-request.repository";
import {
  PROGRESSION_REQUEST_DECISION_LABELS,
  PROGRESSION_MODE_LABELS,
} from "@/modules/prerequisites/types";

const DECISION_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
};

function formatDate(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString("pt-PT") : "—";
}

const columns: ColumnDef<ProgressionRequestListItem>[] = [
  {
    accessorKey: "studentName",
    header: "Aluno",
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.studentName || "—"}</p>
        {row.original.studentCode && (
          <p className="text-xs text-muted-foreground font-mono">{row.original.studentCode}</p>
        )}
      </div>
    ),
  },
  {
    accessorKey: "courseName",
    header: "Curso",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.courseName}</span>,
  },
  {
    id: "transition",
    header: "De / Para",
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        <span className="text-muted-foreground">{row.original.fromLevelName}</span>
        <span className="mx-1.5 text-muted-foreground">→</span>
        <span className="font-medium">{row.original.toLevelName}</span>
      </span>
    ),
  },
  {
    accessorKey: "progressionMode",
    header: "Modo",
    cell: ({ row }) =>
      row.original.progressionMode ? (
        <span className="text-xs text-muted-foreground">
          {PROGRESSION_MODE_LABELS[row.original.progressionMode] ?? row.original.progressionMode}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "decision",
    header: "Estado",
    cell: ({ row }) => (
      <Badge variant={DECISION_BADGE_VARIANT[row.original.decision] ?? "outline"} className="text-xs">
        {PROGRESSION_REQUEST_DECISION_LABELS[row.original.decision] ?? row.original.decision}
      </Badge>
    ),
  },
  {
    accessorKey: "requestedAt",
    header: "Pedido em",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground tabular-nums">{formatDate(row.original.requestedAt)}</span>
    ),
  },
  {
    id: "review",
    header: "Revisão",
    cell: ({ row }) => (
      <div className="text-xs text-muted-foreground">
        {row.original.reviewedAt ? (
          <>
            <p className="tabular-nums">{formatDate(row.original.reviewedAt)}</p>
            {row.original.reviewedByName && <p>{row.original.reviewedByName}</p>}
          </>
        ) : (
          "—"
        )}
      </div>
    ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <Button asChild variant="outline" size="sm">
        <Link href={`/academic/progression-requests/${row.original.id}`}>
          <ExternalLink className="size-3.5 mr-1" />
          Rever
        </Link>
      </Button>
    ),
  },
];

interface Props {
  data: ProgressionRequestListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export function ProgressionRequestsTable({ data, total, page, pageSize }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pagination: PaginationState = { pageIndex: page - 1, pageSize };

  function goToPage(next: PaginationState) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(next.pageIndex + 1));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={total}
      pagination={pagination}
      onPaginationChange={goToPage}
    />
  );
}
