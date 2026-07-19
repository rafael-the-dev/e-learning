import Link from "next/link";
import { Button } from "@/shared/components/ui/button";
import { ExaminationEmptyState } from "@/modules/examinations/components/examination-states";
import {
  ExaminationDataTable,
  type ExaminationColumn,
} from "@/modules/examinations/components/examination-data-table";
import type { TeacherExamSessionListItemDto } from "@/modules/teacher-examinations/types";
import { SessionStatusBadge, RoleBadge, formatExamDate, formatExamTime } from "./teacher-exam-status-labels";

// Assigned-sessions list — server-data-driven, URL-param pagination (reuses the
// shared ExaminationDataTable). Read-only: the only row action is "Ver" (detail).

const columns: ExaminationColumn<TeacherExamSessionListItemDto>[] = [
  {
    key: "title",
    header: "Sessão",
    render: (row) => <span className="font-medium">{row.title}</span>,
  },
  {
    key: "subject",
    header: "Disciplina",
    render: (row) => row.subjectName ?? "—",
  },
  {
    key: "datetime",
    header: "Data/Hora",
    render: (row) => (
      <span className="whitespace-nowrap">
        {formatExamDate(row.startsAt)} · {formatExamTime(row.startsAt)}
      </span>
    ),
  },
  {
    key: "room",
    header: "Sala",
    render: (row) => row.roomName ?? "—",
  },
  {
    key: "role",
    header: "Papel",
    render: (row) => <RoleBadge status={row.role} />,
  },
  {
    key: "candidates",
    header: "Candidatos",
    className: "tabular-nums",
    render: (row) => row.candidateCount,
  },
  {
    key: "attendance",
    header: "Presenças",
    className: "tabular-nums",
    render: (row) => `${row.attendanceMarked}/${row.candidateCount}`,
  },
  {
    key: "results",
    header: "Resultados",
    className: "tabular-nums",
    render: (row) => `${row.resultsSubmitted}/${row.candidateCount}`,
  },
  {
    key: "status",
    header: "Estado",
    render: (row) => <SessionStatusBadge status={row.sessionStatus} />,
  },
  {
    key: "nextAction",
    header: "Próxima acção",
    render: (row) => row.nextAction ?? "—",
  },
  {
    key: "actions",
    header: "Ações",
    className: "text-right",
    render: (row) => (
      <Button asChild variant="outline" size="sm">
        <Link href={`/teacher/examinations/sessions/${row.examSessionId}`}>Ver</Link>
      </Button>
    ),
  },
];

export function TeacherSessionsTable({
  items,
  page,
  pageSize,
  total,
  filtered = false,
}: {
  items: TeacherExamSessionListItemDto[];
  page: number;
  pageSize: number;
  total: number;
  filtered?: boolean;
}) {
  if (items.length === 0) {
    return filtered ? (
      <ExaminationEmptyState
        title="Nenhuma sessão corresponde aos filtros."
        description="Ajusta ou limpa os filtros para ver as tuas sessões atribuídas."
      />
    ) : (
      <ExaminationEmptyState
        title="Não tens sessões de exame atribuídas."
        description="As atribuições de sessões de exame são feitas pela secretaria. Quando fores designado como vigilante ou corretor, as sessões aparecerão aqui."
      />
    );
  }

  return (
    <ExaminationDataTable
      columns={columns}
      rows={items}
      rowKey={(row) => row.examSessionId}
      page={page}
      pageSize={pageSize}
      total={total}
    />
  );
}
