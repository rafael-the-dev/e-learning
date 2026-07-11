"use client";

import Link from "next/link";
import { Button } from "@/shared/components/ui/button";
import type { ExamAppealListItemDto } from "@/modules/examinations/types/portal";
import { AppealStatusBadge } from "./status-badges";
import { ExaminationDataTable, type ExaminationColumn } from "./examination-data-table";
import { AllowedActionButton } from "./allowed-action-button";

const fmt = (d: Date | string) => new Date(d).toLocaleDateString("pt-PT");

export function AppealsTable({
  items,
  page,
  pageSize,
  total,
}: {
  items: ExamAppealListItemDto[];
  page: number;
  pageSize: number;
  total: number;
}) {
  const columns: ExaminationColumn<ExamAppealListItemDto>[] = [
    { key: "student", header: "Aluno", render: (a) => (
      <div><div className="font-medium">{a.studentName ?? "—"}</div><div className="text-xs text-muted-foreground">{a.studentNumber ?? a.studentId}</div></div>
    ) },
    { key: "subject", header: "Disciplina", render: (a) => a.subjectName ?? "—" },
    { key: "status", header: "Estado", render: (a) => <AppealStatusBadge status={a.status} /> },
    { key: "reason", header: "Motivo", render: (a) => <span className="line-clamp-2 max-w-xs text-sm">{a.reasonSummary}</span> },
    { key: "createdAt", header: "Submetido", render: (a) => fmt(a.createdAt) },
    { key: "official", header: "Nota oficial atual", render: (a) => (a.currentOfficialScore != null ? a.currentOfficialScore : "—") },
    {
      key: "actions",
      header: "Ações",
      className: "text-right",
      render: (a) => (
        <div className="flex justify-end gap-2">
          <AllowedActionButton allowed={a.allowedActions.canReview} url={`/api/examinations/appeals/${a.appealId}/review`} label="Rever" variant="secondary" hideWhenDisallowed successMessage="Recurso em análise" />
          <Button asChild variant="outline" size="sm">
            <Link href={`/examinations/appeals/${a.appealId}`}>Ver</Link>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <ExaminationDataTable
      columns={columns}
      rows={items}
      rowKey={(a) => a.appealId}
      page={page}
      pageSize={pageSize}
      total={total}
      emptyTitle="Nenhum recurso submetido."
    />
  );
}
