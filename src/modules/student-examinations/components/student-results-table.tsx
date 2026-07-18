import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
import type { StudentExamResultListItemDto } from "@/modules/student-examinations/types";
import { ResultCodeBadge, formatExamDate } from "./student-exam-status-labels";

// Published-results table. The normalized score is ALWAYS "Percentagem do exame"
// / "Percentagem" — never a final subject grade. Each row drills down into the
// Phase 2 result-details page.

export function StudentResultsTable({
  items,
  emptyTitle = "Ainda não tens resultados publicados.",
  emptyDescription = "Os resultados aparecem aqui assim que forem oficialmente publicados pela tua escola.",
}: {
  items: StudentExamResultListItemDto[];
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
            <TableHead>Nota</TableHead>
            <TableHead>Percentagem</TableHead>
            <TableHead>Resultado</TableHead>
            <TableHead>Publicado</TableHead>
            <TableHead className="w-1 text-right">Ações</TableHead>
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
              <TableCell className="text-right">
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/student/examinations/results/${item.examResultId}`}>
                    Ver resultado <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
