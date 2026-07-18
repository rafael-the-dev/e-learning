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
import type { StudentExamAppealListItemDto } from "@/modules/student-examinations/types";
import {
  AppealStatusBadge,
  AppealDecisionBadge,
  formatExamDate,
} from "./student-exam-status-labels";

// The student's own appeals. Each row drills into the appeal detail. Presentational.

export function AppealsTable({ items }: { items: StudentExamAppealListItemDto[] }) {
  if (items.length === 0) {
    return (
      <ExaminationEmptyState
        title="Ainda não submeteste recursos."
        description="Para submeter um recurso, abre um resultado publicado em Resultados e usa “Submeter recurso”."
        action={
          <Button asChild variant="outline" size="sm" className="mt-1">
            <Link href="/student/examinations/results">Ver resultados</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Disciplina</TableHead>
            <TableHead>Data do exame</TableHead>
            <TableHead>Data de submissão</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Decisão</TableHead>
            <TableHead className="w-1 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.appealId}>
              <TableCell className="font-medium">{item.subjectName ?? "—"}</TableCell>
              <TableCell>{item.sessionDate ? formatExamDate(item.sessionDate) : "—"}</TableCell>
              <TableCell>{formatExamDate(item.submittedAt)}</TableCell>
              <TableCell>
                <AppealStatusBadge status={item.status} />
              </TableCell>
              <TableCell>
                {item.publicDecision ? (
                  <AppealDecisionBadge status={item.publicDecision} />
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/student/examinations/appeals/${item.appealId}`}>
                    Ver <ArrowRight className="size-4" />
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
