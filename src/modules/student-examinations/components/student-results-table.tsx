import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { ExaminationEmptyState } from "@/modules/examinations/components/examination-states";
import type { StudentExamResultListItemDto } from "@/modules/student-examinations/types";
import { ResultCodeBadge, formatExamDate } from "./student-exam-status-labels";

// Published-results table. The normalized score is ALWAYS "Percentagem do exame"
// / "Percentagem" — never a final subject grade. Result-details drill-down is
// Phase 2, so there is no row link yet.

export function StudentResultsTable({
  items,
  emptyTitle = "Ainda não tens resultados publicados.",
}: {
  items: StudentExamResultListItemDto[];
  emptyTitle?: string;
}) {
  if (items.length === 0) {
    return <ExaminationEmptyState title={emptyTitle} />;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Disciplina</TableHead>
            <TableHead>Nota</TableHead>
            <TableHead>Percentagem</TableHead>
            <TableHead>Resultado</TableHead>
            <TableHead>Publicado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.examResultId}>
              <TableCell className="font-medium">{item.subjectName ?? "—"}</TableCell>
              <TableCell className="tabular-nums">
                {item.score != null ? `${item.score}/${item.maxScore}` : "—"}
              </TableCell>
              <TableCell className="tabular-nums">
                {item.normalizedScore != null ? `${item.normalizedScore}%` : "—"}
              </TableCell>
              <TableCell>
                <ResultCodeBadge status={item.resultCode} />
              </TableCell>
              <TableCell>{item.publishedAt ? formatExamDate(item.publishedAt) : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
