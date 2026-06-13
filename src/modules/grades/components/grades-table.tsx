"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { DataTable } from "@/shared/components/data/data-table";
import { STUDENT_RESULT_STATUS_LABELS, GRADE_COMPONENT_TYPE_LABELS } from "@/modules/grades/types";
import { ClipboardList } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { GradeRow } from "@/modules/grades/services/grade-metrics.service";
import type { PaginatedResult } from "@/shared/types/common";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  GRADED: "default",
  SUBMITTED: "secondary",
  DRAFT: "outline",
};

function buildColumns(): ColumnDef<GradeRow>[] {
  return [
    {
      accessorKey: "student",
      header: "Aluno",
      cell: ({ row }) => {
        const s = row.original.student;
        return (
          <div>
            <div className="font-medium text-sm">
              {[s.firstName, s.lastName].filter(Boolean).join(" ")}
            </div>
            {s.code && (
              <div className="text-xs text-muted-foreground font-mono">{s.code}</div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "subject",
      header: "Disciplina",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.subject.name}</span>
      ),
    },
    {
      accessorKey: "assessmentComponent",
      header: "Componente",
      cell: ({ row }) => {
        const c = row.original.assessmentComponent;
        return (
          <div>
            <div className="text-sm">{c.name}</div>
            <div className="text-xs text-muted-foreground">
              {GRADE_COMPONENT_TYPE_LABELS[c.componentType] ?? c.componentType}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "grade",
      header: () => <div className="text-right">Nota</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-sm">
          {row.original.grade} / {row.original.maxGrade}
        </div>
      ),
    },
    {
      accessorKey: "normalizedGrade",
      header: () => <div className="text-right">%</div>,
      cell: ({ row }) => {
        const pct = row.original.normalizedGrade;
        const color = pct >= 60 ? "text-emerald-600" : pct >= 40 ? "text-amber-600" : "text-red-600";
        return (
          <div className={`text-right font-mono text-sm font-medium ${color}`}>
            {pct.toFixed(1)}%
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status] ?? "outline"} className="text-xs">
          {STUDENT_RESULT_STATUS_LABELS[row.original.status] ?? row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "gradedAt",
      header: "Data",
      cell: ({ row }) =>
        row.original.gradedAt
          ? new Date(row.original.gradedAt).toLocaleDateString("pt-PT")
          : <span className="text-muted-foreground">—</span>,
    },
  ];
}

interface Props {
  result: PaginatedResult<GradeRow>;
}

export function GradesTable({ result }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function goToPage(pageIndex: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(pageIndex + 1));
    router.push(`?${params.toString()}`);
  }

  const columns = React.useMemo(() => buildColumns(), []);

  if (result.data.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList className="size-8" />}
        title="Nenhuma nota encontrada"
        description="Ajuste os filtros ou lance a primeira nota."
      />
    );
  }

  return (
    <DataTable
      columns={columns}
      data={result.data}
      totalRows={result.total}
      pagination={{ pageIndex: result.page - 1, pageSize: result.pageSize }}
      onPaginationChange={(p) => goToPage(p.pageIndex)}
    />
  );
}
