import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Button } from "@/shared/components/ui/button";
import { ExaminationEmptyState } from "@/modules/examinations/components/examination-states";
import type { StudentExamListItemDto } from "@/modules/student-examinations/types";
import {
  SessionStatusBadge,
  formatExamDate,
  formatExamTime,
  formatExamDuration,
} from "./student-exam-status-labels";

// Full "Próximos exames" list. Server-renderable — a row action links to the
// exam detail keyed by examCandidateId.

export function UpcomingExamsTable({
  items,
  emptyTitle = "Não tens exames agendados.",
  emptyDescription = "Quando fores inscrito num exame, ele aparecerá aqui com a data, a hora e a sala.",
}: {
  items: StudentExamListItemDto[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (items.length === 0) {
    return <ExaminationEmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Disciplina</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Hora</TableHead>
            <TableHead>Sala</TableHead>
            <TableHead>Duração</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.examCandidateId}>
              <TableCell className="font-medium">{item.subjectName ?? item.title}</TableCell>
              <TableCell>{formatExamDate(item.startsAt)}</TableCell>
              <TableCell>{formatExamTime(item.startsAt)}</TableCell>
              <TableCell>{item.roomName ?? "—"}</TableCell>
              <TableCell>{formatExamDuration(item.durationMinutes) ?? "—"}</TableCell>
              <TableCell>
                <SessionStatusBadge status={item.sessionStatus} />
              </TableCell>
              <TableCell className="text-right">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/student/examinations/${item.examCandidateId}`}>Ver detalhes</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
